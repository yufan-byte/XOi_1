import type { Knex } from "knex";
import { db } from "@/utils/db";
import { getActionPoints, type PricingCtx } from "@/utils/points";

/**
 * 统一计费内核（一期）。
 *
 * 约定：
 * - reserve 在任务提交前原子扣除可用积分，并写入一条可幂等的 reservation；
 * - capture 只把 reservation 标记为已结算，不再次扣费；
 * - release 原子退回 reservation，重复调用不会重复退款。
 *
 * 目前 o_user.points 仍是兼容旧系统的可用余额真源，o_points_account 同步保存余额快照。
 * 后续接入正式冻结余额时，只需替换 reserve/release 的账户变更，不影响业务路由。
 */

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

function toWholePoints(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100000000) throw new Error("积分报价不合法");
  // 积分账户是整数，倍率计算产生小数时向上取整，避免用户实际欠费。
  return Math.max(0, Math.ceil(Number(value || 0)));
}

function reservationId(requestId: string): string {
  if (!requestId || requestId.length > 180) throw new Error("计费请求号不合法");
  return requestId;
}

async function syncAccount(t: Knex.Transaction, userId: number, balance: number): Promise<void> {
  const now = new Date().toISOString();
  const account = await t("o_points_account" as any).where("user_id", userId).first();
  if (account) {
    await t("o_points_account" as any).where("user_id", userId).update({
      balance,
      updated_at: now,
      version: Number(account.version || 0) + 1,
    });
    return;
  }
  await t("o_points_account" as any).insert({
    user_id: userId,
    balance,
    frozen_balance: 0,
    version: 1,
    created_at: now,
    updated_at: now,
  });
}

async function writeBillingLedger(
  t: Knex.Transaction,
  data: {
    userId: number;
    amount: number;
    balanceAfter: number;
    type: string;
    referenceId: string;
    idempotencyKey: string;
    description: string;
    operatorId?: number;
  },
): Promise<void> {
  const duplicate = await t("o_points_ledger" as any)
    .where("idempotency_key", data.idempotencyKey)
    .first();
  if (duplicate) return;
  await t("o_points_ledger" as any).insert({
    user_id: data.userId,
    amount: data.amount,
    balance_after: data.balanceAfter,
    type: data.type,
    reference_type: "billing_reservation",
    reference_id: data.referenceId,
    idempotency_key: data.idempotencyKey,
    description: data.description,
    operator_id: data.operatorId ?? null,
    created_at: new Date().toISOString(),
  });
}

export function pricingContextFromModel(model?: string | null): PricingCtx | null {
  if (!model || !model.trim()) return null;
  const value = model.trim();
  const parts = value.split(/:(.+)/);
  if (parts.length === 3) return { vendorId: parts[0] || null, modelName: parts[1] || null };
  return { modelName: value };
}

export async function quoteBilling(input: Pick<BillingRequest, "action" | "pricingCtx">): Promise<number> {
  return toWholePoints(await getActionPoints(input.action, input.pricingCtx));
}

