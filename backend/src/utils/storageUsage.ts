import type { Knex } from "knex";
import { db } from "@/utils/db";
import fs from "node:fs/promises";
import path from "node:path";
import getPath from "@/utils/getPath";

/**
 * 存储用量记账与配额（分域）。
 *
 * 为什么不能像造物那样扫目录：它每 10 分钟扫一遍 DATA_DIR 下所有 `u-*.json`
 * 才能算出每个账号占了多少（其 media-store.ts:291 uploadUsage），这是为了掩盖
 * O(文件总数) 的开销才加的缓存。我们 canvas-files 原来的做法更糟 —— **每次上传**
 * 都 readdir + 逐文件 stat，一个用户攒到 5000 个文件时，每次上传要做 5000 次磁盘
 * IO，多用户并发下就是灾难。
 *
 * ## 为什么分域而不是一个总量
 *
 * 用户主动上传的素材和平台生成的产物是两种东西：
 *  - `canvas`  用户自己传的（画布素材）。**有硬配额、有删除出口**，因为它是用户
 *              可以自己管理的那部分，配額满了让他删就能恢复；
 *  - `project` 项目里的生成物与素材。数量由「生成了多少」决定，不设配额 ——
 *              对它限额会让用户不敢生成，而生成本来就已经按次计费了；
 *  - `onestop` 一站式合成的成片。
 *
 * 所以配额只落在 `canvas` 域，其余域只记账（`quota_bytes = 0` 表示不限额）。
 * 总量仍然要监控 —— 盘满由 `storageGuard` 的磁盘水位兜底。
 */

/** canvas 域的默认配额 */
export const DEFAULT_QUOTA_BYTES = 1024 * 1024 * 1024; // 1GB
/** 单文件上限 */
export const MAX_FILE_BYTES = 128 * 1024 * 1024;
/** canvas 域文件数上限（防止用大量小文件把 inode 耗尽） */
export const MAX_FILE_COUNT = 5000;

export type StorageScope = "canvas" | "project" | "onestop";

/** 有硬配额的域。其余域只记账。 */
const QUOTA_SCOPES = new Set<StorageScope>(["canvas"]);

export interface Usage {
  bytes: number;
  fileCount: number;
  /** 0 表示该域不限额 */
  quotaBytes: number;
}

let schema: Promise<void> | undefined;

/**
 * 建表 / 迁移。
 * 早期版本是 `user_id` 单主键，没有 scope 列。那版只在开发期存在过、无生产数据，
 * 检测到就整表重建，不做逐行迁移（迁移逻辑本身比数据更值钱）。
 */
export function ensureStorageUsageTable(): Promise<void> {
  return (schema ||= (async () => {
    if (await db.schema.hasTable("xoi_storage_usage")) {
      const hasScope = await db.schema.hasColumn("xoi_storage_usage", "scope");
      if (hasScope) return;
      await db.schema.dropTable("xoi_storage_usage");
    }
    await db.schema.createTable("xoi_storage_usage", (t) => {
      t.bigInteger("user_id").notNullable();
      t.string("scope", 16).notNullable();
      t.bigInteger("bytes").notNullable().defaultTo(0);
      t.integer("file_count").notNullable().defaultTo(0);
      t.bigInteger("quota_bytes").notNullable().defaultTo(0);
      t.bigInteger("updated_at").notNullable().defaultTo(0);
      t.primary(["user_id", "scope"]);
      t.index(["bytes"]);
      t.index(["scope", "bytes"]);
    });
  })().catch((e) => {
    schema = undefined;
    throw e;
  }));
}

/** canvas-files 下该用户的目录 */
export function userCanvasDir(userId: number): string {
  return path.join(getPath("oss"), "canvas-files", String(userId));
}

/** 统计一个目录的字节数与文件数（只用于单用户目录的一次性回填） */
async function measureDir(dir: string): Promise<{ bytes: number; fileCount: number }> {
  let bytes = 0;
  let fileCount = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        const st = await fs.stat(path.join(dir, entry.name));
        if (st.isFile()) {
          bytes += st.size;
          fileCount++;
        }
      } catch {
        // 读到一半被删：忽略，不因此中断
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return { bytes, fileCount };
}

