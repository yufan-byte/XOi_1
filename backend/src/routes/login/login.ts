import express from "express";
import u from "@/utils";
import jwt from "jsonwebtoken";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { loginLimiter } from "@/middleware/rateLimiter";
import { produceCaptchaGate } from "@/middleware/captchaGate";
import { getClientIp } from "@/utils/getClientIp";
import { makeComboKey, markFailure, releaseHolds } from "@/lib/failCounter";
import { auditLogin, upsertMirrorUser } from "@/lib/userMirror";
import { NewApiError, newApiLogin } from "@/utils/newapi";
import { setSessionCookie, setMediaCookies } from "@/utils/sessionCookie";
import { mustChangePasswordOf } from "@/lib/team/store";
import { z } from "zod";

const router = express.Router();

export function setToken(payload: string | object, expiresIn: string | number, secret: string): string {
  if (!payload || typeof secret !== "string" || !secret) {
    throw new Error("参数不合法");
  }
  return (jwt.sign as any)(payload, secret, { expiresIn });
}

/** tokenKey 是 XOi 自己签发 JWT 用的密钥，与 new-api 无关，保持原状 */
async function loadTokenKey(): Promise<string | null> {
  const row = await u.db("o_setting").where("key", "tokenKey").first();
  return (row?.value as string | undefined) ?? null;
}

/**
 * 登录（基础频率限流 + 凭据失败次数触发的数字图形验证码闸门 双保险防爆破）
 *
 * 【v3.0 §5.3 改造点】
 *   原来是「查本地 o_user + bcrypt.compare」，现在改为「向 new-api 校验凭据」。
 *   XOi 本地只保留一张镜像表 o_user（id == newapi uid），对外继续签发 XOi 自己的 JWT，
 *   因此 resolveIdentity() / requireAdmin / 全站 userId 外键一行都不用改。
 *
 * 【保留不动的部分】这些是 XOi 比造物强的地方，别丢：
 *   · loginLimiter 频率限流
 *   · produceCaptchaGate 数字图形验证码闸门
 *   · failCounter 软持有：失败累计到阈值后强制弹码
 *   · 登录场不套字符集/长度正则（防枚举），真伪一律交给网关裁定
 *   · 统一以「用户名或密码错误」回应，不泄露账号是否存在
 */
export default router.post(
  "/",
  loginLimiter,
  produceCaptchaGate("login"),
  // 登录场仅做空值／超长(payload 防 DoS)防护，绝不卡内容格式正则：
  //   错误密码可能是任意形态（短至 1 位、纯符号、半截复制粘贴…）；此处若套 min(N)/charset 规则会
  //   把本应判作「凭据不符」的尝试提前拦截在校验层并回弹通用「参数错误」（见 middleware.validateFields 兜底）,
  //   既误导用户又向爆破者泄露后端阈值口径。一切真伪裁定交给网关，统一以「用户名或密码错误」回应。
  validateFields({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(100),
  }),
  async (req, res) => {
    res.setHeader("Cache-Control","no-store");
    const { username, password } = req.body;
    const trimmedUsername = String(username).trim();
    const clientIp = getClientIp(req);
    const comboKey = makeComboKey(clientIp, trimmedUsername);
    const ua = req.headers["user-agent"] as string | undefined;

    let auth;
    try {
      auth = await newApiLogin(trimmedUsername, password);
    } catch (e) {
      if (e instanceof NewApiError && e.isCredentialFailure) {
        // 凭据不符：累加失败计数，越过阈值后由 captchaGate 强制弹码(SOFT-HOLD)
        markFailure(comboKey, clientIp);
        void auditLogin({ name: trimmedUsername, ip: clientIp, ua, result: "fail", reason: "credential" });
        return res.status(400).send(error("用户名或密码错误"));
      }
      // 网关不可用 / 配置缺失 / 版本不兼容：不算凭据失败，
      // 否则网关一抖就会把正常用户推进验证码闸门里出不来。
      const msg = e instanceof NewApiError ? e.message : "登录服务暂时不可用，请稍后重试";
      console.error("[login] 网关异常:",e instanceof NewApiError?e.upstreamCode||e.status:"unknown", e instanceof Error ? e.message : e);
      void auditLogin({ name: trimmedUsername, ip: clientIp, ua, result: "blocked", reason: "upstream" });
      const status=e instanceof NewApiError&&[409,429].includes(e.status)?e.status:503;
      return res.status(status).send({...error(msg),...(e instanceof NewApiError&&e.upstreamCode?{authCode:e.upstreamCode}:{})});
    }

    // 网关放行 → 同步本地镜像（顺带把 role / 封禁状态带下来）
    let mirror;
    try {
      mirror = await upsertMirrorUser(auth.user);
    } catch (e) {
      console.error("[login] 本地镜像同步失败:", e instanceof Error ? e.message : e);
      return res.status(500).send(error("登录成功但账户初始化失败，请稍后重试"));
    }

    if (mirror.status === "banned") {
      return res.status(403).send(error("账号已被封禁"));
    }

    const tokenKey = await loadTokenKey();
    if (!tokenKey) return res.status(500).send(error("服务器配置错误：tokenKey 未初始化"));

    const token = setToken(
      {
        id: mirror.id, // == newapi uid
        session_version: mirror.session_version ?? 0,
      },
      "24h",
      tokenKey,
    );

    // 登录成功 ── 解除该账号/IP 的风控软持有令其回归基线免码常态
    releaseHolds(comboKey, clientIp);
    void auditLogin({ uid: mirror.id, name: mirror.name ?? trimmedUsername, ip: clientIp, ua, result: "ok" });

    // F3：同时下发 httpOnly 会话 cookie。响应体仍回 token（未迁移的客户端继续用 header 也能用），
    // 但前端已改为不把它写 localStorage —— XSS 再也拿不到可持久化的凭据。
    // 管理员代建 / 被重置过密码的团队账号：首次登录必须先改掉初始密码。
    const mustChangePassword = await mustChangePasswordOf(mirror.id);

    setSessionCookie(req, res, token);
    // 媒体（/oss）授权也一并下发：前端已拿不到 JWT 原文，不能再自己算 hint。
    setMediaCookies(req, res, mirror.id, token);

    return res.status(200).send(
      success(
        {
          token: "Bearer " + token,
          name: mirror.name,
          id: mirror.id,
          display_id: mirror.display_id,
          role: mirror.role || "user",
          mustChangePassword,
        },
        "登录成功",
      ),
    );
  },
);
