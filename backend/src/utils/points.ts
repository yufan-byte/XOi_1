import { db } from "@/utils/db";
import type { Knex } from "knex";
import { grantGift } from "./giftGrant";

type LedgerInput = {
  userId: number;
  amount: number;
  balanceAfter: number;
  type: string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
  operatorId?: number;
};

/** 将旧余额同步到新账户和不可变账本；必须在调用方事务内执行。 */
async function writeLedger(t: Knex.Transaction, input: LedgerInput): Promise<void> {
  const now = new Date().toISOString();
  const accountTable = t("o_points_account" as any) as any;
  const ledgerTable = t("o_points_ledger" as any) as any;
  const existing = await accountTable.where("user_id", input.userId).first();
  if (existing) {
    await accountTable.where("user_id", input.userId).update({
      balance: input.balanceAfter,
      updated_at: now,
      version: Number(existing.version || 0) + 1,
    });
  } else {
    await accountTable.insert({
      user_id: input.userId,
      balance: input.balanceAfter,
      frozen_balance: 0,
      version: 1,
      created_at: now,
      updated_at: now,
    });
  }
  if (input.idempotencyKey) {
    const duplicate = await ledgerTable.where("idempotency_key", input.idempotencyKey).first();
    if (duplicate) return;
  }
  await ledgerTable.insert({
    user_id: input.userId,
    amount: input.amount,
    balance_after: input.balanceAfter,
    type: input.type,
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    operator_id: input.operatorId ?? null,
    description: input.description ?? null,
    created_at: now,
  });
}

/**
 * 查询用户当前积分
 */
export async function getUserPoints(userId: number): Promise<number> {
  const user = await db("o_user").where("id", userId).first();
  return user?.points || 0;
}

/**
 * 检查用户是否是管理员
 */
export async function isAdmin(userId: number): Promise<boolean> {
  const user = await db("o_user").where("id", userId).first();
  return user?.role === "admin";
}

/**
 * 检查用户积分是否足够
 */
export async function checkPoints(userId: number, points: number): Promise<boolean> {
  if (await isAdmin(userId)) return true; // 管理员无限积分
  const current = await getUserPoints(userId);
  return current >= points;
}

/**
 * 差异化计费上下文(P2B-8)：可选供应商与模型维度，
 * 命中 o_points_price_override 则以「基础价 × multiplier」结算，否则维持原价 ×1.0。
 * 所有字段 optional ⇒ 老调用方不传即可保持旧行为零破坏。
 */
export interface PricingCtx {
  vendorId?: string | null;
  modelName?: string | null;
}

/**
 * 查询操作所需积分；解析序：
 *   1) 精确(base_action + vendor_id + model_name 三键全等)
 *   2) 供应商通配(vendor_id 相同且 model_name IS NULL 整档行)
 *   3) o_points_price.action 基础价(multiplier 视作 1.0)
 */
export async function getActionPoints(
  action: string,
  ctx?: PricingCtx | null,
): Promise<number> {
  const baseRow = await db("o_points_price").where("action", action).first();
  const base = baseRow?.points || 0;
  if (!ctx?.vendorId || base === 0) return base;

  let ov =
    ctx.modelName
      ? await db("o_points_price_override")
          .where({
            base_action: action,
            vendor_id: ctx.vendorId,
            model_name: ctx.modelName,
          })
          .first()
      : null;
  if (!ov) {
    ov = await db("o_points_price_override")
      .where({ base_action: action, vendor_id: ctx.vendorId })
      .whereNull("model_name")
      .first();
  }
  if (!ov || !ov.multiplier || Number(ov.multiplier) === 1) return base;
  return Math.round(Number(ov.multiplier) * base * 100) / 100;
}


/**
 * 扣除积分并记录流水（返回是否成功）
 * 使用事务 + 原子操作防止竞态条件
 * ctx 可选：传入则按差异化倍率结算并把供应商/模型维度写入流水审计列
 */
