/**
 * POST /api/login/session —— 会话（重新）下发 + 身份回读
 *
 * 两个用途：
 *  1. **老客户端迁移**：升级前 JWT 还躺在 localStorage，前端启动时带着 Authorization
 *     调一次本端点，后端把同一份凭据种成 httpOnly cookie，前端再把 localStorage 里的
 *     token 删掉。这样存量用户不用重新登录就能完成迁移。
 *  2. **刷新页面后的身份回读**：前端已拿不到 token 原文（cookie 是 httpOnly 的），
 *     靠本端点确认「我还登着」并取回 uid / role / exp 这些**非敏感**影子信息。
 *
 * 安全约束：
 *  · 绝不回传 token 本身 —— 回传就等于把 httpOnly 白做了。
 *  · token 里的 session_version 已由全局中间件比对过（resolveIdentity），
 *    所以能走到这里就说明凭据仍有效。
 *  · 挂载位置是 /api/login/session，不在鉴权白名单里，未登录进不来。
 */
import express from "express";
import jwt from "jsonwebtoken";
import u from "@/utils";
import { setSessionCookie, setMediaCookies, readSessionToken } from "@/utils/sessionCookie";

const router = express.Router();

export default router.post("/", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const identity = (req as unknown as { user?: { id?: number; role?: string } }).user;
  if (!identity?.id) return res.status(401).json({ message: "未登录" });

  // 拿本次请求实际用的凭据：header 优先，其次已有的会话 cookie。
  // 只要非空就重新种一遍 cookie —— 相当于给会话续期，顺带完成老客户端的迁移。
  const token =
    String(req.headers.authorization || "").replace(/^(Bearer\s+)+/i, "") || readSessionToken(req);
  if (!token) return res.status(401).json({ message: "未提供token" });

  const mirror = await u.db("o_user").where("id", identity.id).first();
  if (!mirror) return res.status(401).json({ message: "账号不存在，请重新登录" });

  setSessionCookie(req, res, token);
  // 会话（重新）下发时把媒体授权 cookie 一起补齐 —— 老客户端迁移后同样能看私有素材。
  setMediaCookies(req, res, mirror.id, token);

  // exp 由服务端从已验签的凭据里解出，供前端做「本地过期提示」用（真正的校验永远在服务端）。
  let exp = 0;
  try {
    const decoded = jwt.decode(token);
    if (decoded && typeof decoded === "object" && typeof (decoded as { exp?: number }).exp === "number") {
      exp = (decoded as { exp: number }).exp;
    }
  } catch {
    /* 解不出 exp 只影响前端提示精度，不影响会话有效性 */
  }

  return res.status(200).json({
    id: mirror.id,
    name: mirror.name,
    display_id: mirror.display_id ?? null,
    role: mirror.role || "user",
    /** 秒级时间戳；0 表示未知 */
    exp,
    /** 服务端确认会话已生效（cookie 已种），前端可据此切换到 cookie 依赖模式 */
    session: true,
  });
});
