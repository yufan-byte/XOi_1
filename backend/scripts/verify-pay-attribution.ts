/**
 * 验证在线充值订单归属修复（topupAttribution.ts）——用合成挂单走真实 SQL 路径。
 * 不触碰任何用户额度；结束时清理合成行。退出码 0 = 全部断言通过。
 *
 *   cd backend && npx tsx scripts/verify-pay-attribution.ts
 *
 * 注意：只 import dotenv + agent/db（pg 裸池），不要 import "@/utils"
 *（会拉起 sharp/transformers 等重依赖，在受限环境会被 SIGKILL）。
 */
import { config } from "dotenv";
config();
import { adoptGatewayTopup, discardPendingTopup } from "@/utils/pay/topupAttribution";
import { db as agentDb } from "@/lib/agent/db";

async function main() {
  const pool = agentDb();
  if (!pool) throw new Error("agent db 未配置（NEWAPI_DATABASE_URL / NEWAPI_PG_URL）");
  const tradeNo = `XOI_VERIFY_${Date.now()}`;

  // 合成一笔 root 名下的 pending 挂单（仅测试数据，不入账）
  await pool.query(
    `INSERT INTO top_ups (user_id, amount, money, trade_no, payment_method, payment_provider, create_time, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [1, 1, 0.1, tradeNo, "alipay", "epay", Math.floor(Date.now() / 1000), "pending"],
  );

  // 1) root → 用户2：应成功
  const r1 = await adoptGatewayTopup(tradeNo, 2);
  const q1 = await pool.query("SELECT user_id, status FROM top_ups WHERE trade_no = $1", [tradeNo]);

  // 2) 同单重指派给用户3（pending 态、请求生命周期内允许；trade_no 不出创建请求，跨用户不可达）
  const r2 = await adoptGatewayTopup(tradeNo, 3);
  const q2 = await pool.query("SELECT user_id FROM top_ups WHERE trade_no = $1", [tradeNo]);

  // 3) 订单已完成后改归属：应拒绝（资金安全关键保护——已支付订单归属永不可变）
  await pool.query("UPDATE top_ups SET status = 'success' WHERE trade_no = $1", [tradeNo]);
  const r3 = await adoptGatewayTopup(tradeNo, 4);

  // 4) discard 不得删除已支付订单
  const d1 = await discardPendingTopup(tradeNo, 2);
  const still = await pool.query("SELECT count(*)::int AS c FROM top_ups WHERE trade_no = $1", [tradeNo]);

  // 5) 改回 pending 后 discard 应生效（fail-closed 清理路径）
  await pool.query("UPDATE top_ups SET status = 'pending', user_id = 1 WHERE trade_no = $1", [tradeNo]);
  const d2 = await discardPendingTopup(tradeNo, 2);
  const gone = await pool.query("SELECT count(*)::int AS c FROM top_ups WHERE trade_no = $1", [tradeNo]);

  console.log(`[1] adopt root→2: ${r1}, row=${JSON.stringify(q1.rows[0])}`);
  console.log(`[2] adopt 2→3(pending,允许): ${r2}, row=${JSON.stringify(q2.rows[0])}`);
  console.log(`[3] adopt on success(应拒): ${r3}`);
  console.log(`[4] discard success 单(应 false 且行在): ${d1}, count=${still.rows[0].c}`);
  console.log(`[5] discard pending(应 true 且行删): ${d2}, count=${gone.rows[0].c}`);

  const ok =
    r1 === "ok" && Number(q1.rows[0]?.user_id) === 2 &&
    r2 === "ok" && Number(q2.rows[0]?.user_id) === 3 &&
    r3 === "adopt-failed" &&
    d1 === false && still.rows[0]?.c === 1 &&
    d2 === true && gone.rows[0]?.c === 0;

  // 兜底清理（断言失败也不留垃圾行）
  await pool.query("DELETE FROM top_ups WHERE trade_no = $1", [tradeNo]);
  console.log(ok ? "✅ 全部断言通过" : "❌ 存在断言失败（合成行已兜底清理）");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