export async function deductPoints(
  userId: number,
  action: string,
  description?: string,
  ctx?: PricingCtx | null,
): Promise<boolean> {
  const points = await getActionPoints(action, ctx);
  if (points === 0) return true;

  // 使用事务 + 原子操作防止竞态条件
  const result = await db.transaction(async (trx) => {
    // 原子扣减：只有积分足够时才扣减，通过 affected rows 判断是否成功
    const affected = await trx("o_user")
      .where("id", userId)
      .where("points", ">=", points)
      .update({
        points: trx.raw("points - ?", [points])
      });

    if (affected === 0) return false;

    // 记录流水（含差异化计费审计维度）
    await trx("o_points_log").insert({
      user_id: userId,
      amount: -points,
      type: "consume",
      action,
      description: description || action,
      vendor_id: ctx?.vendorId ?? null,
      model_name: ctx?.modelName ?? null,
      created_at: new Date().toISOString()
    });
    await writeLedger(trx, {
      userId,
      amount: -points,
      balanceAfter: Number((await trx("o_user").where("id", userId).select("points").first())?.points || 0),
      type: "consume",
      description: description || action,
      referenceType: "ai_action",
      referenceId: action,
    });

    return true;
  });

  return result;
}

/**
 * 检查并扣除积分（不足时返回余额和所需）
 * 使用事务 + 原子操作防止竞态条件
 * 成功时 deducted 为实际扣除的积分（已含差异化倍率），失败时 message 为可展示的错误提示
 */
export async function checkAndDeductPoints(
  userId: number,
  action: string,
  description?: string,
  ctx?: PricingCtx | null
): Promise<{ success: boolean; current?: number; required?: number; deducted?: number; message?: string }> {
  const points = await getActionPoints(action, ctx);
  if (points === 0) return { success: true, deducted: 0 };

  // 使用事务 + 原子操作
  const result = await db.transaction(async (trx) => {
    const user = await trx("o_user").where("id", userId).first();
    const current = user?.points || 0;

    if (current < points) {
      return { success: false, current, required: points, message: `积分不足，需要 ${points} 积分，当前余额 ${current}` };
    }

    // 原子扣减
    const affected = await trx("o_user")
      .where("id", userId)
      .where("points", ">=", points)
      .update({
        points: trx.raw("points - ?", [points])
      });

    if (affected === 0) {
      return { success: false, current, required: points, message: `积分不足，需要 ${points} 积分，当前余额 ${current}` };
    }

    // 记录流水（含差异化计费审计维度）
    await trx("o_points_log").insert({
      user_id: userId,
      amount: -points,
      type: "consume",
      action,
      description: description || action,
      vendor_id: ctx?.vendorId ?? null,
      model_name: ctx?.modelName ?? null,
      created_at: new Date().toISOString()
    });
    await writeLedger(trx, {
      userId,
      amount: -points,
      balanceAfter: current - points,
      type: "consume",
      description: description || action,
      referenceType: "ai_action",
      referenceId: action,
    });

    return { success: true, deducted: points };
  });

  return result;
}

/**
 * 退还积分（失败回滚）
 * 增加参数验证防止负数退款攻击
 * ctx 仅用于在流水中记录原消费的供应商/模型维度，便于事后核对（金额本身不被倍率影响）
 */
export async function refundPoints(
  userId: number,
  points: number,
  relatedId: string,
  description?: string,
  ctx?: PricingCtx | null,
): Promise<void> {
  if (points <= 0) throw new Error("退款积分必须为正数");

  await db.transaction(async (trx) => {
    const refundAlreadyRecorded = await (trx("o_points_ledger" as any) as any)
      .where("idempotency_key", `refund:${relatedId}`)
      .first();
    if (refundAlreadyRecorded) return;
    await trx("o_user").where("id", userId).update({
      points: trx.raw("points + ?", [points])
    });

    await trx("o_points_log").insert({
      user_id: userId,
      amount: points,
      type: "refund",
      related_id: relatedId,
      description: description || "操作失败退款",
      vendor_id: ctx?.vendorId ?? null,
      model_name: ctx?.modelName ?? null,
      created_at: new Date().toISOString()
    });
    await writeLedger(trx, {
      userId,
      amount: points,
      balanceAfter: Number((await trx("o_user").where("id", userId).select("points").first())?.points || 0),
      type: "refund",
      description: description || "操作失败退款",
      referenceType: "refund",
      referenceId: relatedId,
      idempotencyKey: `refund:${relatedId}`,
    });
  });
}

