/**
 * 代理商中心（站长后台）API —— 移植自造物引擎 src/app/api/reseller/*（11 个 route.ts → 单一 Express Router）。
 *
 * 鉴权模型与造物一致：路由自己把 new-api JWT 透传给网关（lib/reseller/auth），
 * 因此本 Router 必须挂在 XOi 全局 JWT 中间件之前（app.ts 内 /console 回落之后）。
 *
 * 作用域：platform（new-api role ≥ 10 = 管理员，看全站）与 agent（站长批准的代理，
 * 只看自己的客户 / 收益 / 卡密）。代理体系（agent-store，4 张 mc_* 表）建在 new-api
 * 自己的 PostgreSQL 里（决策 D2），见 lib/agent/store.ts。
 */
import express, { type Request, type Response } from "express";
import axios from "axios";
import path from "node:path";
import { promises as fs } from "node:fs";
import { readData, updateSection, appendAudit } from "@/lib/reseller/store";
import { currentUser, backend, clientIp } from "@/lib/reseller/auth";
import { resolveScope, storeKeyOf } from "@/lib/reseller/scope";
import { PUBLIC_SECTIONS, DEFAULT_DATA, type FinanceConfig, type ModelsConfig, type ResellerData, type Section } from "@/lib/reseller/types";
import { allUsers, fetchLogs, isCustomer, scopedLogs, scopedUsers, scopeShare, toCny, fromCny, topupQuota, QUOTA_PER_UNIT, USD_TO_CNY, forbidden, failed, type NUser, type NLog } from "@/lib/reseller/newapi";
import {
  AgentError, agentFail, balanceOf, codesOf, createCodes, customerOwners, listAgents,
  pendingWithdrawals, processWithdrawal, requestWithdrawal, reviewAgent, setAgentDomain, setMarkup, syncAgentRatios, withdrawalsOf,
} from "@/lib/agent/store";

const router = express.Router();

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const fail = (res: Response, message: string, status = 400) => res.status(status).json({ success: false, message });

/** 异步 handler 的统一兜底：Express 4 不会自己接住 async 抛错 */
const h = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => { fn(req, res).catch((e) => failed(res, e)); };

/* ------------------------------------------------------------------ */
/* GET /me → 当前用户在代理商中心的身份                                  */
/* ------------------------------------------------------------------ */

router.get("/me", h(async (req, res) => {
  const scope = await resolveScope(req);
  if (!scope) return ok(res, { scope: null });
  // platform：root = role ≥ 100（与造物一致，new-api 约定 100 = 超级管理员）
  if (scope.kind === "platform") return ok(res, { scope: "platform", root: (scope.user.role ?? 0) >= 100 });
  const a = scope.agent;
  ok(res, { scope: "agent", status: a.status, inviteCode: a.inviteCode, domain: a.domain, markupPct: a.markupPct });
}));

/* ------------------------------------------------------------------ */
/* GET/PUT /config → 站点配置（品牌 / 主题 / 客服 / 充值档 / 邀请…）      */
/* ------------------------------------------------------------------ */

/** 代理自己能写的分区：客户备注与收款资料。站点品牌、主题、客服、充值档位等是整站的，只有站长能改。 */
const AGENT_WRITABLE: readonly Section[] = ["customers", "finance"];
/** 这些分区另有专门接口（带校验 / 服务端状态），不允许经通用配置接口整块覆盖 */
const NOT_VIA_CONFIG: readonly Section[] = ["audit", "models"];

router.get("/config", h(async (req, res) => {
  const sp = req.query as Record<string, string>;
  if (sp.all) {
    const scope = await resolveScope(req); if (!scope) return forbidden(res);
    const d = await readData(storeKeyOf(scope));
    // 不能就地改缓存对象：代理的加价来自数据库，另拼一份回包
    if (scope.kind === "agent") return ok(res, { ...d, models: { ...d.models, markupPct: scope.agent.markupPct, markupHistory: scope.agent.markupHistory, disabled: [] } });
    return ok(res, d);
  }
  const s = (sp.section ?? "site") as Section;
  if (!(PUBLIC_SECTIONS as readonly string[]).includes(s)) {
    const scope = await resolveScope(req); if (!scope) return forbidden(res);
    const d = await readData(storeKeyOf(scope)); if (!(s in d)) return fail(res, "bad section", 400);
    return ok(res, d[s]);
  }
  const d = await readData();
  let value: unknown = d[s];
  if (s === "settings") { const st = d.settings; value = { minTopup: st.minTopup, allowCustomAmount: st.allowCustomAmount, topupTiers: st.topupTiers, userInvite: st.userInvite, inviteRate: st.inviteRate, inviteReward: st.inviteReward, showInviteCodeOnSignup: st.showInviteCodeOnSignup, topupGuide: !!st.topupGuide, topupGuideText: st.topupGuideText ?? "", topupGuideButton: st.topupGuideButton ?? "", topupGuideUrl: st.topupGuideUrl ?? "", showBecomeReseller: st.showBecomeReseller ?? true, becomeResellerPopup: !!st.becomeResellerPopup }; }
  if (s === "models") value = { disabled: d.models.disabled, markupPct: d.models.markupPct };
  ok(res, value);
}));

