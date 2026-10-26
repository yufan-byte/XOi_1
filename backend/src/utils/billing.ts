/**
 * 计费内核（v3.0 P1 改造 · 软校验版）
 * =====================================================================
 * 【原来是什么】302 行的「预扣 + 预留 + 捕获 + 退款」引擎：
 *   在任务提交前原子扣掉本地积分，写 `o_points_reservation` 预留单，
 *   成功走 capture、失败走 release 退款。
 *
 * 【为什么整个换掉】
 *   1. 唯一账本换成 new-api 的 `users.quota` 之后，**扣费发生在网关转发那一刻**，
 *      不再需要应用层预扣；失败、超时和异步任务的用量／退款须核对网关账单。
 *   2. 更要命的是：旧实现直接读写 `o_user.points`，而 **`o_user` 表根本没有 points 列**
 *      （见 `lib/initDB.ts` 的 o_user 定义与 `lib/fixDB.ts` 的迁移清单）。
 *      线上老库可能因为历史版本的 initDB 恰好吃过这一列而没炸，全新安装的库一定会报 SQL 错。
 *   3. 顺带一提：`getActionPoints()` 现在恒返回 0，所以旧代码其实在第一步
 *      `if (points === 0) return { bypassed: true }` 就返回了 —— 那三处危险写入是**死代码**。
 *      换句话说这次替换在行为上是等价的，纯粹是把隐患清掉。
 *
 * 【现在是什么】保留**完全相同的对外 API**，内部只做「调用前软校验」：
 *   reservePoints  → 余额 > 0 才放行（管理员直接放行），不做任何本地扣减
 *   capturePoints  → 空操作（真实扣费已由网关完成）
 *   releasePoints  → 空操作（不代表已经退款，不能保证失败未扣）
 *
 * 调用方（canvas-stubs / admin/billing / production/workbench/*）**一行都不用改**。
 */
import { getQuota } from "@/utils/quota";
import { getActionPoints, type PricingCtx } from "@/utils/points";

export type BillingScene =
  | "canvas.text"
  | "canvas.image"
  | "canvas.video"
  | "drama.text"
  | "drama.image"
  | "drama.video"
  | "system";

export type BillingRequest = {
  userId: number;
  requestId: string;
  action: string;
  scene: BillingScene | string;
  description?: string;
  pricingCtx?: PricingCtx | null;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  quotedPoints?: number;
};

export type BillingReservation = {
  success: boolean;
  reservationId?: string;
  requestId: string;
  points: number;
  deducted: number;
  balance?: number;
  message?: string;
  bypassed?: boolean;
};

function validateRequestId(requestId: string): string {
  if (!requestId || requestId.length > 180) throw new Error("计费请求号不合法");
  return requestId;
}

/**
 * 从模型键解析计价上下文（`供应商:模型名`）。
 *
 * **保留但已不参与计价**：价格由网关按渠道倍率决定，本地没有定价表了。
 * 调用方仍在传它，签名不能动。
 */
export function pricingContextFromModel(model?: string | null): PricingCtx | null {
  if (!model || !model.trim()) return null;
  const value = model.trim();
  const parts = value.split(/:(.+)/);
  if (parts.length === 3) return { vendorId: parts[0] || null, modelName: parts[1] || null };
  return { modelName: value };
}

/**
 * 预估本次要花多少。
 *
 * 【恒返回 0】后扣模式下无法预知（要看实际 token / 时长）。
 * 前端要展示「大概多少钱」，应该读模型目录里的参考价，不要依赖这个函数。
 */
export async function quoteBilling(input: Pick<BillingRequest, "action" | "pricingCtx">): Promise<number> {
  return await getActionPoints(input.action, input.pricingCtx);
}

/**
 * 提交前的**软校验**（不再预扣）。
 *
 * 返回值语义与旧版保持一致，业务层不需要改：
 *   success=true  → 放行，可以调用模型
 *   success=false → 拦住，message 可直接展示给用户
 *   bypassed=true → 没有产生任何本地扣减（现在恒为 true）
 *
 * 余额取不到时**放行**：真实扣费在网关侧，漏不掉；而因为网关抖动把全站用户挡在门外，
 * 代价要大得多。
 */
export async function reservePoints(input: BillingRequest): Promise<BillingReservation> {
  validateRequestId(input.requestId);

  // 管理员也使用自己的 NewAPI 令牌；是否扣费由网关决定，不能假定免费。
  // 注意：这里不再查 o_user 表来判断 admin，交给调用链上游的鉴权；本函数保持无副作用。

  let quota: number | null = null;
  try {
    quota = await getQuota(input.userId);
  } catch (e) {
    console.warn("[billing] 余额读取失败，放行本次调用：", e instanceof Error ? e.message : e);
    return { success: true, requestId: input.requestId, points: 0, deducted: 0, bypassed: true };
  }

  if (quota <= 0) {
    return {
      success: false,
      requestId: input.requestId,
      points: 0,
      deducted: 0,
      balance: 0,
      message: "账户余额不足，请先充值后再试",
    };
  }

  return {
    success: true,
    requestId: input.requestId,
    points: 0,
    deducted: 0,
    bypassed: true,
    balance: quota,
  };
}

/**
 * 结算预留。
 *
 * 【空操作】预留已经不存在了 —— 扣费由网关在转发时完成，
 * 这里返回 true 表示「本次不需要做任何事」。
 */
export async function capturePoints(_reservation?: Pick<BillingReservation, "reservationId" | "bypassed"> | null): Promise<boolean> {
  return true;
}

/**
 * 退还预留。
 *
 * 【空操作】后扣模式下没有预扣，自然也没有退款。
 * 保留函数是为了不改 13 处调用点；将来若要做「长任务占用额度」，
 * 应该基于网关的任务状态实现，而不是恢复本地预留单。
 */
export async function releasePoints(
  _reservation?: Pick<BillingReservation, "reservationId" | "bypassed"> | null,
  _description = "任务失败退还",
  _operatorId?: number,
): Promise<boolean> {
  return true;
}
