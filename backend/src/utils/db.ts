import knex, { type Knex } from "knex";
import pg from "pg";
import initDB from "@/lib/initDB";
import type { DB } from "@/types/database";
import { ensureWorkspaceTables } from "@/lib/workspace/schema";

type TableName = keyof DB & string;
type RowType<TName extends TableName> = DB[TName];

/* =====================================================================
 * 业务库 = new-api 自己的 PostgreSQL 库（决策 D2）
 * =====================================================================
 * 这个文件原来连的是本地 SQLite 文件（db2.sqlite / better-sqlite3）。
 * 2026-10-02 按决策 D2 改成 PostgreSQL —— **和 new-api 用同一个库**。
 *
 * 为什么必须同库（不是偏好问题，是能力问题）：
 *   · 代理体系的收益要按「天 × 费率区间」聚合 new-api 的 `logs` 表；
 *   · 加价要枚举全部线路分组，得读 `channels` 表（网关没有这个管理端点）；
 *   · 绑客户要「写归属记录 + 改 users.group」在同一个事务里完成；
 *   · 卡密要先扣代理余额、再调网关生成、失败退款（跨表事务）。
 *   这几件事走网关 HTTP 一条都做不到。造物（zaowu-engine）就是直连这个库的
 *   （见其 src/lib/newapi-db.ts），所以这里照它的模式来。
 *
 * ⚠️ 部署要求：必须有 PostgreSQL，且与 new-api 指向同一个库。
 *   环境变量（两个名字都认，前者是造物的叫法）：
 *     NEWAPI_DATABASE_URL  或  NEWAPI_PG_URL
 *     postgres://user:pwd@127.0.0.1:5432/new-api
 *   没配的话进程能起来，但任何一次读写都会报连接错误 —— 不静默降级，
 *   因为「悄悄用别的库」会让账单和日志对不上，比直接报错危险得多。
 * ===================================================================== */

function databaseUrl(): string {
  return (process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL || "").trim();
}

const url = databaseUrl();
if (!url) {
  console.error(
    "[db] 未配置 NEWAPI_DATABASE_URL / NEWAPI_PG_URL —— 业务库与 new-api 同库（决策 D2），" +
      "数据库操作会全部失败。请在 .env 里指向 new-api 的 PostgreSQL。",
  );
}

/* pg 默认把 int8(bigint) 解析成**字符串**（怕超过 JS 精度），但 SQLite 时代所有整数
 * 都是 number，代码里到处 new Date(row.createTime)、row.id === id 都是按 number 写的。
 * 不统一的话，凡是迁到 bigint 的时间戳列（createTime/updateTime/startTime，存毫秒）
 * 读出来会变成 "1774447310118" 这种字符串，new Date("1774…") 直接 Invalid Date。
 * 毫秒时间戳离 Number.MAX_SAFE_INTEGER（9e15）还很远，转 number 是安全的。 */
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number(v));

function poolSetting(name: string, fallback: number, upper: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > upper) throw new Error(`${name} 必须是 1~${upper} 的整数`);
  return value;
}

const db = knex({
  client: "pg",
  connection: url
    ? // sslmode 交给连接串表达，不在这里硬编码，避免本地开发被强制 SSL
      { connectionString: url }
    : // 占位：让 knex 能构造出来，首次查询时再抛出清楚的连接错误
      { host: "127.0.0.1", port: 5432, database: "new-api", user: "postgres", password: "" },
  pool: { min: 0, max: poolSetting("XOI_DB_POOL_MAX", 8, 100) },
  acquireConnectionTimeout: poolSetting("XOI_DB_ACQUIRE_TIMEOUT_MS", 10000, 60000),
});