router.put("/config", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return forbidden(res);
  const body = req.body as { section?: Section; value?: unknown; action?: string } | null;
  const section = body?.section;
  if (!section || !(section in (await readData())) || NOT_VIA_CONFIG.includes(section)) return fail(res, "bad section");
  if (scope.kind === "agent" && !AGENT_WRITABLE.includes(section)) return forbidden(res);
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) return fail(res, "bad value");
  const key = storeKeyOf(scope);
  let value = body.value as ResellerData[Section];
  if (section === "finance") {
    // 提现记录只能由服务端生成 / 审核（代理走 /api/reseller/finance POST），这里写入时保留服务器上的原值
    const cur = (await readData(key)).finance; const v = body.value as Partial<FinanceConfig>;
    value = { accounts: Array.isArray(v.accounts) ? v.accounts.slice(0, 20) : cur.accounts, profile: v.profile && typeof v.profile === "object" ? v.profile : cur.profile, invoices: Array.isArray(v.invoices) ? v.invoices.slice(0, 200) : cur.invoices, withdrawals: cur.withdrawals };
  }
  const action = typeof body.action === "string" ? body.action.slice(0, 64) : `reseller.${section}.update`;
  const next = await updateSection(section, value as never, key);
  await appendAudit({ actorRole: scope.kind === "agent" ? "agent" : "reseller", actorEmail: scope.user.email || scope.user.username, action, targetType: "reseller", targetId: String(scope.user.id), ip: clientIp(req) }, key);
  ok(res, next[section]);
}));

/* ------------------------------------------------------------------ */
/* GET/POST /audit → 审计日志                                          */
/* ------------------------------------------------------------------ */

router.get("/audit", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return forbidden(res);
  const d = await readData(storeKeyOf(scope)); ok(res, d.audit);
}));

/** POST {action, targetType?, targetId?} → 记录一条审计（例如 agreement.signed） */
router.post("/audit", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return forbidden(res);
  const b = (req.body ?? {}) as { action?: string; targetType?: string; targetId?: string };
  if (typeof b.action !== "string" || !b.action) return fail(res, "缺少 action");
  const e = await appendAudit({ actorRole: scope.kind === "agent" ? "agent" : "reseller", actorEmail: scope.user.email || scope.user.username, action: b.action.slice(0, 64), targetType: String(b.targetType ?? "reseller").slice(0, 32), targetId: String(b.targetId ?? scope.user.id).slice(0, 64), ip: clientIp(req) }, storeKeyOf(scope));
  ok(res, e);
}));

/* ------------------------------------------------------------------ */
/* GET/PUT /models → 模型配置与全站加价率                                */
/* ------------------------------------------------------------------ */

/** 加价率调整频率：30 天内最多 10 次 */
const MARKUP_WINDOW_MS = 30 * 86_400_000;
const MAX_CHANGES = 10;
const MARKUP_MAX = 50;
const DOWNSTREAM_MAX = 20;

type Opt = { key: string; value: string };
const recentChanges = (m: Pick<ModelsConfig, "markupHistory">) => m.markupHistory.filter((x) => Date.now() - x.at < MARKUP_WINDOW_MS).length;
const full = (m?: Partial<ModelsConfig>): ModelsConfig => ({ ...DEFAULT_DATA.models, ...(m ?? {}) });

async function readGroupRatio(req: Request): Promise<Record<string, number>> {
  const opts = await backend<Opt[]>(req, "/api/option/");
  const raw = opts.find((o) => o.key === "GroupRatio")?.value || "{}";
  return JSON.parse(raw) as Record<string, number>;
}

router.get("/models", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return fail(res, "forbidden", 403);
  // 代理：加价只作用于自己的客户（网关的 agt_<id> 分组专属倍率），读的是 mc_agents 表，不碰平台配置
  if (scope.kind === "agent") {
    const models: ModelsConfig = { disabled: [], markupPct: scope.agent.markupPct, markupHistory: scope.agent.markupHistory };
    return ok(res, { models, remaining: Math.max(0, MAX_CHANGES - recentChanges(models)), defaultGroupRatio: null, optionError: "", scope: "agent" });
  }
  const models = full((await readData()).models);
  let defaultGroupRatio: number | null = null; let optionError = "";
  try { defaultGroupRatio = (await readGroupRatio(req)).default ?? null; } catch (e) { optionError = (e as Error).message; }
  ok(res, { models, remaining: Math.max(0, MAX_CHANGES - recentChanges(models)), defaultGroupRatio, optionError, scope: "platform" });
}));

/**
 * PUT {action}
 * - "markup":   { markupPct } 站长：写 new-api GroupRatio.default（仅 root）
 * - "disabled": { disabled: string[] } 站长：设置禁用模型列表（客户端目录隐藏）
 * - "downstream": { downstreamMarkupPct } 站长：对分销加成
 */