export async function reservePoints(input: BillingRequest): Promise<BillingReservation> {
  const points = input.quotedPoints === undefined ? await quoteBilling(input) : toWholePoints(input.quotedPoints);
  const id = reservationId(input.requestId);

  // 价格为 0 时不写无意义流水，业务层仍可统一走 capture/release。
  if (points === 0) return { success: true, requestId: input.requestId, points: 0, deducted: 0, bypassed: true };

  return db.transaction(async (trx) => {
    const existing = await trx("o_points_reservation" as any).where("request_id", input.requestId).first();
    if (existing) {
      if (existing.user_id !== input.userId || existing.action !== input.action || existing.scene !== input.scene) {
        throw new Error("计费请求号已被其他任务使用");
      }
      if (existing.status === "released") {
        return {
          success: false,
          requestId: input.requestId,
          points: Number(existing.points || points),
          deducted: 0,
          message: "该请求已释放，请勿重复提交",
        };
      }
      return {
        success: true,
        reservationId: existing.id,
        requestId: input.requestId,
        points: Number(existing.points || 0),
        deducted: Number(existing.points || 0),
        bypassed: Number(existing.points || 0) === 0,
      };
    }

    const user = await trx("o_user").where("id", input.userId).first();
    // 管理员不消耗用户积分，但仍返回统一结构，便于业务层不写特殊分支。
    if (user?.role === "admin") {
      return { success: true, requestId: input.requestId, points: 0, deducted: 0, bypassed: true };
    }
    const current = Number(user?.points || 0);
    if (current < points) {
      return {
        success: false,
        requestId: input.requestId,
        points,
        deducted: 0,
        balance: current,
        message: `积分不足，需要 ${points} 积分，当前余额 ${current}`,
      };
    }

    const nextBalance = current - points;
    const affected = await trx("o_user").where("id", input.userId).where("points", ">=", points).update({
      points: trx.raw("points - ?", [points]),
    });
    if (!affected) {
      return {
        success: false,
        requestId: input.requestId,
        points,
        deducted: 0,
        balance: Number((await trx("o_user").where("id", input.userId).first())?.points || 0),
        message: `积分不足，需要 ${points} 积分`,
      };
    }
    await syncAccount(trx, input.userId, nextBalance);

    const now = new Date().toISOString();
    await trx("o_points_reservation" as any).insert({
      id,
      request_id: input.requestId,
      user_id: input.userId,
      scene: input.scene,
      action: input.action,
      points,
      status: "reserved",
      vendor_id: input.pricingCtx?.vendorId ?? null,
      model_name: input.pricingCtx?.modelName ?? null,
      reference_type: input.referenceType ?? "ai_task",
      reference_id: input.referenceId ?? input.requestId,
      price_snapshot: JSON.stringify({ points, action: input.action, scene: input.scene, ...(input.metadata || {}) }),
      created_at: now,
      updated_at: now,
    });
    await trx("o_points_log").insert({
      user_id: input.userId,
      amount: -points,
      type: "consume",
      action: input.action,
      description: input.description || input.action,
      related_id: input.requestId,
      vendor_id: input.pricingCtx?.vendorId ?? null,
      model_name: input.pricingCtx?.modelName ?? null,
      created_at: now,
    });
    await writeBillingLedger(trx, {
      userId: input.userId,
      amount: -points,
      balanceAfter: nextBalance,
      type: "reserve",
      referenceId: id,
      idempotencyKey: `billing:reserve:${input.requestId}`,
      description: input.description || input.action,
    });

    return { success: true, reservationId: id, requestId: input.requestId, points, deducted: points, balance: nextBalance };
  });
}

export async function capturePoints(reservation?: Pick<BillingReservation, "reservationId" | "bypassed"> | null): Promise<boolean> {
  if (!reservation?.reservationId || reservation.bypassed) return true;
  return db.transaction(async (trx) => {
    const row = await trx("o_points_reservation" as any).where("id", reservation.reservationId).first();
    if (!row) return false;
    if (row.status === "captured") return true;
    if (row.status !== "reserved") return false;
    const affected = await trx("o_points_reservation" as any)
      .where({ id: reservation.reservationId, status: "reserved" })
      .update({ status: "captured", captured_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (!affected) return true;
    const user = await trx("o_user").where("id", row.user_id).first();
    await syncAccount(trx, row.user_id, Number(user?.points || 0));
    await writeBillingLedger(trx, {
      userId: row.user_id,
      amount: 0,
      balanceAfter: Number(user?.points || 0),
      type: "capture",
      referenceId: row.id,
      idempotencyKey: `billing:capture:${row.id}`,
      description: "积分预扣结算",
    });
    return true;
  });
}

export async function releasePoints(
  reservation?: Pick<BillingReservation, "reservationId" | "bypassed"> | null,
  description = "任务失败退还",
  operatorId?: number,
): Promise<boolean> {
  if (!reservation?.reservationId || reservation.bypassed) return true;
  return db.transaction(async (trx) => {
    const row = await trx("o_points_reservation" as any).where("id", reservation.reservationId).first();
    if (!row) return false;
    if (row.status === "released") return true;
    if (row.status !== "reserved") return false;
    const affected = await trx("o_points_reservation" as any)
      .where({ id: reservation.reservationId, status: "reserved" })
      .update({ status: "released", released_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (!affected) return true;

    await trx("o_user").where("id", row.user_id).update({ points: trx.raw("points + ?", [row.points]) });
    const user = await trx("o_user").where("id", row.user_id).first();
    const balance = Number(user?.points || 0);
    await syncAccount(trx, row.user_id, balance);
    await trx("o_points_log").insert({
      user_id: row.user_id,
      amount: row.points,
      type: "refund",
      operator_id: operatorId ?? null,
      action: row.action,
      related_id: row.id,
      description,
      vendor_id: row.vendor_id,
      model_name: row.model_name,
      created_at: new Date().toISOString(),
    });
    await writeBillingLedger(trx, {
      userId: row.user_id,
      amount: row.points,
      balanceAfter: balance,
      type: "release",
      operatorId,
      referenceId: row.id,
      idempotencyKey: `billing:release:${row.id}`,
      description,
    });
    return true;
  });
}