/**
 * 首次见到某个账号的 canvas 域时回填一次初值。
 * 只扫该用户自己的目录，且一生只发生一次。
 */
async function backfillCanvas(userId: number): Promise<Usage> {
  const measured = await measureDir(userCanvasDir(userId));
  await db("xoi_storage_usage")
    .insert({
      user_id: userId,
      scope: "canvas",
      bytes: measured.bytes,
      file_count: measured.fileCount,
      quota_bytes: DEFAULT_QUOTA_BYTES,
      updated_at: Date.now(),
    })
    .onConflict(["user_id", "scope"])
    .ignore();
  return { ...measured, quotaBytes: DEFAULT_QUOTA_BYTES };
}

/** 读某域用量。canvas 域第一次读会回填。 */
export async function getUsage(userId: number, scope: StorageScope = "canvas"): Promise<Usage> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw Object.assign(new Error("账号无效"), { status: 401 });
  await ensureStorageUsageTable();
  const row = await db("xoi_storage_usage").where({ user_id: userId, scope }).first();
  if (!row) {
    if (scope === "canvas") return backfillCanvas(userId);
    return { bytes: 0, fileCount: 0, quotaBytes: 0 };
  }
  return {
    bytes: Number(row.bytes),
    fileCount: Number(row.file_count),
    quotaBytes: Number(row.quota_bytes),
  };
}

/** 该账号全部域的汇总（「我的空间」与管理端都用这个口径） */
export async function getTotalUsage(userId: number) {
  const canvas = await getUsage(userId, "canvas");
  await ensureStorageUsageTable();
  const rows = await db("xoi_storage_usage").where({ user_id: userId });
  const byScope: Record<string, { bytes: number; fileCount: number }> = {};
  let bytes = 0;
  let fileCount = 0;
  for (const row of rows) {
    const entry = { bytes: Number(row.bytes), fileCount: Number(row.file_count) };
    byScope[String(row.scope)] = entry;
    bytes += entry.bytes;
    fileCount += entry.fileCount;
  }
  return { bytes, fileCount, quotaBytes: canvas.quotaBytes, byScope };
}

export class StorageQuotaError extends Error {
  constructor(message: string, public status = 413) {
    super(message);
  }
}

/** 给用户看的容量单位：配额很小时不能显示成 0.00GB */
export function formatBytes(bytes: number): string {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n}B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  return `${(n / 1024 ** 3).toFixed(2)}GB`;
}

export interface ReserveOptions {
  scope?: StorageScope;
  isAdmin?: boolean;
}

/**
 * 预留空间。检查配额 → 通过后立刻记账。
 *
 * 必须在一个事务里先 `FOR UPDATE` 锁行再判断，否则两个并发上传会各自读到同一个
 * 旧值、各自通过检查、各自累加 —— 这就是最典型的「配额在并发下失效」。
 * 行不存在时先插一条 0 再锁，保证第一次上传也走同一条路径。
 *
 * 非配额域（project / onestop）只记账不判断，走同一条 UPSERT 以保证原子。
 */
export async function reserve(userId: number, bytes: number, options: ReserveOptions = {}): Promise<void> {
  const { scope = "canvas", isAdmin = false } = options;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw Object.assign(new Error("账号无效"), { status: 401 });
  const size = Math.max(0, Math.floor(bytes));
  await ensureStorageUsageTable();

  // 不限额的域：一条 UPSERT 就够，不需要行锁
  if (!QUOTA_SCOPES.has(scope)) {
    await bump(userId, scope, size, 1);
    return;
  }

  if (isAdmin) {
    // 管理员不受个人配额限制（磁盘水位由 storageGuard 单独把关）
    await bump(userId, scope, size, 1);
    return;
  }

  await db.transaction(async (trx) => {
    await trx("xoi_storage_usage")
      .insert({
        user_id: userId,
        scope,
        bytes: 0,
        file_count: 0,
        quota_bytes: DEFAULT_QUOTA_BYTES,
        updated_at: Date.now(),
      })
      .onConflict(["user_id", "scope"])
      .ignore();

    const row = await trx("xoi_storage_usage").where({ user_id: userId, scope }).forUpdate().first();
    const used = Number(row?.bytes ?? 0);
    const count = Number(row?.file_count ?? 0);
    const quota = Number(row?.quota_bytes ?? 0) || DEFAULT_QUOTA_BYTES;

    if (count >= MAX_FILE_COUNT) {
      throw new StorageQuotaError(`文件数量已达 ${MAX_FILE_COUNT} 个上限，请先清理不用的素材`);
    }
    if (used + size > quota) {
      throw new StorageQuotaError(
        `空间不足：已用 ${formatBytes(used)} / 上限 ${formatBytes(quota)}，请先删除不用的素材再上传`,
      );
    }

    await trx("xoi_storage_usage")
      .where({ user_id: userId, scope })
      .update({
        bytes: trx.raw("bytes + ?", [size]),
        file_count: trx.raw("file_count + 1", []),
        updated_at: Date.now(),
      });
  });
}