router.put("/models", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return fail(res, "forbidden", 403);
  const body = req.body as { action?: string; disabled?: unknown; markupPct?: unknown; downstreamMarkupPct?: unknown } | null;
  const u = scope.user; const key = storeKeyOf(scope);
  const audit = (action: string) => appendAudit({ actorRole: "reseller", actorEmail: u.email || u.username, action, targetType: "reseller", targetId: String(u.id), ip: clientIp(req) }, key);

  // 代理：只能调自己的加价率 → 写 mc_agents + 重算网关的分组专属倍率 agt_<id>
  if (scope.kind === "agent") {
    if (body?.action !== "markup") return fail(res, "代理只能调整自己的加价率", 403);
    try {
      const before = scope.agent.markupPct;
      const a = await setMarkup(scope.agent, Number(body.markupPct));
      if (a.markupPct !== before) await appendAudit({ actorRole: "agent", actorEmail: u.email || u.username, action: "agent.markup", targetType: "reseller", targetId: String(u.id), ip: clientIp(req) }, key);
      const models: ModelsConfig = { disabled: [], markupPct: a.markupPct, markupHistory: a.markupHistory };
      return ok(res, { models, remaining: Math.max(0, MAX_CHANGES - recentChanges(models)), applied: true, optionError: "", defaultGroupRatio: null });
    } catch (e) { return agentFail(res, e); }
  }
  const cur = full((await readData()).models);
  if (body?.action === "disabled") {
    if (!Array.isArray(body.disabled) || body.disabled.some((x) => typeof x !== "string")) return fail(res, "disabled 必须是字符串数组");
    const next = { ...cur, disabled: Array.from(new Set(body.disabled as string[])).slice(0, 2000) };
    await updateSection("models", next); await audit("reseller.models.toggle");
    return ok(res, { models: next });
  }

  if (body?.action === "downstream") {
    const pct = Number(body.downstreamMarkupPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > DOWNSTREAM_MAX) return fail(res, `对分销加成需在 0 – ${DOWNSTREAM_MAX}% 之间`);
    const next = { ...cur, downstreamMarkupPct: Math.round(pct * 100) / 100 };
    await updateSection("models", next); await audit("reseller.models.downstream");
    return ok(res, { models: next });
  }

  if (body?.action === "markup") {
    // 站长加价 = 全站 default 分组倍率，影响所有用户的扣费：只允许站长（root）改，普通管理员不行
    if ((u.role ?? 0) < 100) return fail(res, "只有站长可以调整全站加价率", 403);
    const pct = Number(body.markupPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > MARKUP_MAX) return fail(res, `加价率需在 0 – ${MARKUP_MAX}% 之间`);
    const rounded = Math.round(pct * 100) / 100;
    let next = cur;
    if (rounded !== cur.markupPct) {
      if (recentChanges(cur) >= MAX_CHANGES) return fail(res, `30 天内最多调整 ${MAX_CHANGES} 次，本月次数已用完`, 429);
      next = { ...cur, markupPct: rounded, markupHistory: [{ pct: rounded, at: Date.now() }, ...cur.markupHistory].slice(0, 50) };
      await updateSection("models", next); await audit("reseller.models.markup");
    }
    let applied = false; let optionError = ""; let defaultGroupRatio: number | null = null;
    try {
      const gr = await readGroupRatio(req);
      gr.default = Math.round((1 + rounded / 100) * 10_000) / 10_000;
      await backend(req, "/api/option/", { method: "PUT", body: JSON.stringify({ key: "GroupRatio", value: JSON.stringify(gr) }) });
      applied = true; defaultGroupRatio = gr.default;
      // 代理倍率以平台倍率为底（base[g] × (1+加价%)），平台一改就得跟着重算
      try { await syncAgentRatios(); } catch (e) { console.error("[models] agent ratio sync:", (e as Error).message); }
    } catch (e) { optionError = (e as Error).message; }
    return ok(res, { models: next, remaining: Math.max(0, MAX_CHANGES - recentChanges(next)), applied, optionError, defaultGroupRatio });
  }

  return fail(res, "unknown action");
}));

/* ------------------------------------------------------------------ */
/* GET /overview → 概览聚合                                             */
/* ------------------------------------------------------------------ */

type Range = "today" | "yesterday" | "week" | "30d";
function bounds(range: Range) {
  const now = new Date(); const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (range === "today") return { start: day0, end: now.getTime(), buckets: 24, hourly: true };
  if (range === "yesterday") return { start: day0 - 86400000, end: day0, buckets: 24, hourly: true };
  if (range === "week") return { start: day0 - 6 * 86400000, end: now.getTime(), buckets: 7, hourly: false };
  return { start: day0 - 29 * 86400000, end: now.getTime(), buckets: 30, hourly: false };
}

