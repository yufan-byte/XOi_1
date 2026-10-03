import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { registerLimiter } from "@/middleware/rateLimiter";
import { produceCaptchaGate } from "@/middleware/captchaGate";
import { getClientIp } from "@/utils/getClientIp";
import { makeComboKey, releaseHolds } from "@/lib/failCounter";
import { setToken } from "./login";
import { z } from "zod";
import { getPlatformPolicy } from "@/utils/platformPolicy";
import { auditLogin, upsertMirrorUser } from "@/lib/userMirror";
import { NewApiError, adjustQuota, bindEmail, emailTaken, newApiLogin, newApiRegister, newApiSelfByAdmin, type NewApiUser } from "@/utils/newapi";
import { agentByCode, agentByHost, bindInvitedUser, type Agent } from "@/lib/agent/store";
import u from "@/utils";

const router = express.Router();

/** new-api 的 username 被 Go binding 硬校验在 20 字符以内（编译进二进制，后台无开关）。
 *  超长的邮箱只能另起一个登录名 —— 生成规则与造物线上一致（@ 前缀 + 随机后缀）。 */
export const MAX_USERNAME = 20;

/** 邮箱装不进 20 字符的用户名时，另生成一个（取 @ 前缀 + 随机后缀） */
export function generateUsername(email: string): string {
  const base = (email.split("@")[0] || "user").replace(/[^A-Za-z0-9_]/g, "").slice(0, 13) || "user";
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadTokenKey(): Promise<string | null> {
  const row = await u.db("o_setting").where("key", "tokenKey").first();
  return (row?.value as string | undefined) ?? null;
}

/**
 * 注册（基础频率限流 + IP 总线维度的数字图形验证码闸门 抗批量薅号）。
 *
 * 【v3.0 §5.3 改造点】
 *   原来是「本地建号 + bcrypt.hash + 送 welcomePoints」，现在改为
 *     new-api 建号 → 邮箱直连 PG 补写 → 同步本地镜像 → 签发 XOi JWT（注册即登录）。
 *
 * 【关于邮箱】造物那套「邮箱」不是邮箱验证，只是把邮箱当登录名：
 *   注册时写进 new-api 的 username（>20 字符时改用生成的短名 + 补写 email 列），
 *   登录时 new-api 查 `username = ? OR email = ?`，全程不发任何邮件。
 *   因此**不需要 SMTP 服务**也能用邮箱登录。
 *
 * 注:「用户名占用」「字符集不符」等资源冲突类拒绝非凭据泄露迹象，不计入 failCounter；
 *   注册侧的风控主要依靠 byIpOnly 总线于同 IP 尝试累计 ≥ IP_TOTAL_TRIG 时强制弹出验码兜底。
 */
export default router.post(
  "/",
  registerLimiter,
  produceCaptchaGate("register"),
  validateFields({
    // 上限放宽到 64：造物的注册框填的是邮箱，邮箱普遍超过 20 字符，
    // 真正的 20 字符限制在下面按 new-api 的规则单独处理（超长则生成短用户名）。
    username: z.string().min(3).max(64),
    password: z.string().min(6).max(100),
    email: z.string().max(64).optional(),
    aff_code: z.string().max(64).optional(),
  }),
  async (req, res) => {
    const username = String(req.body.username).trim();
    const password = String(req.body.password);
    // 前端可能把邮箱放在 username 或 email 任一字段里，统一归一化
    const rawEmail = String(req.body.email ?? "").trim() || (username.includes("@") ? username : "");
    const affCode = String(req.body.aff_code ?? "").trim();
    const clientIp = getClientIp(req);
    const ua = req.headers["user-agent"] as string | undefined;

    const policy = await getPlatformPolicy();
    if (!policy.registrationOpen || policy.maintenance) return res.status(403).send(error("平台暂未开放注册"));

    // 登录名字符集：纯用户名只允许字母/数字/下划线/中文；邮箱形态放行 @ 与 .
    const isEmailForm = rawEmail.includes("@") || username.includes("@");
    if (!isEmailForm && !/^[a-zA-Z0-9_一-龥]+$/.test(username)) {
      return res.status(400).send(error("用户名只能包含字母、数字、下划线和中文"));
    }
    if (rawEmail && !/^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(rawEmail)) {
      return res.status(400).send(error("邮箱格式不正确"));
    }

    // 先查重再注册：反过来的话，邮箱撞车时账号已经建出来了，
    // 用户拿着一个绑不上邮箱的号，既登不进（邮箱匹配不到）又不知道自己的用户名。
    if (rawEmail) {
      try {
        if (await emailTaken(rawEmail)) return res.status(409).send(error("该邮箱已被注册，请直接登录或更换邮箱"));
      } catch {
        /* 未配置 NEWAPI_PG_URL 时 emailTaken 恒为 false，走网关侧兜底 */
      }
    }

    // 归属代理，两个来源（与造物一致）：
    //  · 代理专属域名（站长在「代理审核」里分配）：在该域名注册的一律算这个代理的客户，
    //    优先于表单里的邀请码 —— 否则客户在代理的站上填了别人的码就被截走；
    //  · 代理邀请码（6 位）：走站内绑定，不交给网关自己的 aff 邀请体系。
    // 查不到代理（表还没建 / 库不可用）只记日志，绝不阻断注册。
    let hostAgent: Agent | null = null, codeAgent: Agent | null = null;
    try { hostAgent = await agentByHost(req.headers.host); } catch (e) { console.error("[register] 代理域名查询失败:", e instanceof Error ? e.message : e); }
    if (hostAgent && hostAgent.status !== "approved") hostAgent = null; // 冻结的代理：站能打开，但不再归属新客户
    if (affCode) { try { codeAgent = await agentByCode(affCode); } catch (e) { console.error("[register] 代理邀请码查询失败:", e instanceof Error ? e.message : e); } }
    if (codeAgent && codeAgent.status !== "approved") codeAgent = null;
    const agent = hostAgent ?? codeAgent;

    // 邮箱超过 20 字符时 new-api 装不下，改用生成的短登录名，邮箱另行补写
    const needFallbackName = isEmailForm && username.length > MAX_USERNAME;
    const loginId = needFallbackName ? generateUsername(username) : username;

    let created: { userId: number | null };
    try {
      // 只有**不是**代理邀请码的那个 code 才是网关自己的 aff 码；
      // 在代理域名上填了别人的码，也不能当 aff 码透传（否则网关自己又记一笔推广关系）
      created = await newApiRegister(loginId, password, { email: rawEmail || undefined, affCode: affCode && !codeAgent ? affCode : undefined });
    } catch (e) {
      const msg = e instanceof NewApiError ? e.message : "注册服务暂时不可用，请稍后重试";
      console.error("[register] 网关异常:", e instanceof Error ? e.message : e);
      void auditLogin({ name: loginId, ip: clientIp, ua, result: "blocked", reason: "register-upstream" });
      // 用户名/邮箱重复也走这里，统一以 400 回（new-api 原文案已足够清晰）
      return res.status(400).send(error(msg));
    }

    // 邮箱补写：new-api 未开邮箱验证时会丢弃注册请求里的 email 字段，
    // 必须直连 PG 写入 users.email，否则用户下次用邮箱登不回来。
    let emailBound = false;
    const uid = created.userId;
    if (uid && rawEmail) {
      emailBound = await bindEmail(uid, rawEmail);
    }

    // 取完整用户对象（拿不到就退而求其次，用已知字段构造）
    let nu: NewApiUser;
    try {
      const auth = await newApiLogin(loginId, password);
      nu = auth.user;
    } catch {
      if (!uid) return res.status(500).send(error("注册成功但账号初始化失败，请联系客服"));
      nu = { id: uid, username: loginId, email: rawEmail || undefined };
    }

    // 欢迎额度（可选）：new-api 的 quota 单位是 500000 = ¥1。
    // 默认 0 = 不赠送；D3 之后 XOi 不再有「积分」，任何赠送都必须以 quota 计。
    const welcomeQuota = Number(process.env.NEWAPI_WELCOME_QUOTA || 0);
    if (Number.isFinite(welcomeQuota) && welcomeQuota > 0) {
      await adjustQuota(nu.id, welcomeQuota).catch((e) => console.error("[register] 欢迎额度发放失败:", e instanceof Error ? e.message : e));
    }

    let mirror = await upsertMirrorUser(nu);

    // 代理归属：把刚建好的账号绑到代理名下（写 mc_agent_customers + 改 users.group = agt_<id>）。
    // 绑不上不影响注册本身 —— 站长随时可以在代理商中心的客户列表里手工归属。
    if (agent) {
      try { await bindInvitedUser(loginId, agent, hostAgent ? "domain" : "invite"); }
      catch (e) { console.error("[register] 绑定代理失败:", e instanceof Error ? e.message : e); }
      // 代理绑定会改变 users.group；立刻重读权威用户，避免本地镜像仍写着旧分组。
      try { mirror = await upsertMirrorUser(await newApiSelfByAdmin(nu.id)); } catch {}
    }

    const tokenKey = await loadTokenKey();
    if (!tokenKey) return res.status(500).send(error("服务器配置错误：tokenKey 未初始化"));

    const token = setToken({ id: mirror.id, session_version: mirror.session_version ?? 0 }, "24h", tokenKey);

    // 注册成功 ── 清解此 IP 总线持守回到基线免码状态
    releaseHolds(makeComboKey(clientIp, username), clientIp);
    void auditLogin({ uid: mirror.id, name: loginId, ip: clientIp, ua, result: "ok", reason: "register" });

    return res.status(200).send(
      success(
        {
          token: "Bearer " + token,
          name: mirror.name,
          id: mirror.id,
          display_id: mirror.display_id,
          role: mirror.role || "user",
          /** 邮箱是否真的绑上（false 时前端要提示用户记住登录名） */
          email_bound: emailBound,
          /** 邮箱过长时服务端生成的登录名，前端需明确展示给用户 */
          fallback_name: needFallbackName ? loginId : undefined,
        },
        "注册成功",
      ),
    );
  },
);
