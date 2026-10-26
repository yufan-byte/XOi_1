/**
 * GET  /api/user/topup/info —— 充值通道开关（是否开启在线充值 / 各渠道 / 是否可用卡密）
 * POST /api/user/topup      —— 卡密兑换
 *
 * ⚠️ 资金归属修复（2026-10-24 渗透实测）：
 *   以前 POST 走 backendRaw 透传网关 /api/user/topup（管理员令牌 + New-Api-User 头）——
 *   但网关的用户端点**忽略 New-Api-User 模拟头**，兑换全部记到管理员令牌本人（root）：
 *   实测用户 B 兑换 ¥0.01 卡密，quota 加到了 root、B 仍是 0。钱归集到平台账号、
 *   用户拿不到额度 —— 卡密收款模式的致命 bug（生产同样存在）。
 *
 *   修复：兑换不再透传网关用户端点，改由服务端直查网关同库（决策 D2 的 PG 连接）
 *   做原子兑换，再经 /api/user/manage add_quota（真实的管理动作，只对目标用户加钱）
 *   把面额记到登录用户名下。UPDATE ... WHERE status=1 的行锁保证同一张卡并发只兑一次。
 *
 *   合规闸门保留：网关 `payment_setting.compliance_confirmed` 未确认时，卡密兑换依旧拒绝
 *   （读网关 option，与网关口径一致），不绕过平台的支付合规开关。
 */
import express from "express";
import { backendRaw, currentUser } from "@/lib/reseller/auth";
import { success, error } from "@/lib/responseFormat";
import { db as agentDb } from "@/lib/agent/db";
import { adjustQuota } from "@/utils/newapi";

const router = express.Router();

router.get("/info", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  try {
    const { status, body } = await backendRaw(req, "/api/user/topup/info");
    res.status(status).json(body);
  } catch (e) {
    res.status(502).json({ success: false, message: `读取充值配置失败：${(e as Error).message}` });
  }
});

/** 网关合规开关（与网关 /api/user/topup 前置的同名 option 口径一致） */
async function complianceConfirmed(): Promise<boolean> {
  const pool = agentDb();
  if (!pool) return false;
  const r = await pool.query("SELECT value FROM options WHERE key = 'payment_setting.compliance_confirmed' LIMIT 1");
  const raw = r.rows[0]?.value;
  return raw === true || raw === "true" || raw === "1";
}

router.post("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  const uid = Number(me.id);
  if (!Number.isSafeInteger(uid) || uid <= 0) return res.status(401).json({ success: false, message: "请先登录" });

  const key = String((req.body ?? {}).key ?? "").trim().slice(0, 64);
  if (!key || key.length < 8 || /\s/.test(key)) return res.status(400).json({ success: false, message: "请填写有效的兑换码" });

  try {
    if (!(await complianceConfirmed())) {
      return res.status(400).json({ success: false, message: "平台尚未开启卡密兑换（网关支付合规条款未确认），请联系管理员" });
    }
    const pool = agentDb();
    if (!pool) return res.status(503).json({ success: false, message: "数据库暂时不可用，请稍后重试" });

    // 原子兑换：status=1（未使用）才允许核销 —— 并发/重复提交只有一个赢家
    const redeemed = await pool.query(
      `UPDATE redemptions
       SET status = 3, used_user_id = $1, redeemed_time = extract(epoch from now())::bigint
       WHERE key = $2 AND status = 1
         AND (expired_time IS NULL OR expired_time = 0 OR expired_time > extract(epoch from now())::bigint)
         AND deleted_at IS NULL
       RETURNING id, quota`,
      [uid, key],
    );
    if (!redeemed.rowCount) {
      const probe = await pool.query("SELECT status, expired_time FROM redemptions WHERE key = $1 AND deleted_at IS NULL LIMIT 1", [key]);
      const row = probe.rows[0];
      if (!row) return res.status(400).json({ success: false, message: "兑换码不存在，请核对后重试" });
      if (Number(row.status) !== 1) return res.status(400).json({ success: false, message: "兑换码已被使用或已禁用" });
      return res.status(400).json({ success: false, message: "兑换码已过期" });
    }
    const quota = Number(redeemed.rows[0].quota) || 0;

    // 面额记到登录用户名下（网关 /api/user/manage add_quota：真实管理动作，目标明确）
    const after = await adjustQuota(uid, quota);
    if (after === null) {
      // 加钱失败必须回滚核销，否则用户丢了卡密
      await pool.query("UPDATE redemptions SET status = 1, used_user_id = NULL, redeemed_time = 0 WHERE id = $1", [redeemed.rows[0].id]);
      return res.status(502).json({ success: false, message: "额度到账失败，卡密已恢复，请稍后重试" });
    }

    return res.json(success({ quota: quota / 500000 }));
  } catch (e) {
    res.status(502).json({ success: false, message: `兑换失败：${(e as Error).message}` });
  }
});

export default router;
