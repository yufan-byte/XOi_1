import fs from "node:fs/promises";
import path from "node:path";
import getPath from "@/utils/getPath";
import { db } from "@/utils/db";
import { capacityValue } from "@/utils/modelConcurrency";
import { release, userCanvasDir } from "@/utils/storageUsage";

/**
 * 画布素材的孤儿回收。
 *
 * ## 为什么只回收 canvas-files 这一个域
 *
 * `project` 域的素材生命周期本来就绑在项目上（`delProject` 会整体删目录），
 * `onestop` 域的产物由一站式任务表管。只有 `canvas-files` 是「用户随手传、
 * 随手弃」的，没有宿主实体可以依赖 —— 不回收就是只涨不减。
 *
 * ## 与造物的关键差异
 *
 * 造物是「把所有引用表的文档 text 拼起来跑一次全局正则」再和目录做差集
 * （media-retention.ts.referencedIdsQuery）。文档一多就是全表顺序扫描 + 巨型字符串，
 * 而且每轮都要重算所有历史引用。
 *
 * 这里反过来：**先有候选，再判引用**。只用候选集里那几百个文件名去各表做
 * `LIKE ANY(ARRAY[...])`，每张表一轮只扫一次，返回的行再在 Node 侧提名字。
 * 候选永远是「超过 TTL 且没人续期」的那一小撮。
 *
 * ## 安全阀
 *
 * 默认 **dry-run（只报告不删）**。误删用户素材是不可逆的运营事故，
 * 必须让运维先看一轮报告，确认候选名单里没有还在用的东西，再开
 * `XOI_STORAGE_SWEEP_DELETE=1`。
 */

/** 没人引用、也没续期的素材保留多久 */
const TTL_DAYS = capacityValue("XOI_STORAGE_SWEEP_TTL_DAYS", 30, 365);
/** 每轮最多处理多少个候选（避免一次删太多） */
const MAX_PER_ROUND = capacityValue("XOI_STORAGE_SWEEP_MAX", 500, 5000);
/** 扫描间隔 */
const INTERVAL_MS = capacityValue("XOI_STORAGE_SWEEP_MINUTES", 360, 1440) * 60_000;
/** 是否真的删除。默认否。 */
const shouldDelete = () => process.env.XOI_STORAGE_SWEEP_DELETE === "1";

/** 文件名：32 位十六进制 + 白名单扩展名（与 canvas-files 路由的命名一致） */
const NAME_RE = /^([a-f0-9]{32})\.(png|jpe?g|webp|gif|mp4|webm|mp3|wav)$/;

/**
 * 引用方：表 + 文本列。表或列不存在就跳过（功能还没启用过）。
 * 只列真正会存素材地址的地方，宁缺毋滥 —— 漏一个就会误删。
 */
const REF_SOURCES: { table: string; column: string }[] = [
  { table: "xoi_canvas_documents", column: "payload" },
  { table: "xoi_workspace_documents", column: "payload" },
  { table: "xoi_generation_tasks", column: "payload" },
  { table: "o_image", column: "filePath" },
  { table: "o_video", column: "filePath" },
  { table: "o_storyboard", column: "filePath" },
];

let schemaCache: Promise<{ table: string; column: string }[]> | undefined;

/** 只保留真实存在的「表 + 列」组合，缓存一次（列结构不会在运行期变） */
function liveSources() {
  return (schemaCache ||= (async () => {
    const live: { table: string; column: string }[] = [];
    for (const source of REF_SOURCES) {
      try {
        const exists = await db.raw(
          `SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ? LIMIT 1`,
          [source.table, source.column],
        );
        if (exists.rows.length) live.push(source);
      } catch {
        // 查不到就当不存在，宁可少删
      }
    }
    return live;
  })().catch((e) => {
    schemaCache = undefined;
    throw e;
  }));
}

interface Candidate {
  userId: number;
  name: string;
  filePath: string;
  size: number;
  mtimeMs: number;
}