/* ---------------------------------------------------------------------
 * PG 兼容层：让 insert 返回 MySQL 风格的 [insertId]
 * ---------------------------------------------------------------------
 * 造物代码全部按 MySQL 语义写的：`const [id] = await db("t").insert({...})`。
 * SQLite/MySQL 的 insert 会返回自增 id，而 PG 默认**不返回任何 id**
 * （直接解构会抛「object is not iterable」→ 全站 500）。
 * 这里全局打补丁：pg 下 insert 自动 `returning("id")`，并把结果规整成
 * id 数组。业务代码一行不用改。新增**没有 id 列**的表时，必须加进
 * NO_ID_TABLES，否则那条 insert 会被补丁误伤直接报「column id 不存在」。
 * ------------------------------------------------------------------ */
const NO_ID_TABLES = new Set([
  "o_setting",
  "o_assets2Storyboard",
  "o_skillAttribution",
  "o_scriptAssets",
  "o_assetsRole2Audio",
  "mc_agents",
  "mc_agent_customers",
  "mc_agent_codes",
  "mc_skill_saves",
  "mc_work_likes",
  "mc_skill_installs",
]);

const qbInstance = db.client.queryBuilder() as any;
const qbProto = Object.getPrototypeOf(qbInstance) as any;
const origInsert = qbProto.insert;
qbProto.insert = function (...args: any[]) {
  const builder = origInsert.apply(this, args);
  const tableName = this._single?.table;
  // 表名可能是 "t" / "t as x"，取主名判断
  const mainTable = String(tableName ?? "").split(/\s+as\s+/)[0];
  if (!this._single?.returning && !NO_ID_TABLES.has(mainTable)) {
    builder.returning("id");
    // knex3 的 INSERT+returning 在 thenable 层把 [{id: 4}, …] 规整成 [4, …]。
    // 注意 knex 的 then(cb) 返回的是「cb 返回值」的 promise（cb 返回 undefined），
    // 所以必须无回调调用拿到 rows 的 promise，映射后自己 resolve。
    const origThen = builder.then.bind(builder);
    builder.then = (resolve: any, reject: any) =>
      origThen().then((rows: any) => {
        const mapped =
          Array.isArray(rows) &&
          rows.length > 0 &&
          rows.every((r: any) => r && typeof r === "object" && "id" in r && Object.keys(r).length === 1)
            ? rows.map((r: any) => Number(r.id))
            : rows;
        resolve(mapped);
      }, reject);
  }
  return builder;
};

export const dbReady = Promise.resolve().then(async () => {
  if (!url) return;
  // Load migrations only after the Knex instance is initialized. fixDB imports
  // vendor helpers which in turn reference the shared DB; a static import here
  // creates a db -> fixDB -> vendor -> db cycle during module evaluation.
  const { default: fixDB } = await import("@/lib/fixDB");
  await initDB(db);
  await fixDB(db);
  await ensureWorkspaceTables(db);
});

// Keep the real Knex instance: raw/transaction are non-enumerable, so copying
// it onto a wrapper with Object.assign silently drops them at runtime.
// The intersection adds table-aware call signatures without losing Knex's API.
const dbClient = db as (<TName extends TableName>(table: TName) => Knex.QueryBuilder<RowType<TName>, RowType<TName>[]>) & typeof db;
export default dbClient;

export { db };

/* ---------------------------------------------------------------------
 * 关于数据库行类型 src/types/database.d.ts
 * ---------------------------------------------------------------------
 * 原来这里有个 initKnexType()，在 dev 启动时用 @rmp135/sql-ts **连一次真实数据库**
 * 反向生成类型。这条路有两个问题：
 *   1. 生成物没进版本库，新克隆 / CI / 沙箱里编译直接红（本项目 4 个文件引它）；
 *   2. 它给 @rmp135/sql-ts 拉进 sqlite3 这个原生依赖，而 sqlite3 与 sql-ts
 *      要求的版本冲突，且 node-gyp 构建会在受限环境里卡死整个 install。
 * 现在改为从 schema 源头生成，不依赖任何数据库驱动：
 *
 *     npx tsx scripts/gen-db-types.ts
 *
 * 换库（SQLite → PG）之后这份脚本一样适用，因为读的是 initDB.ts 的建表语句。
 * --------------------------------------------------------------------- */
