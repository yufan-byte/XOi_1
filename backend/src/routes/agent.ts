/**
 * 站内「代理」相关端点 —— 移植自造物引擎 src/app/api/agent/*。
 *
 * 与 /api/reseller/* 的区别：这是**普通用户**（不是站长）用的三个口子 ——
 *   GET  /api/agent/apply       我的申请状态（是否管理员 / 待审 / 已批准 / 被拒原因 / 邀请码）
 *   POST /api/agent/apply       提交代理申请（站长在代理商中心审核）
 *   GET  /api/agent/price-factor 我看到的报价系数（代理客户 = 1 + 加价%，其余 = 1）
 *   GET  /api/agent/domain-check 按需签证书前的问询（只给已分配给代理的域名放行）
 *
 * 鉴权同样走 lib/reseller/auth 的 currentUser（XOi JWT → 管理员令牌反查 new-api），
 * 所以本 Router 也必须挂在全局 XOi JWT 中间件之前。
 */
import express, { type Response } from "express";
import { currentUser } from "@/lib/reseller/auth";
import { agentFail, agentOf, applyAgent, domainServed, myRecruitOrders, priceFactorOf, saveRecruitOrder } from "@/lib/agent/store";

const router = express.Router();

const unauthorized = (res: Response) => res.status(401).json({ success: false, message: "请先登录" });

/* ------------------------------------------------------------------ */
/* GET/POST /apply → 我的代理申请状态 / 提交申请                          */
/* ------------------------------------------------------------------ */

router.get("/apply", async (req, res) => {
  const u = await currentUser(req); if (!u) return unauthorized(res);
  try {
    const a = await agentOf(u.id);
    res.json({ success: true, data: { admin: (u.role ?? 0) >= 10, status: a?.status ?? null, apply: a?.apply ?? null, reviewNote: a?.status === "rejected" ? a.reviewNote : null, inviteCode: a?.status === "approved" ? a.inviteCode : null } });
  } catch (e) { agentFail(res, e); }
});

/** 申请频率限制：同一用户 10 秒一次（进程内存，重启即清）—— 与造物一致 */
const HITS = new Map<number, number>();

router.post("/apply", async (req, res) => {
  const u = await currentUser(req); if (!u) return unauthorized(res);
  const last = HITS.get(u.id) ?? 0;
  if (Date.now() - last < 10_000) return res.status(429).json({ success: false, message: "操作过于频繁，请稍后再试" });
  HITS.set(u.id, Date.now());
  if (HITS.size > 5000) HITS.clear();
  const b = (req.body ?? {}) as { name?: unknown; contact?: unknown; reason?: unknown };
  try {
    const a = await applyAgent(u.id, { name: String(b.name ?? ""), contact: String(b.contact ?? ""), reason: String(b.reason ?? "") });
    res.json({ success: true, data: { status: a.status } });
  } catch (e) { agentFail(res, e); }
});

/* ------------------------------------------------------------------ */
/* GET/POST /orders → 我的加盟订单（招商合作页「我的订单」）              */
/* ------------------------------------------------------------------ */

/** 只返回**自己**的订单。旧实现存在 localStorage（换设备即丢，且同机登过别人账号会串），
 *  这里落 new-api 同库，按 user_id 隔离。 */
router.get("/orders", async (req, res) => {
  const u = await currentUser(req); if (!u) return unauthorized(res);
  try {
    const items = await myRecruitOrders(u.id);
    res.json({ success: true, data: { items } });
  } catch (e) { agentFail(res, e); }
});

/** 下单后写一条订单（状态先「待支付」/「待联系」，支付回调或站长开通后再改）。
 *  入参全部做长度与白名单收敛；id 幂等，但改不了别人的单。 */
router.post("/orders", async (req, res) => {
  const u = await currentUser(req); if (!u) return unauthorized(res);
  try {
    const order = await saveRecruitOrder(u.id, (req.body ?? {}) as Record<string, unknown>);
    res.json({ success: true, data: { order } });
  } catch (e) { agentFail(res, e); }
});

/* ------------------------------------------------------------------ */
/* GET /price-factor → 当前用户的报价系数                                */
/* ------------------------------------------------------------------ */

/** 代理客户 = 1 + 代理加价%，其余 = 1。前台报价按它换算，和网关实际扣费一致。
 *  未登录也返回 1（浏览目录的游客没有代理归属）。 */
router.get("/price-factor", async (req, res) => {
  const u = await currentUser(req);
  let factor = 1;
  if (u) { try { factor = await priceFactorOf(u.id); } catch (e) { console.error("[price-factor]", (e as Error).message); } }
  res.setHeader("cache-control", "private, max-age=60");
  res.json({ success: true, data: { factor } });
});

/* ------------------------------------------------------------------ */
/* GET /domain-check → 按需签证书的问询                                   */
/* ------------------------------------------------------------------ */

/** 按需签证书前的问询：?domain=<主机名> → 200 可签，其余一律 404。
 *  没有这道闸，边缘会给任何指到本机的域名去 Let's Encrypt 申请证书（每周签发额度只有 50 张）。
 *  边缘从本机直连后端、不经过反代，所以带着边缘密钥头进来的请求（= 来自公网）直接拒掉。 */
router.get("/domain-check", async (req, res) => {
  const secret = process.env.EDGE_AUTH_TOKEN;
  if (secret && req.headers["x-edge-auth"] === secret) return res.status(404).end();
  try {
    const ok = await domainServed(String((req.query as Record<string, string>).domain ?? ""));
    res.status(ok ? 200 : 404).end();
  } catch (e) {
    console.error("[domain-check]", (e as Error).message);
    res.status(503).end();
  }
});

export default router;
