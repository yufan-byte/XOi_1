import type { Knex } from "knex";
import { randomUUID } from "node:crypto";

export async function grantGift(db: Knex, input: { userId: number; operatorId: number; points: number; description?: string; requestId?: string }) {
  const { userId, operatorId, points, description = "管理员赠送" } = input;
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(operatorId) || operatorId <= 0 ||
      !Number.isSafeInteger(points) || points <= 0 || points > 100000) throw new Error("赠送积分参数不合法");
  const key = "gift:" + operatorId + ":" + (input.requestId || randomUUID());
  await db.transaction(async (trx) => {
    const existing = await trx("o_points_ledger").where("idempotency_key", key).first();
    if (existing) {
      if (existing.user_id !== userId || existing.amount !== points) throw new Error("重复请求的用户或积分数量不一致");
      return;
    }
    const affected = await trx("o_user").where("id", userId).increment("points", points);
    if (!affected) throw new Error("用户不存在");
    const user = await trx("o_user").where("id", userId).first();
    const now = new Date().toISOString();
    const account = await trx("o_points_account").where("user_id", userId).first();
    if (account) await trx("o_points_account").where("user_id", userId).update({ balance: user.points, version: trx.raw("version + 1"), updated_at: now });
    else await trx("o_points_account").insert({ user_id: userId, balance: user.points, frozen_balance: 0, version: 1, created_at: now, updated_at: now });
    await trx("o_points_log").insert({ user_id: userId, amount: points, type: "gift", operator_id: operatorId, description, created_at: now });
    await trx("o_points_ledger").insert({
      user_id: userId, amount: points, balance_after: user.points, type: "gift", reference_type: "admin_gift",
      idempotency_key: key, operator_id: operatorId, description, created_at: now,
    });
  });
}
