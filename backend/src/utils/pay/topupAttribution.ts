/**
 * 在线充值订单归属（2026-10-26 修复 /api/user/pay 模拟头归属 bug）。
 *
 * 背景：new-api `controller/topup.go` 的 RequestEpay 用 `c.GetInt("id")`（= 令牌归属者）
 * 写 top_ups.user_id。XOi 铁律是「站点级单一管理员令牌」，因此经 backendRaw 透传创建的
 * 订单永远归属 root——用户付了钱、额度进 root（与已实测的 /api/user/topup 同源问题）。
 *
 * 修法（不改网关、不重实现 epay 签名）：
 *   1) 仍由网关建单 —— 金额(Money = amount × Price × groupRatio × discount)、
 *      epay 参数与 MD5 签名全部保持网关唯一口径；
 *   2) 网关返回成功后，立刻把这笔 `pending` 订单 CAS 回写为真实登录用户：
 *      `UPDATE top_ups SET user_id = $uid WHERE id=$id AND status=$原status AND user_id=$原user_id`
 *      —— 用户此刻还没拿到收银台地址，epay 回调不可能发生，竞争窗口为零；
 *   3) 任何一步失败一律 fail-closed：删除这笔未支付挂单、不把支付链接发给浏览器
 *      （没有订单行，epay 回调会被网关 RechargeEpay 判「订单不存在」拒绝，不会入账给任何人）。
 *
 * 网关回调侧语义（已核对 new-api 源码）：/api/user/epay/notify 验签后按 out_trade_no 找单、
 * 校验支付方式与状态、入账给 top_ups.user_id、幂等。所以只要创建后 user_id 正确，
 * 回调入账必然正确。
 */
import { db as agentDb } from "@/lib/agent/db";

export type AdoptResult = "ok" | "order-not-found" | "adopt-failed";

/**
 * 把网关刚创建的挂单归属改写为真实登录用户。
 * 网关未来若自行修复归属（user_id 已是目标用户），本函数自然退化为 no-op。
 */
export async function adoptGatewayTopup(tradeNo: string, uid: number): Promise<AdoptResult> {
  if (!tradeNo || !Number.isSafeInteger(uid) || uid <= 0) return "adopt-failed";
  const pool = agentDb();
  if (!pool) return "adopt-failed";

  const cur = await pool.query(
    "SELECT id, user_id, status FROM top_ups WHERE trade_no = $1 LIMIT 1",
    [tradeNo],
  );
  const row = cur.rows[0];
  if (!row) return "order-not-found";
  if (Number(row.user_id) === uid) return "ok";
  // 只有未支付挂单允许改归属；success/failed/expired 等终态一律拒绝
  //（ CAS 锚点必须是 'pending' 字面量——若锚定"读取时刻的 status"则恒等于当前值，等于没锁）
  if (row.status !== "pending") return "adopt-failed";

  // CAS：status='pending' + user_id 仍为网关指派的创建者，双重锚定防并发改写
  const upd = await pool.query(
    "UPDATE top_ups SET user_id = $1 WHERE id = $2 AND status = 'pending' AND user_id = $3",
    [uid, row.id, row.user_id],
  );
  return (upd.rowCount ?? 0) === 1 ? "ok" : "adopt-failed";
}

/**
 * 删除一笔我们**没有下发支付链接**的未支付挂单（fail-closed 清理）。
 * 只允许删除：状态 pending、且归属仍不是目标用户的行 —— 已支付/已完成的订单
 * （状态非 pending）永远不会被触碰；且调用时机在把收银台地址返回给浏览器**之前**，
 * 用户不可能已发起支付。
 */
export async function discardPendingTopup(tradeNo: string, uid: number): Promise<boolean> {
  if (!tradeNo || !Number.isSafeInteger(uid) || uid <= 0) return false;
  const pool = agentDb();
  if (!pool) return false;
  try {
    const r = await pool.query(
      "DELETE FROM top_ups WHERE trade_no = $1 AND status = 'pending' AND user_id <> $2",
      [tradeNo, uid],
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}
