import { db } from "@/utils/db";
import { rechargePoints, applyMembership } from "@/utils/points";

export interface FulfillExtra {
  expectedChannel?: string;
  /** 三方交易号(流水号)审计列 */
  channelTradeNo?: string;
  /** 已清洗的回调业务载荷(将写入 o_order.callback_payload 留存) */
  payload?: Record<string, unknown> | string | null;
}

function safePayload(p: any): string {
  try {
    return typeof p === "string" ? p : JSON.stringify(p);
  } catch {
    return String(p);
  }
}

/**
 * 回调/触发到达后的幂等发放漏斗 —— 整条付费链路唯一的「钱→权益」转换点：
 *
 * 本地事务内完成订单 CAS；网关额度变更是独立外部操作，不属于这个数据库事务。
 * rechargePoints 先持久化幂等操作再尝试一次网关入账；不明结果必须人工对账，不能自动重发。
 * 订单回滚不代表网关额度回滚；再次回调只能复用同一操作编号。
 * 并发重复通知靠 `WHERE status='pending'` 的受影响行数天然去重——affected=0 即视为已被处理过，
 * 直接跳过发放但仍 ACK 成功以让三方停止重试。
 *
 * @returns true = 本次完成首次发放；false = 此前已处理(dup/expired/race)，调用方据此决定回执策略
 */
export async function fulfillPaidOrder(outTradeNo: string, extra: FulfillExtra = {}): Promise<boolean> {
  const nowIso = new Date().toISOString();
  let granted = false;

  await db.transaction(async (trx) => {
    const order = await trx("o_order").where("out_trade_no", outTradeNo).first();
    if (!order) {
      console.warn(`[pay] 未找到订单 ${outTradeNo}`);
      return false;
    }
    if(extra.expectedChannel && order.channel!==extra.expectedChannel)throw new Error("支付订单渠道不匹配");
    if(extra.channelTradeNo){
      await trx.raw("select pg_advisory_xact_lock(hashtext(?))",[`xoi:payment-trade:${order.channel}:${extra.channelTradeNo}`]);
      const reused=await trx("o_order").where({channel:order.channel,channel_trade_no:extra.channelTradeNo,status:"paid"}).whereNot("out_trade_no",outTradeNo).first();
      if(reused)throw new Error("渠道交易号已用于其他订单，禁止重复入账");
    }
    if (order.status !== "pending") {
      console.log(`[pay] 订单 ${outTradeNo} 当前状态 ${order.status},忽略重复通知`);
      return false;
    }

    // 原子翻转：仅当仍为 pending 才置 paid,防并发双发
    const affected = await trx("o_order")
      .where("out_trade_no", outTradeNo)
      .where("status", "pending")
      .update({
        status: "paid",
        paid_at: nowIso,
        channel_trade_no: extra.channelTradeNo ?? order.channel_trade_no ?? null,
        callback_payload:
          extra.payload !== undefined ? safePayload(extra.payload) : order.callback_payload,
      });
    if (affected === 0) {
      // 极少数并发场景下另一线程已先翻转——视为重复处理即可
      console.log(`[pay] 订单 ${outTradeNo} CAS 失败(并发被先处理),跳过`);
      return false;
    }

    // related_id 固定 outTradeNo，外部入账防重独立于当前订单事务。
    const pts = (Number(order.points_snapshot) || 0) + (Number(order.bonus_snapshot) || 0);
    if (pts > 0) {
      await rechargePoints(
        Number(order.user_id),
        pts,
        order.package_id != null && order.package_id !== "" ? Number(order.package_id) : undefined,
        undefined,
        { trx, relatedId: String(order.out_trade_no) },
      );
    }

    const lvl: string | null =
      typeof order.grant_level_snapshot === "string"
        ? order.grant_level_snapshot as string
        : null;
    if (lvl === "standard" || lvl === "premium") {
      const days = Number(order.grant_vip_days_snapshot) || 0;
      await applyMembership(Number(order.user_id), lvl, days, { trx });
    }

    granted = true;
    console.log(
      `[pay] ✅ 已发放 ${outTradeNo}: 积分+${pts}, level=${lvl || "-"}, ` +
        `days=${lvl ? order.grant_vip_days_snapshot : "-"}, user=${order.user_id}`,
    );
    return true;
  });

  return granted;
}