/** 扫 canvas-files 下所有用户目录里「超过 TTL 且没被续期」的文件 */
async function collectCandidates(cutoffMs: number): Promise<Candidate[]> {
  const root = path.join(getPath("oss"), "canvas-files");
  const out: Candidate[] = [];
  let userDirs: string[] = [];
  try {
    userDirs = await fs.readdir(root);
  } catch {
    return out;
  }
  for (const uid of userDirs) {
    if (!/^[1-9]\d{0,15}$/.test(uid)) continue;
    const dir = path.join(root, uid);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!NAME_RE.test(name)) continue;
      const filePath = path.join(dir, name);
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      // mtime 就是「最后一次被用到」的时间；上传和 touch 都会刷新它
      if (stat.mtimeMs > cutoffMs) continue;
      out.push({ userId: Number(uid), name, filePath, size: stat.size, mtimeMs: stat.mtimeMs });
      if (out.length >= MAX_PER_ROUND * 4) return out; // 先粗筛，后面再截断
    }
  }
  return out;
}

/** 从一堆候选文件名里筛出「仍然被引用」的 */
async function findReferenced(names: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();
  if (!names.length) return referenced;
  const sources = await liveSources();
  // LIKE 模式：文件名的 32 位十六进制本身全局唯一，用子串匹配足够精确
  const patterns = names.map((n) => `%${n}%`);
  for (const source of sources) {
    try {
      // 标识符必须走 ?? 转义：o_image 的列是带引号的 "filePath"（早期 knex 建表保留了驼峰），
      // 直接写 filePath 会被 PG 折叠成 filepath 然后报「列不存在」。
      const rows = await db.raw(
        `SELECT ??::text AS text FROM ?? WHERE ??::text LIKE ANY(?::text[])`,
        [source.column, source.table, source.column, patterns],
      );
      for (const row of rows.rows) {
        const text = String(row.text ?? "");
        for (const name of names) {
          if (!referenced.has(name) && text.includes(name)) referenced.add(name);
        }
      }
    } catch (e) {
      // 任何一张表查不动就整轮放弃删除：宁可这轮一个都不删，也不能把被引用的当孤儿
      throw new Error(`引用检查失败（${source.table}.${source.column}）：${(e as Error).message}`);
    }
  }
  return referenced;
}

export interface SweepReport {
  scanned: number;
  expired: number;
  referenced: number;
  deleted: number;
  freedBytes: number;
  dryRun: boolean;
  durationMs: number;
  errors: string[];
}

let running = false;

/**
 * 跨实例互斥。
 *
 * advisory lock 是**会话级**的，knex 池里的 lock 和 unlock 可能落在不同连接上，
 * 那样 unlock 会静默失败、锁永远不释放。所以这里必须显式借一条连接并从头用到尾。
 * 多副本部署时，只有抢到锁的那一个实例真正扫描和删除，其余直接跳过本轮。
 */
async function acquireSweepLock(): Promise<{ allow: boolean; release: () => Promise<void> }> {
  let conn: any;
  try {
    conn = await db.client.acquireConnection();
    const result = await conn.query("SELECT pg_try_advisory_lock(hashtext('xoi:storage-sweep')) AS ok");
    if (!result.rows[0]?.ok) {
      await db.client.releaseConnection(conn);
      return { allow: false, release: async () => {} };
    }
  } catch {
    // 抢不到锁机制本身失败时按「不允许」处理：宁可这轮不扫，也不要两个实例同时删
    if (conn) await db.client.releaseConnection(conn).catch(() => {});
    return { allow: false, release: async () => {} };
  }
  return {
    allow: true,
    release: async () => {
      try {
        await conn.query("SELECT pg_advisory_unlock(hashtext('xoi:storage-sweep'))");
      } catch {
        // 连接已断时锁会随会话结束释放，无需额外处理
      } finally {
        await db.client.releaseConnection(conn).catch(() => {});
      }
    },
  };
}