router.get("/overview", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return forbidden(res);
  const u = scope.user;
  const range = (String((req.query as Record<string, string>).range ?? "today")) as Range;
  const { start, end, buckets, hourly } = bounds(range);
  try {
    const cfg = await readData(storeKeyOf(scope)); const share = scopeShare(scope, cfg.models.markupPct);
    const users = await scopedUsers(req, scope);
    const custIds = new Set(users.map((x) => x.id)); const byId = new Map(users.map((x) => [x.id, x]));
    const isDirect = (inviter: number) => inviter === 0 || inviter === u.id;
    const [topupsAll, topups, consumes] = await Promise.all([
      scopedLogs(req, scope, { type: 1 }), scopedLogs(req, scope, { type: 1, start: start / 1000, end: end / 1000 }), scopedLogs(req, scope, { type: 2, start: start / 1000, end: end / 1000 }),
    ]);
    const own = (l: NLog) => custIds.has(l.user_id);
    const ta = topupsAll.filter(own), tp = topups.filter(own), cs = consumes.filter(own);
    const split = (list: NLog[], val: (l: NLog) => number) => { let d = 0, i = 0; for (const l of list) { const v = val(l); if (isDirect(byId.get(l.user_id)?.inviter_id ?? 0)) d += v; else i += v; } return { direct: toCny(d), indirect: toCny(i), total: toCny(d + i) }; };
    const topupAll = split(ta, topupQuota);
    // 收入口径必须和「可提现」一致：分润来自**消费**（消费 × 加价/(100+加价)），不是充值额 × 分成。
    // 累计消费按客户的 used_quota 拆直属/间接（全量日志拉不动，用户表上就有累计值）
    const consumeAll = users.reduce((acc, x) => {
      const v = x.used_quota;
      if (isDirect(x.inviter_id)) acc.direct += v; else acc.indirect += v;
      acc.total += v; return acc;
    }, { direct: 0, indirect: 0, total: 0 });
    const incomeAll = { direct: consumeAll.direct * share, indirect: consumeAll.indirect * share, total: consumeAll.total * share };
    // 代理：可提余额 = 按调价历史逐日折算的收益 − 已打款 − 审核中（服务端表为准）
    const agentBal = scope.kind === "agent" ? await balanceOf(scope.agent) : null;
    const withdrawn = agentBal ? toCny(agentBal.paid + agentBal.pending) : cfg.finance.withdrawals.filter((w) => w.status !== "已驳回").reduce((s, w) => s + w.amount, 0);
    const consumeAllQuota = users.reduce((s, x) => s + x.used_quota, 0);
    const direct = users.filter((x) => isDirect(x.inviter_id)).length;
    const newUsers = users.filter((x) => x.created_at * 1000 >= start && x.created_at * 1000 < end);
    const newDirect = newUsers.filter((x) => isDirect(x.inviter_id)).length;
    const consume = split(cs, (l) => l.quota); const topup = split(tp, topupQuota);
    // 走势
    const series = Array.from({ length: buckets }, (_, i) => { const t = hourly ? `${String(i).padStart(2, "0")}:00` : (() => { const d = new Date(start + i * 86400000); return `${d.getMonth() + 1}/${d.getDate()}`; })(); return { t, income: 0, consume: 0, topup: 0 }; });
    const idx = (ts: number) => { const ms = ts * 1000; const i = hourly ? new Date(ms).getHours() : Math.floor((ms - start) / 86400000); return Math.min(buckets - 1, Math.max(0, i)); };
    for (const l of cs) { const b = series[idx(l.created_at)]; b.consume += toCny(l.quota); b.income += toCny(l.quota) * share; }
    for (const l of tp) series[idx(l.created_at)].topup += toCny(topupQuota(l));
    // 漏斗（全量充值日志）
    const topupCount = new Map<number, number>(); for (const l of ta) topupCount.set(l.user_id, (topupCount.get(l.user_id) ?? 0) + 1);
    const paid = topupCount.size; const repeat = [...topupCount.values()].filter((n) => n >= 2).length;
    // Top
    const cust = new Map<number, number>(); const models = new Map<string, { quota: number; count: number }>();
    for (const l of cs) { cust.set(l.user_id, (cust.get(l.user_id) ?? 0) + l.quota); const m = models.get(l.model_name) ?? { quota: 0, count: 0 }; m.quota += l.quota; m.count += 1; models.set(l.model_name, m); }
    const topCustomers = [...cust.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, q]) => ({ id, username: byId.get(id)?.username ?? `#${id}`, consume: toCny(q) }));
    const topModels = [...models.entries()].sort((a, b) => b[1].quota - a[1].quota).slice(0, 5).map(([model, m]) => ({ model, consume: toCny(m.quota), count: m.count }));
    ok(res, {
      range, markupPct: scope.kind === "agent" ? scope.agent.markupPct : cfg.models.markupPct, share, scope: scope.kind,
      totals: { income: incomeAll, withdrawable: agentBal ? toCny(agentBal.available) : Math.max(0, toCny(consumeAllQuota) * share - withdrawn), customers: users.length, direct, indirect: users.length - direct, agents: 0 },
      period: { income: { direct: consume.direct * share, indirect: consume.indirect * share, total: consume.total * share }, consume, topup, newUsers: newUsers.length, newDirect, newIndirect: newUsers.length - newDirect },
      series, funnel: { registered: users.length, paid, repeat, topupRate: users.length ? paid / users.length : 0, totalTopup: topupAll.total, repurchaseRate: paid ? repeat / paid : 0 },
      topCustomers, topModels,
    });
  } catch (e) { failed(res, e); }
}));

/* ------------------------------------------------------------------ */
/* GET /customers → 客户列表 + 统计；GET ?id= → 详情 + 充值/消费明细      */
/* ------------------------------------------------------------------ */

/** 客户从哪来：domain = 在代理专属网址注册，invite = 代理邀请码 / 链接，card = 兑换了代理的卡密 */
type Owner = { agentId?: number; source?: string };
const DAY = 86400000;

function row(x: NUser, topup: number, meta: { tags: string[]; note: string } | undefined, now: number, owner: Owner = {}) {
  const joined = x.created_at * 1000, active = x.last_login_at * 1000;
  return { id: x.id, username: x.username, displayName: x.display_name, email: x.email, role: x.role, kind: x.aff_count > 0 ? "agent" : "user", balance: toCny(x.quota), topup: toCny(topup), consume: toCny(x.used_quota), joinedAt: joined, activeAt: active, active: now - active <= 7 * DAY, online: now - active <= DAY, sleeping: now - active > 7 * DAY, isNew: now - joined <= 7 * DAY, tags: meta?.tags ?? [], note: meta?.note ?? "", agentId: owner.agentId ?? null, source: owner.source ?? null };
}

