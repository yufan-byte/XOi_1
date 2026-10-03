/**
 * 用户余额（new-api users.quota）的原子调整（仅服务端）。
 *
 * 移植自造物引擎 src/lib/quota.ts。造物那边直接改库是因为 new-api 没有
 * 「管理员加减额度」的接口（`PUT /api/user/` 带 quota 会返回 success 却什么都不改，
 * 是个假成功陷阱）。代理体系的卡密生成要先扣代理余额、失败再退款，
 * 这笔扣减必须是**事务内**的，所以这里也走直连。
 *
 * 与 XOi `@/utils/quota` 的分工：
 *   · `@/utils/quota` 管**站点面向用户的**入账（充值 / 赠送 / 签到），走管理接口 + 审计流水表；
 *   · 本文件只管**代理体系自己的**事务性增减（卡密扣款、失败退款、提现校验）。
 *   两者写的是同一个 users.quota 列，但调用场景不重叠。
 */
import type { PoolClient } from "pg";
import { db } from "./db";

export class QuotaError extends Error {}

/** 在事务里对某用户加 / 减额度；减额度时余额不足抛 QuotaError。调用方负责提交后 flushUsers */
export async function adjustQuota(client: PoolClient, userId: number, delta: number): Promise<number> {
  if (!Number.isInteger(delta)) throw new QuotaError("额度必须是整数");
  const r = delta >= 0
    ? await client.query<{ quota: string }>("UPDATE users SET quota = quota + $2 WHERE id = $1 RETURNING quota", [userId, delta])
    : await client.query<{ quota: string }>("UPDATE users SET quota = quota + $2 WHERE id = $1 AND quota >= $3 RETURNING quota", [userId, delta, -delta]);
  if (!r.rowCount) throw new QuotaError(delta < 0 ? "余额不足" : "用户不存在");
  return Number(r.rows[0].quota);
}

export async function userQuota(client: PoolClient, userId: number): Promise<number> {
  const r = await client.query<{ quota: string }>("SELECT quota FROM users WHERE id = $1", [userId]);
  return Number(r.rows[0]?.quota ?? 0);
}

/**
 * 事务提交后清掉这些用户在 new-api 的缓存。
 *
 * 造物那边是删 Redis 的 user:<id>；**XOi 的部署里 new-api 不接 Redis**
 * （见 ops/dev-newapi.yml：只给 SQL_DSN，没给 REDIS_CONN_STRING），
 * 余额每次都直接查库，所以这里没有可清的东西 —— 保留这个函数是为了让
 * agent-store 的移植保持逐字一致（调用点语义清晰：改完余额要刷缓存）。
 *
 * ⚠️ 如果哪天给 new-api 配上了 Redis，必须在这里补上删除逻辑，
 * 否则「卡密扣款」在缓存过期前不会对网关生效（会按旧余额放行）。
 */
export async function flushUsers(ids: number[]): Promise<void> {
  if (!process.env.REDIS_CONN_STRING && !process.env.REDIS_ADDR) return;
  console.warn(
    `[agent/quota] new-api 已配置 Redis，但 XOi 侧没有清理实现：` +
      `用户 ${[...new Set(ids)].join(",")} 的余额缓存可能在过期前不被网关看到。`,
  );
}

/** 带事务执行；回调里的 adjustQuota 失败会整体回滚 */
export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const pool = db(); if (!pool) throw new QuotaError("数据库未配置");
  const c = await pool.connect();
  try { await c.query("BEGIN"); const out = await fn(c); await c.query("COMMIT"); return out; }
  catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
  finally { c.release(); }
}
