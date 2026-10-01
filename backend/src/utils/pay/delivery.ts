import { db } from "@/utils/db";
import { rechargePoints, applyMembership } from "@/utils/points";

export interface FulfillExtra {
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
 * 单一事务内完成「CAS pending→paid」+「积分入账(rechargePoints)」+「会员等级与有效期升级
 * (applyMembership)」，任一步异常整体回滚、订单维持 pending 待三方重投递补偿；
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

    // ── 入账与会员升级共用本事务保证原子性；related_id 绑定 outTradeNo 作为第二道审计去重键 ──
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
