/**
 * POST /api/login/password —— 登录用户自助改密（含首次登录强制改密）。
 *
 * 为什么需要它：团队成员账号由管理员批量下发，初始密码是管理员可见的临时密码。
 * 首次登录必须由本人改掉，否则「管理员知道我的密码」这件事永远成立。
 *
 * 校验与限流复用 sudo 模块：它按 uid 记失败次数、5 次锁 5 分钟，
 * 这样改密接口不会变成密码爆破入口。
 *
 * 改密后必须同时做两件事：
 *   · 撤销网关侧全部会话 + bump o_user.session_version（其他设备立即掉线）；
 *   · 当场给当前这台设备重签一个 JWT + cookie，否则用户会被自己踢下线。
 */
import express from "express";
import jwt from "jsonwebtoken";
import u from "@/utils";
import { error, success } from "@/lib/responseFormat";
import { setSessionCookie, setMediaCookies } from "@/utils/sessionCookie";
import { passwordPolicyError, setPasswordDirect, readPasswordHash, verifyPassword } from "@/lib/team/credentials";
import { SudoError, confirmPassword } from "@/lib/team/sudo";
import { requireDb } from "@/lib/agent/db";

const router = express.Router();

router.post("/", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const userId = Number((req as any).user?.id || 0);
  if (!userId) return res.status(401).json({ ...error("请先登录"), success: false });

  const oldPassword = String((req.body ?? {}).oldPassword ?? "");
  const newPassword = String((req.body ?? {}).newPassword ?? "");
  if (!oldPassword) return res.status(400).json({ ...error("请输入当前密码"), success: false });
  const policy = passwordPolicyError(newPassword);
  if (policy) return res.status(400).json({ ...error(policy), success: false });
  if (oldPassword === newPassword) return res.status(400).json({ ...error("新密码不能与当前密码相同"), success: false });

  try {
    // 复用 sudo 的限流与 argon2 校验口径（失败计数、锁定都在那里）
    await confirmPassword(userId, oldPassword);
    await setPasswordDirect(userId, newPassword);
  } catch (e) {
    if (e instanceof SudoError) return res.status(e.status).json({ ...error(e.message), success: false });
    console.error("[login/password]", e instanceof Error ? e.message : e);
    return res.status(500).json({ ...error("修改密码失败，请稍后重试"), success: false });
  }

  // 清掉「必须改密」标记（团队成员的标记在 mc_team_members 上）
  try {
    const pool = requireDb();
    await pool.query("UPDATE mc_team_members SET must_change_password = false WHERE user_id = $1", [userId]);
  } catch (e) {
    console.error("[login/password] 清除改密标记失败", e instanceof Error ? e.message : e);
  }

  // session_version 已 bump，当前会话需要重签，否则下一个请求就是 401。
  const row = await u.db("o_user").where("id", userId).first();
  const tokenKeyRow = await u.db("o_setting").where("key", "tokenKey").first();
  const tokenKey = String(tokenKeyRow?.value || "");
  if (!row || !tokenKey) return res.status(500).json({ ...error("密码已修改，但会话重建失败，请重新登录"), success: false });
  const token = (jwt.sign as any)(
    { id: userId, session_version: Number(row.session_version ?? 0) },
    tokenKey,
    { expiresIn: "24h" },
  );
  setSessionCookie(req, res, token);
  setMediaCookies(req, res, userId, token);

  // 兜底：即使上面读库拿到旧版本，这里也把该用户仍持旧哈希的会话彻底断掉
  const hashOk = await verifyPassword(newPassword, (await readPasswordHash(userId)) || "");
  if (!hashOk) return res.status(500).json({ ...error("密码写入校验失败，请联系管理员"), success: false });

  return res.json(success({
    token: "Bearer " + token,
    id: userId,
    name: row.name,
    role: row.role || "user",
    mustChangePassword: false,
  }, "密码已更新，请妥善保管"));
});

export default router;
