/**
 * 【兼容层 · 已退役】旧积分体系 → new-api 额度
 * =====================================================================
 * v3.0 P1 起，XOi 不再有自己的积分账本。**唯一账本是 new-api 的 `users.quota`**
 * （见 `@/utils/quota`）。
 *
 * 这个文件保留存在，是因为全仓库还有 20 个文件、约 90 处调用点要动，
 * 一次性改完风险太大。所以这里做**同签名转发**：外部一行不用改，
 * 内部语义已经整个换掉了。
 *
 * ┌────────────────┬──────────────────────────────────────────────┐
 * │ 老语义          │ 新语义                                        │
 * ├────────────────┼──────────────────────────────────────────────┤
 * │ 调用前预扣积分   │ 网关在转发那一刻「后扣」额度（按模型倍率）      │
 * │ 失败退款         │ 由网关账单决定；失败、超时也可能已有用量       │
 * │ 本地定价表       │ 作废：价格由 new-api 的渠道倍率决定            │
 * │ 会员等级         │ 退役：造物体系里没有会员，只有额度             │
 * └────────────────┴──────────────────────────────────────────────┘
 *
 * 后续清理（P1.5）：把 20 个文件的 import 从 `@/utils/points` 改成 `@/utils/quota`，
 * 然后删掉本文件与 `o_points_*` 七张表。零残留门禁见 `ops/check-points-residue.sh`。
 */
import { getQuota, creditYuan, applyQuotaChange, yuanToQuota } from "@/utils/quota";
import { QUOTA_PER_POINT, quotaToPoints, pointsToQuota } from "@/utils/creditUnits";

/**
 * 1 个「展示积分」= 多少 quota。
 * 产品固定为 1 元 = 10 积分，即 50000 quota = 1 积分。
 * 不能用单独的环境倍率覆盖，否则余额与模型报价会使用不同单位。
 */

/** 差异化计费上下文。**已废弃**：价格由网关倍率决定，这里只为了不改调用点签名。 */
export interface PricingCtx {
  vendorId?: string | null;
  modelName?: string | null;
}

/** 用户余额（以展示积分计） */
export async function getUserPoints(userId: number): Promise<number> {
  const quota = await getQuota(userId);
  return quotaToPoints(quota);
}

/** 是否管理员 */
export async function isAdmin(userId: number): Promise<boolean> {
  const user = await (await import("@/utils/db")).db("o_user").where("id", userId).first();
  return user?.role === "admin";
}

/**
 * 额度是否够。
 *
 * 【语义变更】这里只能做**软校验**：本地已经拿不到「这次要花多少」的确定值
 * （后扣模式下要看实际 token / 时长）。所以退化为「余额是否大于 0」。
 * 调用方要展示「大概需要多少」，应该用模型目录里的参考价，而不是这个函数。
 */
export async function checkPoints(userId: number, _points: number): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  return (await getQuota(userId)) > 0;
}

/**
 * 某个操作要扣多少积分。
 *
 * 【已废弃 · 恒返回 0】
 * 价格由 new-api 的渠道倍率在转发时决定，本地不再有定价表。
 * 返回 0 会让所有「按价预扣」的调用点变成空操作 —— 这正是我们要的，
 * 因为真正的扣费已经由网关完成。
 */
export async function getActionPoints(_action: string, _ctx?: PricingCtx | null): Promise<number> {
  return 0;
}

/**
 * 扣除积分。
 *
 * 【已废弃 · 空操作】返回 true 表示「无本地扣费，可以继续」。
 * 真实扣费由 NewAPI 决定。流式中断、异步失败可能已有用量，不能保证失败不扣。
 */
export async function deductPoints(_userId: number, _action: string, _description?: string, _ctx?: PricingCtx | null): Promise<boolean> {
  return true;
}