/**
 * 管理员赠送积分
 * 增加参数验证和单次上限
 */
export async function giftPoints(userId: number, points: number, operatorId: number, description?: string, requestId?: string): Promise<void> {
  await grantGift(db, { userId, points, operatorId, description, requestId });
}

/**
 * 充值积分（发放入账）
 * 增加参数验证；options.trx 可传入外部已开启的事务以与其他发放动作原子化；
 * options.relatedId 用于把入账流水关联到外部幂等键(如支付 out_trade_no)，便于审计与去重核对。
 */
export async function rechargePoints(
  userId: number,
  points: number,
  packageId?: number,
  operatorId?: number,
  options?: { trx?: Knex.Transaction; relatedId?: string },
): Promise<void> {
  if (points <= 0) throw new Error("充值积分必须为正数");
  const descBase = packageId ? `积分充值(套餐#${packageId})` : "积分充值";

  const exec = async (t: Knex.Transaction): Promise<void> => {
    if (options?.relatedId) {
      const alreadyGranted = await t("o_points_log")
        .where({ related_id: options.relatedId, type: "recharge" })
        .first();
      if (alreadyGranted) return;
    }
    await t("o_user").where("id", userId).update({
      points: t.raw("points + ?", [points]),
    });
    await t("o_points_log").insert({
      user_id: userId,
      amount: points,
      type: "recharge",
      description: descBase,
      operator_id: operatorId ?? null,
      related_id: options?.relatedId ?? null,
      created_at: new Date().toISOString(),
    });
    await writeLedger(t, {
      userId,
      amount: points,
      balanceAfter: Number((await t("o_user").where("id", userId).select("points").first())?.points || 0),
      type: "recharge",
      description: descBase,
      referenceType: "payment_order",
      referenceId: options?.relatedId,
      idempotencyKey: options?.relatedId ? `recharge:${options.relatedId}` : undefined,
      operatorId,
    });
  };

  if (options?.trx) {
    // 在调用方提供的事务内执行，不再嵌套新事务以保证整体回滚一致
    await exec(options.trx);
  } else {
    await db.transaction(exec);
  }
}

/**
 * 发放会员等级与有效期（付费闭环）
 * - level 升级到指定档位(free|standard|premium)；升级场景应取 standard/premium
 * - days>0 时将 vip_expire_at 设定为 max(now, 当前到期日)+days 天 —— 续费叠加而非覆盖
 * - 可选 trx 与调用方共享事务保证与积发放原子化
 */
export async function applyMembership(
  userId: number,
  level: "standard" | "premium" | "free",
  days: number,
  options?: { trx?: Knex.Transaction },
): Promise<void> {
  const knexInst = options?.trx ?? db;
  const now = Date.now();
  const row = await knexInst("o_user").where("id", userId).select("vip_expire_at").first();
  const currentExpireMs = row?.vip_expire_at ? new Date(row.vip_expire_at).getTime() : 0;
  // 续费语义：仍在有效期内则在其上累加；否则从当下起算
  const base = Math.max(now, currentExpireMs);

  const patch: Record<string, unknown> = { member_level: level };
  if (days > 0) patch.vip_expire_at = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

  // 若 days<=0 且 level==='free' 仅做降级/清零：同时清空到期日
  if (level === "free" && days <= 0) patch.vip_expire_at = null;

  await knexInst("o_user").where("id", userId).update(patch);
}