async function bump(userId: number, scope: StorageScope, bytes: number, files: number) {
  await db("xoi_storage_usage")
    .insert({
      user_id: userId,
      scope,
      bytes: Math.max(0, bytes),
      file_count: Math.max(0, files),
      quota_bytes: QUOTA_SCOPES.has(scope) ? DEFAULT_QUOTA_BYTES : 0,
      updated_at: Date.now(),
    })
    .onConflict(["user_id", "scope"])
    .merge({
      bytes: db.raw("xoi_storage_usage.bytes + ?", [bytes]),
      file_count: db.raw("xoi_storage_usage.file_count + ?", [files]),
      updated_at: Date.now(),
    });
}

/**
 * 删除文件后释放记账。
 * 用 GREATEST 兜底：即便记账因为历史原因偏大，也不能减成负数。
 */
export async function release(userId: number, bytes: number, scope: StorageScope = "canvas"): Promise<void> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return;
  await ensureStorageUsageTable();
  await db("xoi_storage_usage")
    .where({ user_id: userId, scope })
    .update({
      bytes: db.raw("GREATEST(0, bytes - ?)", [Math.max(0, Math.floor(bytes))]),
      file_count: db.raw("GREATEST(0, file_count - 1)", []),
      updated_at: Date.now(),
    });
}

/** 运营/管理员调整某人的 canvas 域配额 */
export async function setQuota(userId: number, quotaBytes: number): Promise<void> {
  await ensureStorageUsageTable();
  const quota = Math.max(0, Math.floor(quotaBytes));
  await db("xoi_storage_usage")
    .insert({
      user_id: userId,
      scope: "canvas",
      bytes: 0,
      file_count: 0,
      quota_bytes: quota,
      updated_at: Date.now(),
    })
    .onConflict(["user_id", "scope"])
    .merge({ quota_bytes: quota, updated_at: Date.now() });
}

/** 容量报表：按用户汇总所有域，占用最高的 N 个 */
export async function topUsage(limit = 20) {
  await ensureStorageUsageTable();
  const rows = await db("xoi_storage_usage")
    .select("user_id")
    .sum({ bytes: "bytes" })
    .sum({ fileCount: "file_count" })
    .groupBy("user_id")
    .orderBy("bytes", "desc")
    .limit(Math.min(200, Math.max(1, limit)));
  return rows.map((row: any) => ({
    userId: Number(row.user_id),
    bytes: Number(row.bytes ?? 0),
    fileCount: Number(row.fileCount ?? 0),
  }));
}

/** 全站汇总，给管理端总览用 */
export async function platformUsage() {
  await ensureStorageUsageTable();
  const rows = await db("xoi_storage_usage")
    .select("scope")
    .sum({ bytes: "bytes" })
    .sum({ fileCount: "file_count" })
    .count({ accounts: db.raw("distinct user_id") })
    .groupBy("scope");
  return rows.map((row: any) => ({
    scope: String(row.scope),
    bytes: Number(row.bytes ?? 0),
    fileCount: Number(row.fileCount ?? 0),
    accounts: Number(row.accounts ?? 0),
  }));
}

export { QUOTA_SCOPES };