router.get("/customers", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return forbidden(res);
  const id = (req.query as Record<string, string>).id; const now = Date.now();
  try {
    const cfg = await readData(storeKeyOf(scope));
    // 归属：代理看自己的客户时来源就在客户行里；站长看全站时另查一次归属表，标出哪些用户属于哪个代理。
    // 归属表查不到（库暂时不可用）不影响列表本身，只是不显示代理归属标签。
    const owners = scope.kind === "platform" ? await customerOwners().catch(() => new Map<number, { agentId: number; source: string }>()) : null;
    const ownerOf = (x: NUser): Owner => owners ? owners.get(x.id) ?? {} : { agentId: scope.kind === "agent" ? scope.agent.userId : undefined, source: (x as NUser & { source?: string }).source };
    if (id) {
      const x = scope.kind === "platform" ? await backend<NUser>(req, `/api/user/${id}`) : (await scopedUsers(req, scope)).find((c) => String(c.id) === id);
      if (!x || !isCustomer(x)) return fail(res, "not a customer", 404);
      const logs = scope.kind === "platform"
        ? (await fetchLogs(req, { type: 0, username: x.username }, 5)).filter((l) => l.user_id === x.id && (l.type === 1 || l.type === 2))
        : await scopedLogs(req, scope, { type: 0, userId: x.id });
      const topup = logs.filter((l) => l.type === 1).reduce((s, l) => s + topupQuota(l), 0);
      const models = new Map<string, number>(); for (const l of logs) if (l.type === 2) models.set(l.model_name, (models.get(l.model_name) ?? 0) + 1);
      const topModel = [...models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      const records = logs.slice(0, 50).map((l: NLog) => ({ id: l.id, at: l.created_at * 1000, type: l.type, model: l.model_name, amount: toCny(l.type === 1 ? topupQuota(l) : l.quota), tokens: l.prompt_tokens + l.completion_tokens }));
      return ok(res, { ...row(x, topup, cfg.customers[String(x.id)], now, ownerOf(x)), frozen: 0, topModel, records });
    }
    const users = await scopedUsers(req, scope); const ids = new Set(users.map((x) => x.id));
    const topups = (await scopedLogs(req, scope, { type: 1 })).filter((l) => ids.has(l.user_id));
    const byUser = new Map<number, number>(); for (const l of topups) byUser.set(l.user_id, (byUser.get(l.user_id) ?? 0) + topupQuota(l));
    const items = users.map((x) => row(x, byUser.get(x.id) ?? 0, cfg.customers[String(x.id)], now, ownerOf(x))).sort((a, b) => b.joinedAt - a.joinedAt);
    const stats = { total: items.length, active: items.filter((i) => i.active).length, new30: items.filter((i) => now - i.joinedAt <= 30 * DAY).length, consume: items.reduce((s, i) => s + i.consume, 0) };
    const leaderboard = [...items].sort((a, b) => b.consume - a.consume).slice(0, 10).map((i) => ({ id: i.id, username: i.username, consume: i.consume }));
    ok(res, { items, stats, leaderboard });
  } catch (e) { failed(res, e); }
}));

/* ------------------------------------------------------------------ */
/* GET/POST /finance → 财务总览 / 代理提现申请                           */
/* ------------------------------------------------------------------ */

const W_STATUS = { pending: "待审核", paid: "已打款", rejected: "已驳回" } as const;

router.get("/finance", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return forbidden(res);
  const u = scope.user;
  try {
    const cfg = await readData(storeKeyOf(scope)); const share = scopeShare(scope, cfg.models.markupPct);
    const users = await scopedUsers(req, scope); const ids = new Set(users.map((x) => x.id)); const byId = new Map(users.map((x) => [x.id, x]));
    const logs = (await scopedLogs(req, scope, { type: 2 }, 10)).filter((l) => ids.has(l.user_id)).slice(0, 1000);
    const topups = (await scopedLogs(req, scope, { type: 1 }, 5)).filter((l) => ids.has(l.user_id));
    const now = new Date(); const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const month0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const income = logs.map((l) => ({ id: l.id, at: l.created_at * 1000, userId: l.user_id, username: l.username, model: l.model_name, consume: toCny(l.quota), income: toCny(l.quota) * share, direct: (byId.get(l.user_id)?.inviter_id ?? 0) === 0 || byId.get(l.user_id)?.inviter_id === u.id }));
    const sum = (f: (r: (typeof income)[number]) => boolean) => income.filter(f).reduce((s, r) => s + r.income, 0);
    const all = toCny(users.reduce((s, x) => s + x.used_quota, 0)) * share;
    // 代理：可提余额与提现记录都以服务端表为准（配置文件里的那份只有站长手工维护的历史）
    const bal = scope.kind === "agent" ? await balanceOf(scope.agent) : null;
    const wd = scope.kind === "agent"
      ? (await withdrawalsOf(scope.agent.userId)).map((w) => ({ id: String(w.id), amount: toCny(w.amount), accountId: String(w.account.accountId ?? ""), status: W_STATUS[w.status], createdAt: w.createdAt }))
      : cfg.finance.withdrawals;
    const paid = wd.filter((w) => w.status === "已打款").reduce((s, w) => s + w.amount, 0); const pending = wd.filter((w) => w.status === "待审核" || w.status === "处理中").reduce((s, w) => s + w.amount, 0);
    const contrib = new Map<number, number>(); for (const r of income) contrib.set(r.userId, (contrib.get(r.userId) ?? 0) + r.income);
    const topCustomers = [...contrib.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ id, username: byId.get(id)?.username ?? `#${id}`, income: v }));
    ok(res, {
      share, markupPct: scope.kind === "agent" ? scope.agent.markupPct : cfg.models.markupPct, wallet: toCny(u.quota ?? 0), hasTopups: topups.length > 0,
      available: bal ? toCny(bal.available) : Math.max(0, all - paid - pending), settled: paid, pending, monthIncome: sum((r) => r.at >= month0), todayIncome: sum((r) => r.at >= day0), allIncome: bal ? toCny(bal.income) : all, scope: scope.kind,
      directIncome: sum((r) => r.at >= month0 && r.direct), indirectIncome: sum((r) => r.at >= month0 && !r.direct),
      income, topCustomers, withdrawals: wd, accounts: cfg.finance.accounts, profile: cfg.finance.profile, invoices: cfg.finance.invoices,
    });
  } catch (e) { failed(res, e); }
}));