/**
 * 检查并扣除积分 → 改成「调用前软校验」。
 *
 * 行为差异（重要）：
 *   · 老：余额不足直接拒绝，并在本地扣掉
 *   · 新：余额为 0 才拒绝；能过就让调用发出去，由网关按实际用量扣
 *
 * 这只避免应用层重复扣减；并发、异步、退款正确性仍需核对网关账单。
 */
export async function checkAndDeductPoints(
  userId: number,
  _action: string,
  _description?: string,
  _ctx?: PricingCtx | null,
): Promise<{ success: boolean; current?: number; required?: number; deducted?: number; message?: string }> {
  if (await isAdmin(userId)) return { success: true, deducted: 0 };

  let quota: number;
  try {
    quota = await getQuota(userId);
  } catch (e) {
    console.warn("[points] 额度读取失败，阻止本次调用：", e instanceof Error ? e.message : e);
    return { success: false, deducted: 0, message: "积分安全校验暂不可用，本次未提交模型请求，请稍后重试" };
  }

  if (quota <= 0) {
    return { success: false, current: 0, required: 0, message: "账户余额不足，请先充值后再试" };
  }
  return { success: true, deducted: 0, current: quotaToPoints(quota) };
}

/**
 * 退还积分。
 *
 * 【已废弃 · 空操作】退款须核对网关日志及上游政策；本函数不能证明已退款。
 * 保留函数是为了不改 20 个调用点。
 */
export async function refundPoints(_userId: number, points: number, _relatedId: string, _description?: string, _ctx?: PricingCtx | null): Promise<void> {
  if (points <= 0) throw new Error("退款积分必须为正数");
  // 有意为空：见上方说明
}

/**
 * 管理员赠送 / 通用入账。
 *
 * 单位是「展示积分」——历史调用点传的是积分数，这里换算成 quota 入账，
 * 这样后台沿用老界面也不会出错。
 */
export async function giftPoints(userId: number, points: number, operatorId: number, description?: string, requestId?: string): Promise<void> {
  if (!(points > 0)) throw new Error("赠送积分必须为正数");
  await applyQuotaChange({
    userId,
    delta: pointsToQuota(points),
    type: "gift",
    description: description ?? "管理员赠送",
    operatorId,
    referenceType: "gift",
    referenceId: requestId,
    idempotencyKey: requestId ? `gift:${requestId}` : undefined,
  });
}

/**
 * 充值入账。
 *
 * 单位同样是「展示积分」。注意 `relatedId`（通常是支付单号）会被当作幂等键，
 * 支付回调重复触发时只入账一次。
 */
export async function rechargePoints(
  userId: number,
  points: number,
  packageId?: number,
  operatorId?: number,
  options?: { trx?: unknown; relatedId?: string },
): Promise<void> {
  if (!(points > 0)) throw new Error("充值积分必须为正数");
  const desc = packageId ? `额度充值(套餐#${packageId})` : "额度充值";
  await applyQuotaChange({
    userId,
    delta: pointsToQuota(points),
    type: "recharge",
    description: desc,
    operatorId,
    referenceType: "payment_order",
    referenceId: options?.relatedId,
    // 幂等键 + 类型一起约束：同一支付单号只入账一次
    idempotencyKey: options?.relatedId ? `recharge:${options.relatedId}` : undefined,
  });
}

/**
 * 会员等级。
 *
 * 【已退役 · 空操作】造物体系里没有会员概念，只有额度；`o_user` 也没有
 * member_level / vip_expire_at 两列（写下去会直接报 SQL 错）。
 * 保留函数是为了不改调用点；如果将来要做会员，应该做成独立的权益表，
 * 而不是挂在额度上。
 */
export async function applyMembership(
  userId: number,
  level: "standard" | "premium" | "free",
  days: number,
  _options?: { trx?: unknown },
): Promise<void> {
  console.warn(`[points] applyMembership 已退役，忽略本次调用（uid=${userId} level=${level} days=${days}）`);
}

/** 便捷：按「元」入账（新代码请直接用 quota.ts 的 creditYuan） */
export const rechargeYuan = creditYuan;
export { yuanToQuota, QUOTA_PER_POINT };