/** 跑一轮。可被管理接口手动触发。 */
export async function runStorageSweep(): Promise<SweepReport> {
  const startedAt = Date.now();
  const report: SweepReport = {
    scanned: 0,
    expired: 0,
    referenced: 0,
    deleted: 0,
    freedBytes: 0,
    dryRun: !shouldDelete(),
    durationMs: 0,
    errors: [],
  };
  if (running) {
    report.errors.push("上一轮仍在执行，本轮跳过");
    return report;
  }
  running = true;
  const guard = await acquireSweepLock();
  if (!guard.allow) {
    running = false;
    report.errors.push("另一实例正在执行回收，本轮跳过");
    report.durationMs = Date.now() - startedAt;
    return report;
  }
  try {
    const cutoff = Date.now() - TTL_DAYS * 86_400_000;
    const candidates = (await collectCandidates(cutoff)).slice(0, MAX_PER_ROUND);
    report.scanned = candidates.length;
    if (!candidates.length) return report;
    report.expired = candidates.length;

    // 一次查库判活。抛错则整轮不删。
    let referenced = new Set<string>();
    try {
      referenced = await findReferenced(candidates.map((c) => c.name));
    } catch (e) {
      report.errors.push((e as Error).message);
      return report;
    }
    report.referenced = candidates.filter((c) => referenced.has(c.name)).length;

    for (const candidate of candidates) {
      if (referenced.has(candidate.name)) continue;
      if (!report.dryRun) {
        // 删之前再看一眼 mtime：扫库期间刚被 touch 的不删
        try {
          const stat = await fs.stat(candidate.filePath);
          if (stat.mtimeMs > cutoff) continue;
          await fs.unlink(candidate.filePath);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
            report.errors.push(`删除失败 ${candidate.name}: ${(e as Error).message}`);
            continue;
          }
        }
        await release(candidate.userId, candidate.size, "canvas").catch(() => {});
      }
      report.deleted++;
      report.freedBytes += candidate.size;
    }
    return report;
  } finally {
    report.durationMs = Date.now() - startedAt;
    running = false;
    await guard.release();
  }
}

/** 给前端续期：画布打开/保存时把素材的 mtime 刷新，回收从这一刻重新计时 */
export async function touchCanvasMedia(userId: number, names: string[]): Promise<number> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return 0;
  const dir = userCanvasDir(userId);
  const now = new Date();
  let touched = 0;
  for (const name of new Set(names)) {
    if (!NAME_RE.test(name)) continue;
    try {
      await fs.utimes(path.join(dir, name), now, now);
      touched++;
    } catch {
      // 不存在：已删或不是本人的文件
    }
  }
  return touched;
}

let timer: ReturnType<typeof setInterval> | undefined;
let lastReport: SweepReport | undefined;

export function lastSweepReport() {
  return lastReport;
}

export function startStorageSweep() {
  if (timer) return;
  const run = async () => {
    try {
      lastReport = await runStorageSweep();
      if (lastReport.errors.length) {
        console.warn("[storage-sweep] 本轮有问题，未删除的部分保持原样：", lastReport.errors.join("; "));
      } else if (lastReport.expired) {
        console.log(
          `[storage-sweep] ${lastReport.dryRun ? "试运行" : "已执行"}：候选 ${lastReport.expired} 个，` +
            `被引用 ${lastReport.referenced} 个，清理 ${lastReport.deleted} 个，释放 ${(lastReport.freedBytes / 1024 ** 2).toFixed(1)}MB`,
        );
      }
    } catch (e) {
      console.error("[storage-sweep] 本轮失败：", (e as Error).message);
    }
  };
  // 启动后先等 10 分钟再跑第一轮，避开启动高峰
  const first = setTimeout(run, 10 * 60_000);
  first.unref();
  timer = setInterval(run, INTERVAL_MS);
  timer.unref();
}

export function stopStorageSweep() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

export { TTL_DAYS, INTERVAL_MS, MAX_PER_ROUND };