/** POST { action: "withdraw", amount: 元, accountId } → 代理申请提现（平台账号不需要提现） */
router.post("/finance", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return forbidden(res);
  const b = (req.body ?? {}) as { action?: string; amount?: number; accountId?: string };
  try {
    if (b.action !== "withdraw") throw new AgentError("未知操作");
    if (scope.kind !== "agent") throw new AgentError("站长账号不需要提现");
    const cfg = await readData(storeKeyOf(scope));
    const acct = cfg.finance.accounts.find((a) => a.id === b.accountId);
    if (!acct) throw new AgentError("请先选择收款账户（在「收款信息」里添加）");
    // 服务端按调价历史重算可提余额；状态只能由站长在 /api/reseller/agents 里改
    const w = await requestWithdrawal(scope.agent, fromCny(Number(b.amount)), { accountId: acct.id, type: acct.type, note: acct.note });
    await appendAudit({ actorRole: "agent", actorEmail: scope.user.email || scope.user.username, action: "withdrawal.create", targetType: "withdrawal", targetId: String(w.id), ip: clientIp(req) }, storeKeyOf(scope));
    ok(res, { id: w.id });
  } catch (e) { agentFail(res, e); }
}));

/* ------------------------------------------------------------------ */
/* POST /recruit → 公开：记录邀请链接的独立点击                          */
/* ------------------------------------------------------------------ */

/** 独立点击去重窗口：同一 IP 在窗口内只计一次（进程内存，重启即清） */
const CLICK_WINDOW_MS = 6 * 60 * 60 * 1000;
const seen = new Map<string, number>();
/** aff_code 真实性校验：走 new-api 用户列表（5 分钟缓存）。查不了就当不是，宁可少记一次点击。 */
let affCache: { at: number; codes: Set<string> } | null = null;
async function isRealInviteCode(req: Request, ref: string): Promise<boolean> {
  try {
    if (!affCache || Date.now() - affCache.at > 5 * 60_000) {
      const codes = new Set<string>();
      for (const u of await allUsers(req)) if (u.aff_code) codes.add(String(u.aff_code).toLowerCase());
      affCache = { at: Date.now(), codes };
    }
    return affCache.codes.has(ref);
  } catch { return false; }
}
function sweep(now: number) {
  if (seen.size < 5000) return;
  for (const [k, t] of seen) if (now - t > CLICK_WINDOW_MS) seen.delete(k);
  // 过期的都清完还超量，就从最旧的开始硬裁：这张表只增不减时本身就是内存泄漏
  if (seen.size >= 5000) { const rest = [...seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, seen.size - 4000); for (const [k] of rest) seen.delete(k); }
}

router.post("/recruit", h(async (req, res) => {
  const body = req.body as { event?: string; ref?: string } | null;
  if (body?.event !== "click") return fail(res, "unknown event");
  const ref = typeof body.ref === "string" ? body.ref.trim().toLowerCase().slice(0, 32) : "";
  const now = Date.now(); sweep(now);
  // 去重键不能含调用方可控的 ref：每次换一个 ref 去重就永不命中，而每记一次点击都要整体重写
  // 一份带 dataURL 的配置文件（数 MB）——这是个公开接口，等于给了任何人一根写盘放大棒。
  const ip = clientIp(req);
  const last = seen.get(ip);
  if (last && now - last < CLICK_WINDOW_MS) return ok(res, { counted: false });
  seen.set(ip, now);
  const d = await readData();
  // ref 必须是真实存在的邀请码，否则只当一次普通访问，不落盘
  if (ref && !(await isRealInviteCode(req, ref))) return ok(res, { counted: false });
  await updateSection("recruit", { ...d.recruit, clicks: (d.recruit.clicks ?? 0) + 1 });
  ok(res, { counted: true });
}));

/* ------------------------------------------------------------------ */
/* GET/POST /redemption → 卡密（new-api 兑换码）                         */
/* ------------------------------------------------------------------ */

