/**
 * new-api 的 PostgreSQL 直连池（仅服务端，仅代理体系使用）。
 *
 * 移植自造物引擎 src/lib/newapi-db.ts 的 `db()`，差别只有一个：
 * 造物在进程里只有这一个库，XOi 的 `@/utils/db` 是 knex 封装（业务表 o_*），
 * 而代理体系要写的四张 mc_* 表 + 要 JOIN 的 users/tokens/logs/channels/redemptions
 * 都归 new-api 所有，所以这里另开一条**裸 pg** 通道，SQL 与造物逐字一致。
 *
 * 为什么不能让 knex 代劳：agent-store 里有 `to_char(... AT TIME ZONE ...)`、
 * `status_history || $6::jsonb`、`SELECT DISTINCT unnest(string_to_array("group", ','))`、
 * `pg_advisory_xact_lock` 这些 PG 方言，以及 `ON CONFLICT DO NOTHING` 的写入；
 * 走 knex 只是多一层转译，出错时更难对上造物线上那份已验证的行为。
 *
 * 连接串与业务库**同一条**（决策 D2）：
 *   NEWAPI_DATABASE_URL 或 NEWAPI_PG_URL，两者都认（前者是造物的叫法）。
 * 没配就返回 null —— 不静默降级到别的库，那会让账单和日志对不上。
 */
import pg from "pg";

declare global {
  // 开发模式热重载会重复执行模块，连接池必须挂在 global 上复用
  // eslint-disable-next-line no-var
  var __xoiAgentPool: pg.Pool | undefined;
}

/* pg 默认把 int8(bigint) 解析成**字符串**（怕超过 JS 精度），
 * 但 mc_* 表里的时间戳都是 bigint（毫秒），代码到处按 number 用
 * （new Date(row.created_at)、数值比较、算时间窗口）。
 * `@/utils/db` 里已经设过一次，这里再设一次，保证「先加载 agent 模块」的
 * 启动路径也一致（setTypeParser 幂等）。 */
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number(v));

function databaseUrl(): string {
  return (process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL || "").trim();
}

/** 取连接池；未配置连接串时返回 null（调用方自行决定报什么错） */
export function db(): pg.Pool | null {
  const url = databaseUrl();
  if (!url) return null;
  globalThis.__xoiAgentPool ??= new pg.Pool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return globalThis.__xoiAgentPool;
}

/** 明确要求有库：没有就抛一句人能看懂的话，而不是 ECONNREFUSED */
export function requireDb(): pg.Pool {
  const p = db();
  if (!p) throw new Error("数据库未配置（NEWAPI_DATABASE_URL / NEWAPI_PG_URL）");
  return p;
}

/** new-api 的 NormalizeEmail：lower + trim。写入必须与它一致，否则它查不到我们写的值。 */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
