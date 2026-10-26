/**
 * new-api 额度层（v3.0 P1 · 唯一账本）
 * =====================================================================
 * 从这一版起，**用户余额的唯一权威是 new-api 的 `users.quota`**。
 * XOi 本地不再维护第二本账，只留一张审计流水表 `o_quota_ledger`。
 *
 *   QUOTA_PER_UNIT = 500000   →  500000 quota = ¥1（与造物一致）
 *
 * ─────────────────────────────────────────────────────────────
 * 为什么读和写走两条不同的路
 * ─────────────────────────────────────────────────────────────
 * · 读（高频，34 处调用）：优先直连 PostgreSQL 读 `users.quota`。
 *   改造后 XOi 的业务库与 new-api 同库（决策 D2），一条 SELECT 就能拿到，
 *   复用业务连接池，兼容 NEWAPI_DATABASE_URL / NEWAPI_PG_URL。未配置数据库连接时退化为
 *   「内存缓存 + 网关反查」。
 *
 * · 写（低频，入账/管理员调配）：必须走 new-api 的管理接口。
 *   因为扣费发生在网关转发那一刻，额度变更要进网关自己的日志与倍率体系，
 *   绕过去写库会让「账单」和「日志」对不上。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ 双扣铁律
 * ─────────────────────────────────────────────────────────────
 * 本文件只管「站长账号」这一个令牌方向。**绝不给每个用户签发 new-api 子令牌**。
 * 用户侧的额度由网关在转发时按倍率扣减（成本），XOi 侧只做展示与软校验（收入）。
 */
import u from "@/utils";
import { db } from "@/utils/db";
import { NewApiError, adjustQuota as newApiAdjustQuota, newApiSelfByAdmin } from "@/utils/newapi";
import { QUOTA_PER_YUAN } from "@/utils/creditUnits";
import { QuotaOperations } from "./quotaOperations";

/** 500000 quota = ¥1，与造物引擎保持一致 */
export const QUOTA_PER_UNIT = QUOTA_PER_YUAN;

/** 余额读取缓存（仅在没有直连 PG 时启用），避免每次 getActionPoints 都打网关 */
const TTL_MS = Number(process.env.QUOTA_CACHE_TTL_MS || 5000);
const cache = new Map<number, { quota: number; at: number }>();

/* ------------------------------------------------------------------ */
/* 读                                                                  */
/* ------------------------------------------------------------------ */

/**
 * 取用户当前额度（quota 单位）。
 *
 * 三级降级：PG 直读 → 内存缓存 → 网关反查。
 * 全部失败时**抛错而不是返回 0** —— 返回 0 会让「余额充足的人被判定为余额不足」，
 * 那比直接报错更难排查。
 */
export async function getQuota(userId: number, opts: { fresh?: boolean } = {}): Promise<number> {
  const hit = cache.get(userId);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.quota;

  // 1) 直连 PG（同库，最准）
  if ((process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL || "").trim()) {
    try {
      // Use the same connection and pool as identity/project queries, for either supported URL name.
      const row = await db("users").where("id", userId).whereNull("deleted_at").select("quota").first();
      if (row) {
        const quota = Number(row.quota ?? 0);
        cache.set(userId, { quota, at: Date.now() });
        return quota;
      }
    } catch (e) {
      console.warn("[quota] PG 直读失败，回落到网关：", e instanceof Error ? e.message : e);
    }
  }

  // 2) 网关反查
  try {
    const nu = await newApiSelfByAdmin(userId);
    const quota = Number(nu.quota ?? 0);
    cache.set(userId, { quota, at: Date.now() });
    return quota;
  } catch (e) {
    if (hit && !opts.fresh) {
      // 网关抖了，但手里有旧值：用它兜底总比直接失败强，同时明确告警
      console.warn(`[quota] 网关不可用，暂用 ${Math.round((Date.now() - hit.at) / 1000)}s 前的缓存值`);
      return hit.quota;
    }
    throw new NewApiError(503, e instanceof NewApiError ? e.message : "无法读取账户额度，请稍后重试");
  }
}

/** quota → 展示用的「余额（元）」 */
export function quotaToYuan(quota: number): number {
  return Math.round((quota / QUOTA_PER_UNIT) * 100) / 100;
}

/** 「元」→ quota */
export function yuanToQuota(yuan: number): number {
  return Math.round(yuan * QUOTA_PER_UNIT);
}

/** 展示用余额（元），保留两位 */
export async function getBalanceYuan(userId: number, opts: { fresh?: boolean } = {}): Promise<number> {
  return quotaToYuan(await getQuota(userId, opts));
}

/* ------------------------------------------------------------------ */
/* 写                                                                  */
/* ------------------------------------------------------------------ */

export interface QuotaChangeInput {
  userId: number;
  /** 以 quota 计的增减量：正数入账、负数扣减 */
  delta: number;
  type: "recharge" | "gift" | "refund" | "admin" | "consume" | "checkin" | "team_allocate" | "team_reclaim";
  description?: string;
  /** 幂等键：同一个键重复入账只会生效一次（支付回调必须传） */
  idempotencyKey?: string;
  operatorId?: number;
  referenceType?: string;
  referenceId?: string;
}

/**
 * 调整额度。正数入账、负数扣减。
 *
 * 先持久化唯一操作编号再调用网关；重复／并发编号不能重复发放。
 * 网络或审计结果不明时保持待核对，禁止自动重试，不声称跨系统事务原子性。
 */
const operations=new QuotaOperations(db,newApiAdjustQuota);
export const ensureQuotaOperations=()=>operations.ensure();
export async function applyQuotaChange(input: QuotaChangeInput): Promise<{ applied: boolean; quotaAfter: number | null }> {
  try{return await operations.apply(input);}finally{cache.delete(input.userId);}
}

/** 入账（充值 / 赠送 / 返现）。yuan 以元计，内部换算成 quota。 */
export async function creditYuan(
  userId: number,
  yuan: number,
  type: QuotaChangeInput["type"] = "recharge",
  options: Omit<QuotaChangeInput, "userId" | "delta" | "type"> = {},
): Promise<{ applied: boolean; quotaAfter: number | null }> {
  if (!(yuan > 0)) throw new Error("入账金额必须为正数");
  return applyQuotaChange({ userId, delta: yuanToQuota(yuan), type, ...options });
}

/** 清缓存（管理员在网关后台直接改了额度之后调用） */
export function invalidateQuotaCache(userId?: number): void {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}