interface NRedemption { id: number; user_id: number; key: string; status: number; name: string; quota: number; created_time: number; redeemed_time: number; expired_time?: number; used_user_id: number; count?: number }

router.get("/redemption", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return forbidden(res);
  try {
    // 代理只看自己生成的卡密（mc_agent_codes 关联），站长看全站
    if (scope.kind === "agent") {
      const now = Date.now();
      return ok(res, (await codesOf(scope.agent.userId)).map((r) => ({ id: r.id, key: r.key, name: r.name, amount: toCny(r.quota), status: r.status, createdAt: r.createdAt, redeemedAt: r.redeemedAt, expiredAt: r.expiredAt, usedUserId: r.usedUserId, expired: r.status === 1 && r.expiredAt > 0 && r.expiredAt < now })));
    }
    const items: NRedemption[] = [];
    for (let p = 1; p <= 10; p++) { const d = await backend<{ items: NRedemption[] }>(req, `/api/redemption/?p=${p}&page_size=100`); items.push(...(d?.items ?? [])); if ((d?.items ?? []).length < 100) break; }
    ok(res, items.map((r) => ({ id: r.id, key: r.key, name: r.name, amount: toCny(r.quota), status: r.status, createdAt: r.created_time * 1000, redeemedAt: r.redeemed_time ? r.redeemed_time * 1000 : 0, expiredAt: r.expired_time && r.expired_time > 0 ? r.expired_time * 1000 : 0, usedUserId: r.used_user_id, expired: r.status === 1 && !!r.expired_time && r.expired_time > 0 && r.expired_time * 1000 < Date.now() })));
  } catch (e) { failed(res, e); }
}));

/** 平台单批发码的面额上限（元）—— 防手滑。代理分支另有「钱包余额」这道更严的闸。 */
const MAX_BATCH_YUAN = 100_000;

/** POST {name, amount(¥), count, days} → 批量生成兑换码（quota=金额换算为 new-api 额度） */
router.post("/redemption", h(async (req, res) => {
  const scope = await resolveScope(req); if (!scope) return forbidden(res);
  const u = scope.user;
  const b = (req.body ?? {}) as { name?: string; amount?: number; count?: number; days?: number };
  if (scope.kind === "agent") {
    // 代理：从自己钱包按面值扣款后生成，兑换人自动成为该代理的客户（见 createCodes 的失败退款）
    try {
      const name = String(b.name ?? "").trim().slice(0, 40) || `卡密 ${new Date().toLocaleDateString("zh-CN")}`;
      const count = Math.floor(Number(b.count ?? 0)); const amount = Number(b.amount ?? 0); const days = Math.floor(Number(b.days ?? 30));
      const keys = await createCodes(scope.agent, Math.round(fromCny(amount)), count, name, days);
      await appendAudit({ actorRole: "agent", actorEmail: u.email || u.username, action: "redemption.create", targetType: "redemption", targetId: name, ip: clientIp(req) }, storeKeyOf(scope));
      return ok(res, { keys, name, count, amount });
    } catch (e) { return agentFail(res, e); }
  }
  const count = Math.floor(Number(b.count ?? 0)); const amount = Number(b.amount ?? 0); const days = Math.floor(Number(b.days ?? 30));
  if (!(count >= 1 && count <= 100)) return fail(res, "数量需为 1-100");
  if (!(amount > 0)) return fail(res, "金额需大于 0");
  if (!(days >= 1 && days <= 365)) return fail(res, "有效天数需为 1-365");
  // 平台（站长）发码 = 发行负债凭证，**不从任何钱包扣款**。
  // 这里曾经照抄代理分支写了「钱包余额不足」的校验 —— 那是错的：站长就是发行方，
  // 没有「先买额度」这一步；旧的判定会让余额为 0 的站长一张码都发不出（用户报的正是这个）。
  // 改为只做单批面额上限，防手滑发出天量面额。
  if (amount * count > MAX_BATCH_YUAN) return fail(res, `单批面额合计不能超过 ¥${MAX_BATCH_YUAN}`);
  try {
    const name = String(b.name ?? "").trim().slice(0, 40) || `卡密 ${new Date().toLocaleDateString("zh-CN")}`;
    const keys = await backend<string[]>(req, "/api/redemption/", { method: "POST", body: JSON.stringify({ name, quota: fromCny(amount), count, expired_time: Math.floor(Date.now() / 1000) + days * 86400 }) });
    await appendAudit({ actorRole: "reseller", actorEmail: u.email || u.username, action: "redemption.create", targetType: "redemption", targetId: name, ip: clientIp(req) });
    ok(res, { keys: keys ?? [], name, count, amount });
  } catch (e) {
    // new-api 业务拒绝（如未确认合规条款时禁用兑换码）按 400 返回原因
    const msg = (e as Error).message ?? "";
    if (/disabled|compliance|禁用|合规/i.test(msg)) return fail(res, `网关已禁用兑换码功能：请先在 new-api 管理后台确认合规条款（${msg}）`);
    failed(res, e);
  }
}));

/* ------------------------------------------------------------------ */
/* GET /upload → 登录页背景视频候选（作品展映的视频封面）                 */
/* ------------------------------------------------------------------ */

type Work = { id: string; cover_url: string; cover_kind: string };
interface LoginVideo { id: string; url: string; size: number }
let videoCache: { at: number; list: LoginVideo[] } | null = null;

