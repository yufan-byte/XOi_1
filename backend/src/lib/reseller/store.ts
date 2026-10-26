/** Shared PostgreSQL configuration. Legacy JSON is a one-time import source, never deleted. */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {db} from "@/lib/agent/db";
import {PgResellerStore,completeConfig,validConfigKey,ConfigConflict,type ConfigPatchOptions} from "./pg-store";
import { DEFAULT_DATA, type ResellerData, type Section, type AuditEntry } from "./types";

// 代理商中心配置：平台一份（reseller.json，站长后台与站点品牌共用），每个代理各一份（reseller-agents/agent-<id>.json）
const FILE = (key: string) => {
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  if (key === "platform") return path.join(dir, "reseller.json");
  if (!/^agent-\d+$/.test(key)) throw new Error("bad store key");
  return path.join(dir, "reseller-agents", `${key}.json`);
};
let pgStore:PgResellerStore|undefined;
function databaseStore() {
  const pool=db();
  if(pool)return pgStore??=new PgResellerStore(pool,async key=>{
    if(key==="platform"&&["prod","production"].includes(process.env.NODE_ENV||"")&&process.env.XOI_SITE_CONFIG_BOOTSTRAP!=="empty"){
      const exists=await fs.stat(FILE(key)).then(()=>true,e=>{if(e.code!=="ENOENT")throw e;return false;});
      const backup=await fs.stat(`${FILE(key)}.bak`).then(()=>true,e=>{if(e.code!=="ENOENT")throw e;return false;});
      if(!exists&&!backup)throw Error("缺少待迁移站点配置；已有站点请在原数据节点先迁移，全新安装才可显式设置 XOI_SITE_CONFIG_BOOTSTRAP=empty");
    }
    return readLegacyData(key);
  });
  if(["production","prod"].includes(process.env.NODE_ENV||""))throw Error("生产环境站点配置必须使用 PostgreSQL，拒绝回退本机文件");
  return null;
}
/** 每个 key 一条写入链：两个请求同时改配置时，一个读到的旧数据不能覆盖掉另一个刚写完的改动，
 *  临时文件也不能同名（同一进程里 pid 相同，重名会让两个写入互相截断，落出半截 JSON）。 */
const writeChain = new Map<string, Promise<unknown>>();
let tmpSeq = 0;

/** 注意：返回的是进程内缓存对象，调用方不得原地修改（要改就整段替换，走 updateSection） */
export async function readData(key = "platform"): Promise<ResellerData> {
  validConfigKey(key);
  const store=databaseStore();if(store)return store.read(key);
  return readLegacyData(key);
}
export async function readLegacyData(key = "platform"): Promise<ResellerData> {
  validConfigKey(key);
  let d: ResellerData;
  try { const raw = await fs.readFile(FILE(key), "utf8"); d = completeConfig(JSON.parse(raw)); }
  catch (e) {
    // 文件不存在 = 首次运行，用默认值是对的；文件在却读不出来（解析失败 / 权限），静默回落默认值
    // 会把站点品牌、定价、签到池整套清空，下一次写入还会把空值固化。这种情况先找备份，再没有就抛错。
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT" || await fs.stat(`${FILE(key)}.bak`).then(()=>true,()=>false)) {
      const raw = await fs.readFile(`${FILE(key)}.bak`, "utf8").catch(() => null);
      if (!raw) throw new Error(`配置文件 ${FILE(key)} 损坏且没有可用备份，已停止读取以免覆盖`);
      d = completeConfig(JSON.parse(raw));
      return d;
    }
    d = structuredClone(DEFAULT_DATA);
  }
  return d;
}

/** Seed every legacy agent key before a new node is marked ready. Existing DB rows always win. */
export async function initializeResellerConfig(){
  const platform=await readData();
  const dir=path.join(process.env.DATA_DIR??path.join(process.cwd(),"data"),"reseller-agents");
  const names=await fs.readdir(dir).catch(e=>{if(e.code==="ENOENT")return [] as string[];throw e;});
  for(const name of names)if(/^agent-\d+\.json$/.test(name))await readData(name.slice(0,-5));
  return platform;
}

async function writeNow(next: ResellerData, key: string) {
  const f = FILE(key); await fs.mkdir(path.dirname(f), { recursive: true });
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
  const store=databaseStore();if(store)return store.write(key,next);
  return enqueue(key, () => writeNow(next, key));
}
/** 读—改—写整体排队：并发改不同 section 时，后写的不会把先写的抹掉 */
export async function updateSection<K extends Section>(section: K, value: ResellerData[K], key = "platform",options:ConfigPatchOptions={}) {
  const store=databaseStore();if(store)return store.patch(key,section,value,options);
  return enqueue(key, async () => { const d = await readData(key);if(Object.hasOwn(options,"expectedValue")&&!isDeepStrictEqual(d[section],options.expectedValue))throw new ConfigConflict(); const next = { ...d, [section]: value };if(options.audit)next.audit=[options.audit,...d.audit].slice(0,500); await writeNow(next, key); return next; });
}
export async function appendAudit(e: Omit<AuditEntry, "id" | "at">, key = "platform") {
  const store=databaseStore();if(store)return store.audit(key,{id:crypto.randomUUID(),at:Date.now(),...e});
  return enqueue(key, async () => {
    const d = await readData(key); const entry: AuditEntry = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), ...e };
    await writeNow({ ...d, audit: [entry, ...d.audit].slice(0, 500) }, key); return entry;
  });
}
