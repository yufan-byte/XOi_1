/**
 * 代理商中心配置的文件存储（原子写 + 写入链）。
 * 移植自造物引擎 src/lib/reseller/store.ts（逐字保留；fs 实现，与框架无关）。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_DATA, type ResellerData, type Section, type AuditEntry } from "./types";

// 代理商中心配置：平台一份（reseller.json，站长后台与站点品牌共用），每个代理各一份（reseller-agents/agent-<id>.json）
const FILE = (key: string) => {
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  if (key === "platform") return path.join(dir, "reseller.json");
  if (!/^agent-\d+$/.test(key)) throw new Error("bad store key");
  return path.join(dir, "reseller-agents", `${key}.json`);
};
const cache = new Map<string, ResellerData>();
/** 每个 key 一条写入链：两个请求同时改配置时，一个读到的旧数据不能覆盖掉另一个刚写完的改动，
 *  临时文件也不能同名（同一进程里 pid 相同，重名会让两个写入互相截断，落出半截 JSON）。 */
const writeChain = new Map<string, Promise<unknown>>();
let tmpSeq = 0;

/** 注意：返回的是进程内缓存对象，调用方不得原地修改（要改就整段替换，走 updateSection） */
export async function readData(key = "platform"): Promise<ResellerData> {
  const hit = cache.get(key); if (hit) return hit;
  let d: ResellerData;
  try { const raw = await fs.readFile(FILE(key), "utf8"); d = { ...DEFAULT_DATA, ...(JSON.parse(raw) as Partial<ResellerData>) }; }
  catch (e) {
    // 文件不存在 = 首次运行，用默认值是对的；文件在却读不出来（解析失败 / 权限），静默回落默认值
    // 会把站点品牌、定价、签到池整套清空，下一次写入还会把空值固化。这种情况先找备份，再没有就抛错。
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
      const raw = await fs.readFile(`${FILE(key)}.bak`, "utf8").catch(() => null);
      if (!raw) throw new Error(`配置文件 ${FILE(key)} 损坏且没有可用备份，已停止读取以免覆盖`);
      d = { ...DEFAULT_DATA, ...(JSON.parse(raw) as Partial<ResellerData>) };
      cache.set(key, d); return d;
    }
    d = structuredClone(DEFAULT_DATA);
  }
  cache.set(key, d); return d;
}

async function writeNow(next: ResellerData, key: string) {
  cache.set(key, next); const f = FILE(key); await fs.mkdir(path.dirname(f), { recursive: true });
  // 先写临时文件再改名：中途断电 / 进程被杀不会留下半截 JSON（那会让整站品牌、定价配置回到默认值）
  const tmp = `${f}.${process.pid}.${tmpSeq++}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.copyFile(f, `${f}.bak`).catch(() => {});   // 换上新的之前留一份上一版，供损坏时兜底
  await fs.rename(tmp, f);
}

/** 排到该 key 的写入链尾部执行；链上任何一次失败都不影响后续写入 */
function enqueue<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = writeChain.get(key) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(job);
  writeChain.set(key, run.catch(() => {}));
  return run;
}

export async function writeData(next: ResellerData, key = "platform") {
  return enqueue(key, () => writeNow(next, key));
}
/** 读—改—写整体排队：并发改不同 section 时，后写的不会把先写的抹掉 */
export async function updateSection<K extends Section>(section: K, value: ResellerData[K], key = "platform") {
  return enqueue(key, async () => { const d = await readData(key); const next = { ...d, [section]: value }; await writeNow(next, key); return next; });
}
export async function appendAudit(e: Omit<AuditEntry, "id" | "at">, key = "platform") {
  return enqueue(key, async () => {
    const d = await readData(key); const entry: AuditEntry = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), ...e };
    await writeNow({ ...d, audit: [entry, ...d.audit].slice(0, 500) }, key); return entry;
  });
}