async function sizeOf(url: string) {
  try {
    const r = await axios.head(url, { timeout: 4000 });
    return Number(r.headers["content-length"] ?? 0) || 0;
  } catch { return 0; }
}

router.get("/upload", h(async (_req, res) => {
  if (videoCache && Date.now() - videoCache.at < 3_600_000) return ok(res, videoCache.list);
  let works: Work[] = [];
  try {
    // 与造物同构：作品展映数据固定、不接受外部 URL。XOi 侧读 console/public/gallery_works.json 的副本。
    const raw = await fs.readFile(path.join(process.cwd(), "data", "gallery_works.json"), "utf8");
    works = ((JSON.parse(raw) as { data?: Work[] }).data ?? []).filter((w) => w.cover_kind === "video" && /^https:\/\//.test(w.cover_url));
  } catch { works = []; }
  const list = await Promise.all(works.map(async (w) => ({ id: w.id, url: w.cover_url, size: await sizeOf(w.cover_url) })));
  videoCache = { at: Date.now(), list };
  ok(res, list);
}));

/* ------------------------------------------------------------------ */
/* GET/POST /agents → 代理审核 / 提现处理 / 域名分配                      */
/* ------------------------------------------------------------------ */

/** GET：代理申请 / 已批准代理 / 提现申请。管理员可看，只有站长（role 100）能审核与处理提现。 */
router.get("/agents", h(async (req, res) => {
  const me = await currentUser(req); if (!me || (me.role ?? 0) < 10) return fail(res, "forbidden", 403);
  try {
    const [agents, withdrawals] = await Promise.all([listAgents(), pendingWithdrawals()]);
    ok(res, {
      agents: agents.map((a) => ({ id: a.userId, username: a.username, email: a.email, status: a.status, inviteCode: a.inviteCode, domain: a.domain, markupPct: a.markupPct, customers: a.customers, apply: a.apply, createdAt: a.createdAt, reviewedAt: a.reviewedAt, reviewNote: a.reviewNote })),
      withdrawals: withdrawals.map((w) => ({ id: w.id, agentId: w.agentId, username: w.username, amount: toCny(w.amount), account: w.account, status: w.status, note: w.note, createdAt: w.createdAt, processedAt: w.processedAt })),
      canManage: (me.role ?? 0) >= 100, me: me.id,
    });
  } catch (e) { agentFail(res, e); }
}));

/** POST {kind: "agent"|"withdrawal"|"domain", ...} → 审核 / 打款登记 / 域名分配
 *  {kind: "agent", userId, action: approve | reject | freeze | unfreeze, note?}
 *  {kind: "withdrawal", id, action: paid | rejected, note?}   —— 打款在线下完成，这里只登记结果
 *  {kind: "domain", userId, domain}                           —— 分配 / 更换专属域名，domain 为空串 = 收回 */
router.post("/agents", h(async (req, res) => {
  const me = await currentUser(req);
  if (!me || (me.role ?? 0) < 100) return fail(res, "只有站长可以审核代理和处理提现", 403);
  const b = (req.body ?? {}) as { kind?: string; userId?: number; id?: number; action?: string; note?: string; domain?: string };
  const note = typeof b.note === "string" ? b.note : "";
  try {
    if (b.kind === "agent") {
      const id = Number(b.userId); if (!Number.isInteger(id) || id <= 0) throw new AgentError("缺少用户");
      if (!["approve", "reject", "freeze", "unfreeze"].includes(String(b.action))) throw new AgentError("未知操作");
      if (id === me.id) throw new AgentError("不能审核自己");
      const a = await reviewAgent(id, b.action as "approve", me.id, note);
      await appendAudit({ actorRole: "reseller", actorEmail: me.email || me.username, action: `agent.${b.action}`, targetType: "user", targetId: String(id), ip: clientIp(req) });
      return ok(res, { id: a.userId, status: a.status, inviteCode: a.inviteCode });
    }
    if (b.kind === "withdrawal") {
      const id = Number(b.id); if (!Number.isInteger(id) || id <= 0) throw new AgentError("缺少提现单");
      if (b.action !== "paid" && b.action !== "rejected") throw new AgentError("未知操作");
      await processWithdrawal(id, b.action, me.id, note);
      await appendAudit({ actorRole: "reseller", actorEmail: me.email || me.username, action: `withdrawal.${b.action}`, targetType: "withdrawal", targetId: String(id), ip: clientIp(req) });
      return ok(res, { id, status: b.action });
    }
    if (b.kind === "domain") {
      const id = Number(b.userId); if (!Number.isInteger(id) || id <= 0) throw new AgentError("缺少代理");
      if (typeof b.domain !== "string") throw new AgentError("缺少域名");
      const a = await setAgentDomain(id, b.domain);
      await appendAudit({ actorRole: "reseller", actorEmail: me.email || me.username, action: a.domain ? "agent.domain.set" : "agent.domain.clear", targetType: "user", targetId: String(id), ip: clientIp(req) });
      return ok(res, { id: a.userId, domain: a.domain });
    }
    throw new AgentError("未知操作");
  } catch (e) { agentFail(res, e); }
}));

/* ------------------------------------------------------------------ */

/** quota ↔ 金额换算常量再导出：路由外（如登录注册送额）也要用同一套口径 */
export { QUOTA_PER_UNIT, USD_TO_CNY };
export default router;
