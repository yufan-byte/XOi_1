/**
 * 代理系统（仅服务端）。
 * 移植自造物引擎 src/lib/agent-store.ts —— **SQL 与业务逻辑逐字保留**，
 * 只把 Next.js 的 `Response.json(...)` 报错出口改写成 Express 的 `agentFail(res, e)`。
 *
 * 代理 = 普通用户 + mc_agents 里一条「已批准」记录（不把代理提升为 new-api 管理员——
 * 那等于把全站交出去）。客户归属：用代理邀请码注册，或兑换了代理生成的卡密，
 * 写进 mc_agent_customers，并把客户的 new-api 用户分组设成 agt_<代理id>。
 * 加价：new-api 的「分组专属倍率」GroupGroupRatio[agt_<id>][任意使用分组] =
 * 平台倍率 × (1 + 加价%)，只对这个代理的客户生效，线路配置一行不改。
 * 收益 = 客户消费 × 加价/(100+加价)，按调价历史逐日计算。
 * 提现由代理申请、站长审核打款；卡密用代理自己的余额按面值生成。
 *
 * 这四张 mc_* 表建在 **new-api 自己的 PostgreSQL 库**里（决策 D2），
 * 与 users / tokens / logs / channels / redemptions 同库 —— 这样才能做：
 *   · 枚举全部线路分组（channels 表，网关没有这个管理端点）；
 *   · 按「天 × 费率区间」聚合 logs；
 *   · 「写归属记录 + 改 users.group」在同一个事务里完成；
 *   · 卡密「先扣款 → 调网关生成 → 失败退款」的跨表事务。
 */
import type { PoolClient } from "pg";
import type { Response as ExpressResponse } from "express";
import { db } from "./db";
import { adjustQuota, flushUsers, QuotaError, withTx } from "./quota";
import { createRedemptions, getOptions, putOption, AdminApiError } from "./newapi-admin";
import { QUOTA_PER_UNIT } from "@/utils/quota";
import { normalizeHost, validateAgentDomain } from "./domain";

export const MARKUP_MAX = 50;
export const MARKUP_DEFAULT = 10;
const MARKUP_WINDOW_MS = 30 * 86_400_000; const MARKUP_MAX_CHANGES = 10;
export const agentGroup = (agentId: number) => `agt_${agentId}`;
const TZ = "Asia/Shanghai";

export class AgentError extends Error { constructor(message: string, public status = 400) { super(message); } }

/**
 * 代理分支的统一报错出口。
 * 造物版本返回 `Response.json(...)`；Express 版本直接写 res，四种分支一一对应：
 *   AgentError   → 自带状态码（业务拒绝）
 *   QuotaError   → 400（余额不足等，可以直接告诉用户）
 *   AdminApiError→ 502 且**不外泄网关原始信息**（可能带数据库 / 内部细节）
 *   其它          → 500 + 服务端日志
 */
export function agentFail(res: ExpressResponse, e: unknown): void {
  if (e instanceof AgentError) { res.status(e.status).json({ success: false, message: e.message }); return; }
  if (e instanceof QuotaError) { res.status(400).json({ success: false, message: e.message }); return; }
  if (e instanceof AdminApiError) { console.warn("[agent] new-api:", e.message); res.status(502).json({ success: false, message: "网关操作没有成功，请稍后重试" }); return; }
  console.error("[agent]", e); res.status(500).json({ success: false, message: "操作失败，请稍后重试" });
}

let ready: Promise<void> | null = null;
export function ensureAgentTables(): Promise<void> {
  const pool = db(); if (!pool) return Promise.reject(new AgentError("数据库未配置", 500));
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS mc_agents (
      user_id integer PRIMARY KEY, status text NOT NULL DEFAULT 'pending', invite_code text UNIQUE,
      markup_pct numeric(6,2) NOT NULL DEFAULT ${MARKUP_DEFAULT}, markup_history jsonb NOT NULL DEFAULT '[]'::jsonb,
      apply jsonb NOT NULL DEFAULT '{}'::jsonb, created_at bigint NOT NULL, reviewed_at bigint, reviewed_by integer, review_note text,
      status_history jsonb NOT NULL DEFAULT '[]'::jsonb);
    ALTER TABLE mc_agents ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE mc_agents ADD COLUMN IF NOT EXISTS domain text;
    CREATE UNIQUE INDEX IF NOT EXISTS mc_agents_domain ON mc_agents (domain) WHERE domain IS NOT NULL;
    CREATE TABLE IF NOT EXISTS mc_agent_customers (
      user_id integer PRIMARY KEY, agent_id integer NOT NULL, source text NOT NULL, bound_at bigint NOT NULL);
    CREATE INDEX IF NOT EXISTS mc_agent_customers_agent ON mc_agent_customers (agent_id);
    CREATE TABLE IF NOT EXISTS mc_agent_codes (
      redemption_id integer PRIMARY KEY, agent_id integer NOT NULL, quota bigint NOT NULL, created_at bigint NOT NULL);
    CREATE INDEX IF NOT EXISTS mc_agent_codes_agent ON mc_agent_codes (agent_id);
    CREATE TABLE IF NOT EXISTS mc_agent_withdrawals (
      id serial PRIMARY KEY, agent_id integer NOT NULL, amount bigint NOT NULL, account jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'pending', note text, created_at bigint NOT NULL, processed_at bigint, processed_by integer);
    CREATE INDEX IF NOT EXISTS mc_agent_withdrawals_agent ON mc_agent_withdrawals (agent_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS mc_recruit_orders (
      id text PRIMARY KEY, user_id integer NOT NULL, pkg text NOT NULL DEFAULT '', amount numeric(12,2) NOT NULL DEFAULT 0,
      method text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '', subdomain text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT '待支付', created_at bigint NOT NULL, updated_at bigint NOT NULL);
    CREATE INDEX IF NOT EXISTS mc_recruit_orders_user ON mc_recruit_orders (user_id, created_at DESC);`)
    .then(() => undefined).catch((e) => { ready = null; throw e; });
  return ready;
}

export type AgentStatus = "pending" | "approved" | "rejected" | "frozen";
export interface Agent { userId: number; status: AgentStatus; inviteCode: string | null; /** 站长分配的专属域名（规范化后的小写主机名），在该域名注册的用户归到本代理 */ domain: string | null; markupPct: number; markupHistory: { pct: number; at: number }[]; statusHistory: { status: AgentStatus; at: number }[]; apply: { name?: string; contact?: string; reason?: string }; createdAt: number; reviewedAt: number | null; reviewNote: string | null }
const num = (v: unknown) => Number(v) || 0;
const agentRow = (r: Record<string, unknown>): Agent => ({
  userId: num(r.user_id), status: r.status as AgentStatus, inviteCode: (r.invite_code as string) ?? null, domain: (r.domain as string) ?? null, markupPct: num(r.markup_pct),
  markupHistory: (r.markup_history as Agent["markupHistory"]) ?? [], statusHistory: (r.status_history as Agent["statusHistory"]) ?? [], apply: (r.apply as Agent["apply"]) ?? {}, createdAt: num(r.created_at),
  reviewedAt: r.reviewed_at == null ? null : num(r.reviewed_at), reviewNote: (r.review_note as string) ?? null,
});

export async function agentOf(userId: number): Promise<Agent | null> {
  await ensureAgentTables();
  const r = await db()!.query("SELECT * FROM mc_agents WHERE user_id = $1", [userId]);
  return r.rows[0] ? agentRow(r.rows[0]) : null;
}
export async function agentByCode(code: string): Promise<Agent | null> {
  await ensureAgentTables();
  const r = await db()!.query("SELECT * FROM mc_agents WHERE invite_code = $1 AND status = 'approved'", [code.trim().toUpperCase()]);
  return r.rows[0] ? agentRow(r.rows[0]) : null;
}

/** 按访问域名找代理（任何状态，由调用方判断是否生效）。主站域名永远查不到：分配时就拒绝了。 */
export async function agentByHost(host: string | null | undefined): Promise<Agent | null> {
  const h = normalizeHost(host); if (!h) return null;
  await ensureAgentTables();
  const r = await db()!.query("SELECT * FROM mc_agents WHERE domain = $1", [h]);
  return r.rows[0] ? agentRow(r.rows[0]) : null;
}

/** 按需签证书前的问询：只给已分配、且代理仍在（已批准 / 冻结）的域名签。
 *  冻结的代理域名照样能打开——冻结只停归属和加价，不该让他的客户突然打不开网站。 */
export async function domainServed(host: string | null | undefined): Promise<boolean> {
  const a = await agentByHost(host);
  return !!a && (a.status === "approved" || a.status === "frozen");
}

/** 站长给代理分配 / 更换 / 清除（传空串）专属域名。换域名后旧域名立即不再归属，已绑定的客户不受影响。 */
export async function setAgentDomain(userId: number, raw: string): Promise<Agent> {
  const cur = await agentOf(userId); if (!cur) throw new AgentError("没有这个代理", 404);
  if (cur.status !== "approved" && cur.status !== "frozen") throw new AgentError("只能给已批准的代理分配域名");
  let domain: string | null = null;
  if (raw.trim()) { const v = validateAgentDomain(raw); if (!v.ok) throw new AgentError(v.message); domain = v.domain; }
  try { await db()!.query("UPDATE mc_agents SET domain = $2 WHERE user_id = $1", [userId, domain]); }
  catch (e) { if ((e as { code?: string }).code === "23505") throw new AgentError("这个域名已经分配给其他代理了"); throw e; }
  return (await agentOf(userId))!;
}

/** 普通用户申请成为代理；被拒后可以重新申请 */
export async function applyAgent(userId: number, a: { name: string; contact: string; reason: string }): Promise<Agent> {
  await ensureAgentTables();
  if (!a.name.trim() || !a.contact.trim()) throw new AgentError("请填写称呼和联系方式");
  const cur = await agentOf(userId);
  if (cur && (cur.status === "approved" || cur.status === "frozen")) throw new AgentError("你已经是代理了");
  if (cur?.status === "pending") throw new AgentError("申请已提交，请等待站长审核");
  const bound = await db()!.query("SELECT 1 FROM mc_agent_customers WHERE user_id = $1", [userId]);
  if (bound.rowCount) throw new AgentError("你是其他代理的客户，暂不能申请成为代理");
  const u = await db()!.query<{ role: number }>("SELECT role FROM users WHERE id = $1", [userId]);
  if (Number(u.rows[0]?.role ?? 0) >= 10) throw new AgentError("管理员账号不需要申请代理");
  const inTeam = await db()!.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'mc_team_members'");
  if (inTeam.rowCount && (await db()!.query("SELECT 1 FROM mc_team_members WHERE user_id = $1 AND status <> 'deleted'", [userId])).rowCount) throw new AgentError("团队成员账号不能申请成为代理");
  const apply = JSON.stringify({ name: a.name.trim().slice(0, 40), contact: a.contact.trim().slice(0, 80), reason: a.reason.trim().slice(0, 500) });
  await db()!.query(`INSERT INTO mc_agents (user_id, status, apply, created_at) VALUES ($1, 'pending', $2, $3)
    ON CONFLICT (user_id) DO UPDATE SET status = 'pending', apply = EXCLUDED.apply, created_at = EXCLUDED.created_at, review_note = NULL`, [userId, apply, Date.now()]);
  return (await agentOf(userId))!;
}

function newCode() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

/** 站长审核：approve / reject / freeze / unfreeze */
export async function reviewAgent(userId: number, action: "approve" | "reject" | "freeze" | "unfreeze", reviewerId: number, note = ""): Promise<Agent> {
  const cur = await agentOf(userId); if (!cur) throw new AgentError("没有这个申请", 404);
  const pool = db()!;
  if (action === "approve") {
    if (cur.status === "approved") return cur;
    let code = cur.inviteCode;
    for (let i = 0; !code && i < 10; i++) { const c = newCode(); const hit = await pool.query("SELECT 1 FROM mc_agents WHERE invite_code = $1", [c]); if (!hit.rowCount) code = c; }
    await pool.query(`UPDATE mc_agents SET status = 'approved', invite_code = $2, reviewed_at = $3, reviewed_by = $4, review_note = $5,
      status_history = status_history || $6::jsonb WHERE user_id = $1`, [userId, code, Date.now(), reviewerId, note.slice(0, 200), JSON.stringify([{ status: "approved", at: Date.now() }])]);
  } else {
    const next = action === "reject" ? "rejected" : action === "freeze" ? "frozen" : "approved";
    if (action === "reject" && cur.status !== "pending") throw new AgentError("只能驳回待审核的申请");
    if (action === "unfreeze" && cur.status !== "frozen") throw new AgentError("该代理没有被冻结");
    if (action === "freeze" && cur.status !== "approved") throw new AgentError("只能冻结已批准的代理");
    await pool.query(`UPDATE mc_agents SET status = $2, reviewed_at = $3, reviewed_by = $4, review_note = $5,
      status_history = status_history || $6::jsonb WHERE user_id = $1`, [userId, next, Date.now(), reviewerId, note.slice(0, 200), JSON.stringify([{ status: next, at: Date.now() }])]);
  }
  await syncAgentRatios();
  return (await agentOf(userId))!;
}

export async function listAgents(): Promise<(Agent & { username: string; email: string; customers: number })[]> {
  await ensureAgentTables();
  const r = await db()!.query(`SELECT a.*, u.username, u.email, (SELECT count(*) FROM mc_agent_customers c WHERE c.agent_id = a.user_id)::int AS customers
    FROM mc_agents a LEFT JOIN users u ON u.id = a.user_id ORDER BY (a.status = 'pending') DESC, a.created_at DESC LIMIT 500`);
  return r.rows.map((x) => ({ ...agentRow(x), username: String(x.username ?? `#${x.user_id}`), email: String(x.email ?? ""), customers: num(x.customers) }));
}

// ---------- 加价（分组专属倍率） ----------

export async function setMarkup(agent: Agent, pct: number): Promise<Agent> {
  if (agent.status !== "approved") throw new AgentError("代理账号当前不能调价", 403);
  if (!Number.isFinite(pct) || pct < 0 || pct > MARKUP_MAX) throw new AgentError(`加价率需在 0 – ${MARKUP_MAX}% 之间`);
  const rounded = Math.round(pct * 100) / 100;
  if (rounded === agent.markupPct) return agent;
  const recent = agent.markupHistory.filter((h) => Date.now() - h.at < MARKUP_WINDOW_MS).length;
  if (recent >= MARKUP_MAX_CHANGES) throw new AgentError(`30 天内最多调整 ${MARKUP_MAX_CHANGES} 次，本月次数已用完`, 429);
  const hist = [{ pct: rounded, at: Date.now() }, ...agent.markupHistory].slice(0, 100);
  await db()!.query("UPDATE mc_agents SET markup_pct = $2, markup_history = $3 WHERE user_id = $1", [agent.userId, rounded, JSON.stringify(hist)]);
  await syncAgentRatios();
  return (await agentOf(agent.userId))!;
}

/** 把所有已批准代理的加价写进 new-api 的 GroupGroupRatio：agt_<id> 用户在任何使用分组上 = 平台倍率 × (1+加价%)。
 *  非 agt_ 开头的已有条目原样保留；被冻结 / 撤销的代理条目删除（其客户回到平台原价）。线路分组会新增，所以定时重算。 */
export async function syncAgentRatios(): Promise<boolean> {
  await ensureAgentTables();
  const opts = await getOptions();
  const base = JSON.parse(opts.GroupRatio || "{}") as Record<string, number>;
  const current = JSON.parse(opts.GroupGroupRatio || "{}") as Record<string, Record<string, number>>;
  const groups = new Set(Object.keys(base));
  const ch = await db()!.query<{ g: string }>(`SELECT DISTINCT trim(unnest(string_to_array("group", ','))) AS g FROM channels WHERE status = 1`);
  for (const x of ch.rows) if (x.g) groups.add(x.g);
  groups.add("default");
  const agents = await db()!.query<{ user_id: number; markup_pct: string }>("SELECT user_id, markup_pct FROM mc_agents WHERE status = 'approved'");
  const next: Record<string, Record<string, number>> = Object.fromEntries(Object.entries(current).filter(([k]) => !k.startsWith("agt_")));
  for (const a of agents.rows) {
    const m = 1 + Number(a.markup_pct) / 100;
    next[agentGroup(Number(a.user_id))] = Object.fromEntries([...groups].sort().map((g) => [g, Math.round((base[g] ?? 1) * m * 1e6) / 1e6]));
  }
  const text = JSON.stringify(next);
  if (text === JSON.stringify(current)) return false;
  await putOption("GroupGroupRatio", text);
  return true;
}

/** 客户看到的价格系数（前台目录按它换算报价，和实际扣费一致） */
export async function priceFactorOf(userId: number): Promise<number> {
  await ensureAgentTables();
  const q = await db()!.query<{ markup_pct: string; agent_id: number; grp: string }>(`SELECT a.markup_pct, c.agent_id, u."group" AS grp FROM mc_agent_customers c
    JOIN mc_agents a ON a.user_id = c.agent_id JOIN users u ON u.id = c.user_id WHERE c.user_id = $1 AND a.status = 'approved'`, [userId]);
  const row = q.rows[0];
  if (!row || row.grp !== agentGroup(Number(row.agent_id))) return 1;
  return 1 + Number(row.markup_pct) / 100;
}

// ---------- 客户 ----------

/** 绑定客户：只在客户还没有归属、且不是代理 / 团队成员 / 管理员时生效。把客户的 new-api 分组设为 agt_<代理> */
export async function bindCustomer(userId: number, agentId: number, source: "invite" | "card" | "domain"): Promise<boolean> {
  await ensureAgentTables();
  if (userId === agentId) return false;
  const pool = db()!;
  const u = await pool.query<{ role: number; group: string }>(`SELECT role, "group" FROM users WHERE id = $1`, [userId]);
  if (!u.rows[0] || Number(u.rows[0].role) >= 10) return false;
  // 已经在特殊分组（vip 等专属价）的用户不绑：改成 agt_ 分组会把他谈好的价格换掉
  const g = String(u.rows[0].group ?? ""); if (g && g !== "default" && !g.startsWith("agt_")) return false;
  const isAgent = await pool.query("SELECT 1 FROM mc_agents WHERE user_id = $1 AND status IN ('approved','frozen','pending')", [userId]);
  if (isAgent.rowCount) return false;
  const inTeam = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'mc_team_members'");
  if (inTeam.rowCount) { const m = await pool.query("SELECT 1 FROM mc_team_members WHERE user_id = $1 AND status <> 'deleted'", [userId]); if (m.rowCount) return false; }
  const ins = await pool.query("INSERT INTO mc_agent_customers (user_id, agent_id, source, bound_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING", [userId, agentId, source, Date.now()]);
  if (!ins.rowCount) return false;
  await pool.query(`UPDATE users SET "group" = $2 WHERE id = $1`, [userId, agentGroup(agentId)]);
  // 客户原有的令牌若没写分组，会按用户分组路由（agt_ 分组下没有线路）；统一改成 default 分组
  await pool.query(`UPDATE tokens SET "group" = 'default' WHERE user_id = $1 AND ("group" IS NULL OR "group" = '')`, [userId]);
  await flushUsers([userId]);
  return true;
}

/** 全站客户的归属（站长后台的客户列表用）：user_id → 所属代理与来源 */
export async function customerOwners(): Promise<Map<number, { agentId: number; source: string }>> {
  await ensureAgentTables();
  const r = await db()!.query<{ user_id: string; agent_id: string; source: string }>("SELECT user_id, agent_id, source FROM mc_agent_customers");
  return new Map(r.rows.map((x) => [Number(x.user_id), { agentId: Number(x.agent_id), source: String(x.source) }]));
}

export interface CustomerRow { id: number; username: string; display_name: string; email: string; role: number; status: number; quota: number; used_quota: number; request_count: number; group: string; aff_code: string; aff_count: number; inviter_id: number; created_at: number; last_login_at: number; bound_at: number; source: string }

export async function customersOf(agentId: number): Promise<CustomerRow[]> {
  await ensureAgentTables();
  const r = await db()!.query(`SELECT u.id, u.username, u.display_name, u.email, u.role, u.status, u.quota, u.used_quota, u.request_count, u."group", u.aff_code, u.aff_count, u.inviter_id,
      COALESCE(u.created_at, 0) AS created_at, COALESCE(u.last_login_at, 0) AS last_login_at, c.bound_at, c.source
    FROM mc_agent_customers c JOIN users u ON u.id = c.user_id WHERE c.agent_id = $1 AND u.deleted_at IS NULL ORDER BY c.bound_at DESC`, [agentId]);
  return r.rows.map((x) => ({ id: num(x.id), username: String(x.username), display_name: String(x.display_name ?? ""), email: String(x.email ?? ""), role: num(x.role), status: num(x.status),
    quota: num(x.quota), used_quota: num(x.used_quota), request_count: num(x.request_count), group: String(x.group ?? ""), aff_code: String(x.aff_code ?? ""), aff_count: num(x.aff_count),
    inviter_id: agentId, created_at: num(x.created_at) || Math.floor(num(x.bound_at) / 1000), last_login_at: num(x.last_login_at), bound_at: num(x.bound_at), source: String(x.source) }));
}

export interface LogRow { id: number; user_id: number; created_at: number; type: number; content: string; username: string; token_name: string; model_name: string; quota: number; prompt_tokens: number; completion_tokens: number }
/** 代理客户的日志（type 0 = 充值 + 消费），只算绑定之后的 */
export async function customerLogs(agentId: number, q: { type: number; start?: number; end?: number; userId?: number; limit?: number }): Promise<LogRow[]> {
  const conds = ["c.agent_id = $1", "l.created_at * 1000 >= c.bound_at"]; const args: unknown[] = [agentId];
  if (q.type) { args.push(q.type); conds.push(`l.type = $${args.length}`); } else conds.push("l.type IN (1, 2)");
  if (q.start) { args.push(Math.floor(q.start)); conds.push(`l.created_at >= $${args.length}`); }
  if (q.end) { args.push(Math.ceil(q.end)); conds.push(`l.created_at < $${args.length}`); }
  if (q.userId) { args.push(q.userId); conds.push(`l.user_id = $${args.length}`); }
  const r = await db()!.query(`SELECT l.id, l.user_id, l.created_at, l.type, l.content, l.username, l.token_name, l.model_name, l.quota, l.prompt_tokens, l.completion_tokens
    FROM logs l JOIN mc_agent_customers c ON c.user_id = l.user_id WHERE ${conds.join(" AND ")} ORDER BY l.id DESC LIMIT ${Math.min(q.limit ?? 20000, 50000)}`, args);
  return r.rows.map((x) => ({ id: num(x.id), user_id: num(x.user_id), created_at: num(x.created_at), type: num(x.type), content: String(x.content ?? ""), username: String(x.username ?? ""), token_name: String(x.token_name ?? ""), model_name: String(x.model_name ?? ""), quota: num(x.quota), prompt_tokens: num(x.prompt_tokens), completion_tokens: num(x.completion_tokens) }));
}

// ---------- 收益与提现 ----------

/** 某时刻生效的加价率（调价历史倒序） */
export function markupAt(agent: Agent, ms: number): number {
  const h = [...agent.markupHistory].sort((a, b) => b.at - a.at).find((x) => x.at <= ms);
  if (h) return h.pct;
  // 早于第一次调价：用最早一次调价之前的默认值
  return agent.markupHistory.length ? MARKUP_DEFAULT : agent.markupPct;
}

/** 代理真正在收加价的时间段：只有 approved 期间客户才被套上加价倍率（冻结/撤销会把倍率从网关删掉，
 *  见 syncAgentRatios）。没有时间线的老数据按「一直有效」处理，避免把历史收益一次性抹掉。 */
export function earningWindows(agent: Agent): { from: number; to: number }[] {
  const hist = [...(agent.statusHistory ?? [])].sort((a, b) => a.at - b.at);
  if (!hist.length) return agent.status === "approved" || agent.status === "frozen" ? [{ from: 0, to: Infinity }] : [];
  const out: { from: number; to: number }[] = [];
  let open: number | null = null;
  for (const h of hist) {
    if (h.status === "approved" && open === null) open = h.at;
    else if (h.status !== "approved" && open !== null) { out.push({ from: open, to: h.at }); open = null; }
  }
  if (open !== null) out.push({ from: open, to: Infinity });
  return out;
}

/** 累计收益（额度单位）：按「日期 × 费率区间」聚合，每段用该段真正生效的加价率折算，
 *  并且只统计代理确实在收加价的时间段（冻结/撤销期间客户走平台原价，代理没有收入）。
 *  不能按天汇总后用当天最后一笔的费率折算——代理白天调一次价，调价前那些按旧倍率真实扣的消费
 *  会被按新倍率重算：0%→50% 能凭空造出可提现余额，反向则抹掉自己一天的真实收益。 */
export async function incomeOf(agent: Agent, since = 0, conn?: PoolClient): Promise<{ total: number; byDay: { day: string; consume: number; income: number }[] }> {
  const windows = earningWindows(agent);
  if (!windows.length) return { total: 0, byDay: [] };
  // 费率区间：按调价时间切段，段内费率恒定（早于第一次调价的那段用 markupAt 的口径）
  const cuts = [...new Set(agent.markupHistory.map((h) => h.at))].sort((a, b) => a - b);
  const rateOf = (i: number) => markupAt(agent, i === 0 ? (cuts[0] ?? 0) - 1 : cuts[i - 1]);
  // created_at 是秒；用 CASE 把每笔消费映射到所属区间下标，行数因此只有「天数 × 区间数」
  const bucket = cuts.length
    ? `CASE ${cuts.map((c, i) => `WHEN l.created_at < ${Math.floor(c / 1000)} THEN ${i}`).join(" ")} ELSE ${cuts.length} END`
    : "0";
  const inWindow = windows.map((w) => `(l.created_at >= ${Math.floor(w.from / 1000)}${w.to === Infinity ? "" : ` AND l.created_at < ${Math.floor(w.to / 1000)}`})`).join(" OR ");
  const r = await (conn ?? db()!).query<{ day: string; b: string; s: string }>(`SELECT to_char(to_timestamp(l.created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, ${bucket} AS b, SUM(l.quota) AS s
    FROM logs l JOIN mc_agent_customers c ON c.user_id = l.user_id
    WHERE c.agent_id = $1 AND l.type = 2 AND l.created_at * 1000 >= c.bound_at AND l.created_at >= $2 AND (${inWindow})
    GROUP BY 1, 2 ORDER BY 1`, [agent.userId, Math.floor(since)]);
  let total = 0; const byDay = new Map<string, { day: string; consume: number; income: number }>();
  for (const x of r.rows) {
    const m = rateOf(Number(x.b)); const consume = Number(x.s); const income = Math.floor(consume * m / (100 + m));
    total += income;
    const cur = byDay.get(x.day) ?? { day: x.day, consume: 0, income: 0 };
    cur.consume += consume; cur.income += income; byDay.set(x.day, cur);
  }
  return { total, byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)) };
}

export interface Withdrawal { id: number; amount: number; account: Record<string, unknown>; status: "pending" | "paid" | "rejected"; note: string | null; createdAt: number; processedAt: number | null }
const wRow = (x: Record<string, unknown>): Withdrawal => ({ id: num(x.id), amount: num(x.amount), account: (x.account as Record<string, unknown>) ?? {}, status: x.status as Withdrawal["status"], note: (x.note as string) ?? null, createdAt: num(x.created_at), processedAt: x.processed_at == null ? null : num(x.processed_at) });

export async function withdrawalsOf(agentId: number): Promise<Withdrawal[]> {
  await ensureAgentTables();
  const r = await db()!.query("SELECT * FROM mc_agent_withdrawals WHERE agent_id = $1 ORDER BY id DESC LIMIT 200", [agentId]);
  return r.rows.map(wRow);
}

export async function balanceOf(agent: Agent, conn?: PoolClient): Promise<{ income: number; paid: number; pending: number; available: number }> {
  const { total } = await incomeOf(agent, 0, conn);
  const w = await (conn ?? db()!).query<{ status: string; s: string }>("SELECT status, SUM(amount) AS s FROM mc_agent_withdrawals WHERE agent_id = $1 GROUP BY status", [agent.userId]);
  const by = Object.fromEntries(w.rows.map((x) => [x.status, Number(x.s)]));
  const paid = by.paid ?? 0; const pending = by.pending ?? 0;
  return { income: total, paid, pending, available: Math.max(0, total - paid - pending) };
}

export const MIN_WITHDRAW = 10 * QUOTA_PER_UNIT;
export async function requestWithdrawal(agent: Agent, amount: number, account: Record<string, unknown>): Promise<Withdrawal> {
  if (agent.status !== "approved") throw new AgentError("代理账号当前不能提现", 403);
  if (!Number.isInteger(amount) || amount < MIN_WITHDRAW) throw new AgentError(`单笔提现至少 ¥${MIN_WITHDRAW / QUOTA_PER_UNIT}`);
  return withTx(async (c: PoolClient) => {
    // 同一代理的提现串行，避免并发申请把可提余额算重
    await c.query("SELECT pg_advisory_xact_lock(727100, $1)", [agent.userId]);
    // 必须复用事务连接：withTx 已占一条，池子只有 8 条且带 5 秒超时，
    // 并发几笔提现就会互相等对方的连接，全站查库接口一起 500。
    const { available } = await balanceOf(agent, c);
    if (amount > available) throw new AgentError(`可提现余额不足（当前可提 ¥${(available / QUOTA_PER_UNIT).toFixed(2)}）`);
    const r = await c.query("INSERT INTO mc_agent_withdrawals (agent_id, amount, account, created_at) VALUES ($1,$2,$3,$4) RETURNING *", [agent.userId, amount, JSON.stringify(account).slice(0, 2000), Date.now()]);
    return wRow(r.rows[0]);
  });
}

export async function pendingWithdrawals(): Promise<(Withdrawal & { agentId: number; username: string })[]> {
  await ensureAgentTables();
  const r = await db()!.query("SELECT w.*, u.username FROM mc_agent_withdrawals w LEFT JOIN users u ON u.id = w.agent_id ORDER BY (w.status = 'pending') DESC, w.id DESC LIMIT 200");
  return r.rows.map((x) => ({ ...wRow(x), agentId: num(x.agent_id), username: String(x.username ?? `#${x.agent_id}`) }));
}

export async function processWithdrawal(id: number, action: "paid" | "rejected", adminId: number, note = ""): Promise<void> {
  const r = await db()!.query("UPDATE mc_agent_withdrawals SET status = $2, note = $3, processed_at = $4, processed_by = $5 WHERE id = $1 AND status = 'pending'", [id, action, note.slice(0, 200), Date.now(), adminId]);
  if (!r.rowCount) throw new AgentError("这笔提现不存在或已处理", 404);
}

// ---------- 卡密 ----------

export interface CodeRow { id: number; key: string; name: string; quota: number; status: number; createdAt: number; redeemedAt: number; usedUserId: number; expiredAt: number }

export async function codesOf(agentId: number): Promise<CodeRow[]> {
  await ensureAgentTables();
  const r = await db()!.query(`SELECT r.id, r.key, r.name, r.quota, r.status, r.created_time, r.redeemed_time, r.used_user_id, r.expired_time
    FROM mc_agent_codes c JOIN redemptions r ON r.id = c.redemption_id WHERE c.agent_id = $1 AND r.deleted_at IS NULL ORDER BY r.id DESC LIMIT 2000`, [agentId]);
  return r.rows.map((x) => ({ id: num(x.id), key: String(x.key), name: String(x.name ?? ""), quota: num(x.quota), status: num(x.status), createdAt: num(x.created_time) * 1000, redeemedAt: num(x.redeemed_time) * 1000, usedUserId: num(x.used_user_id), expiredAt: num(x.expired_time) > 0 ? num(x.expired_time) * 1000 : 0 }));
}

/** 用代理自己的余额按面值生成卡密：先扣款（事务），再调网关生成；网关失败就退款 */
export async function createCodes(agent: Agent, faceQuota: number, count: number, name: string, days: number): Promise<string[]> {
  if (agent.status !== "approved") throw new AgentError("代理账号当前不能生成卡密", 403);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new AgentError("数量需为 1-100");
  if (!Number.isInteger(faceQuota) || faceQuota < QUOTA_PER_UNIT / 100) throw new AgentError("面值至少 ¥0.01");
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new AgentError("有效天数需为 1-365");
  const total = faceQuota * count;
  await withTx(async (c) => { try { await adjustQuota(c, agent.userId, -total); } catch (e) { if (e instanceof QuotaError) throw new AgentError("钱包余额不足，请先充值"); throw e; } });
  await flushUsers([agent.userId]);
  let keys: string[] = [];
  try {
    keys = await createRedemptions(name || `卡密 ${new Date().toLocaleDateString("zh-CN")}`, faceQuota, count, Math.floor(Date.now() / 1000) + days * 86400);
  } catch (e) {
    await withTx(async (c) => { await adjustQuota(c, agent.userId, total); });
    await flushUsers([agent.userId]);
    throw e;
  }
  const r = await db()!.query<{ id: string }>("SELECT id FROM redemptions WHERE key = ANY($1::text[])", [keys]);
  for (const x of r.rows) await db()!.query("INSERT INTO mc_agent_codes (redemption_id, agent_id, quota, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [Number(x.id), agent.userId, faceQuota, Date.now()]);
  return keys;
}

/** 注册成功后调用（代理邀请码 / 代理专属域名）：按用户名找到新账号并绑定 */
export async function bindInvitedUser(username: string, agent: Agent, source: "invite" | "domain" = "invite"): Promise<boolean> {
  if (agent.status !== "approved") return false;
  const r = await db()!.query<{ id: string }>("SELECT id FROM users WHERE username = $1 AND deleted_at IS NULL", [username]);
  const id = Number(r.rows[0]?.id); if (!id) return false;
  return bindCustomer(id, agent.userId, source);
}

/** 代理客户新建 / 编辑令牌时没选分组：会按用户分组（agt_*，没有线路）路由，改成 default */
export async function fixTokenGroup(userId: number, group: unknown): Promise<string | null> {
  if (typeof group === "string" && group.trim()) return null;
  const r = await db()!.query<{ group: string }>(`SELECT "group" FROM users WHERE id = $1`, [userId]);
  return String(r.rows[0]?.group ?? "").startsWith("agt_") ? "default" : null;
}

/** 卡密被兑换后调用：卡密属于某代理、兑换人还没有归属 → 绑定为该代理的客户 */
export async function bindByRedeemedKey(userId: number, key: string): Promise<void> {
  await ensureAgentTables();
  const r = await db()!.query<{ agent_id: string }>(`SELECT c.agent_id FROM redemptions r JOIN mc_agent_codes c ON c.redemption_id = r.id
    JOIN mc_agents a ON a.user_id = c.agent_id WHERE r.key = $1 AND a.status = 'approved'`, [key.trim()]);
  const agentId = Number(r.rows[0]?.agent_id); if (!agentId) return;
  await bindCustomer(userId, agentId, "card");
}

/**
 * 卡密归属补扫 —— **XOi 侧的替代实现**（造物没有这个函数）。
 *
 * 造物是在它自己的 Next.js 反向代理钩子（src/app/api/[...path]/route.ts）里，
 * 兑换成功的那一刻顺手调 bindByRedeemedKey；XOi 没有那层代理（控制台不直连 new-api），
 * 所以改成定时补扫：代理生成的卡密一旦被兑换（redemptions.used_user_id > 0）、
 * 而兑换人还没有归属，就补绑一次。
 *
 * 安全性：bindCustomer 本身幂等 —— 已有归属时 ON CONFLICT DO NOTHING 直接返回 false，
 * 而且「已经属于别的代理 / 是代理本人 / 是管理员 / 在 vip 分组」都会被它挡掉，
 * 所以反复扫不会把客户从原代理手里抢走。
 */
export async function backfillCardCustomers(limit = 500): Promise<number> {
  await ensureAgentTables();
  const r = await db()!.query<{ user_id: number; agent_id: number; key: string }>(
    `SELECT r.used_user_id AS user_id, c.agent_id, r.key
       FROM redemptions r JOIN mc_agent_codes c ON c.redemption_id = r.id
       JOIN mc_agents a ON a.user_id = c.agent_id
      WHERE r.used_user_id > 0 AND r.deleted_at IS NULL AND a.status = 'approved'
        AND NOT EXISTS (SELECT 1 FROM mc_agent_customers m WHERE m.user_id = r.used_user_id)
      ORDER BY r.redeemed_time DESC NULLS LAST LIMIT $1`, [Math.max(1, Math.min(limit, 2000))]);
  let n = 0;
  for (const x of r.rows) { try { if (await bindCustomer(Number(x.user_id), Number(x.agent_id), "card")) n++; } catch (e) { console.error("[agent] 卡密归属补扫失败:", (e as Error).message); } }
  return n;
}

// ---------- 加盟订单（本就要给用户看的「我的订单」，落在 new-api 同库） ----------
/** 订单状态白名单（与前端展示一致）。未知值一律落回「待支付」，避免脏数据进库。 */
export const RECRUIT_ORDER_STATUS = ["待支付", "待联系", "已支付", "已完成", "已开通", "已取消"] as const;

export interface RecruitOrder {
  id: string; userId: number; pkg: string; amount: number; method: string;
  note: string; subdomain: string; status: string; createdAt: number; updatedAt: number;
}

const recruitOrderRow = (r: Record<string, unknown>): RecruitOrder => ({
  id: String(r.id), userId: num(r.user_id), pkg: String(r.pkg ?? ""), amount: num(r.amount),
  method: String(r.method ?? ""), note: String(r.note ?? ""), subdomain: String(r.subdomain ?? ""),
  status: String(r.status ?? "待支付"), createdAt: num(r.created_at), updatedAt: num(r.updated_at),
});

/** 我自己的加盟订单（下单时间倒序）。
 *  语义与旧的 localStorage 集合一致：订单属于「下单人」，换设备/换浏览器不再丢。 */
export async function myRecruitOrders(userId: number): Promise<RecruitOrder[]> {
  await ensureAgentTables();
  const r = await db()!.query("SELECT * FROM mc_recruit_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200", [userId]);
  return r.rows.map(recruitOrderRow);
}

/** 新建 / 更新一条加盟订单。id 由前端给（uid()），重复提交按 id 幂等覆盖；
 *  但**不许改别人的单** —— WHERE 里带 user_id，越权时 UPDATE 不发生，随后查不到即 403。 */
export async function saveRecruitOrder(userId: number, input: {
  id?: unknown; pkg?: unknown; amount?: unknown; method?: unknown; note?: unknown; subdomain?: unknown; status?: unknown;
}): Promise<RecruitOrder> {
  await ensureAgentTables();
  const id = String(input.id ?? "").trim().slice(0, 64) || `ro_${userId}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const pkg = String(input.pkg ?? "").trim().slice(0, 60);
  const amount = Math.max(0, Math.min(10_000_000, Number(input.amount) || 0));
  const method = String(input.method ?? "").trim().slice(0, 20);
  const note = String(input.note ?? "").trim().slice(0, 500);
  const subdomain = String(input.subdomain ?? "").trim().slice(0, 60);
  const status = (RECRUIT_ORDER_STATUS as readonly string[]).includes(String(input.status)) ? String(input.status) : "待支付";
  const now = Date.now();
  await db()!.query(`INSERT INTO mc_recruit_orders (id, user_id, pkg, amount, method, note, subdomain, status, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
    ON CONFLICT (id) DO UPDATE SET pkg = EXCLUDED.pkg, amount = EXCLUDED.amount, method = EXCLUDED.method,
      note = EXCLUDED.note, subdomain = EXCLUDED.subdomain, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
    WHERE mc_recruit_orders.user_id = EXCLUDED.user_id`,
    [id, userId, pkg, amount.toFixed(2), method, note, subdomain, status, now]);
  const r = await db()!.query("SELECT * FROM mc_recruit_orders WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!r.rows[0]) throw new AgentError("订单不存在或无权修改", 403);
  return recruitOrderRow(r.rows[0]);
}

// ---------- 定时：同步分组专属倍率（线路分组会随上游新增） ----------
declare global { var __xoiAgentSweeper: ReturnType<typeof setInterval> | undefined }
export function startAgentSweeper() {
  if (globalThis.__xoiAgentSweeper || !db() || !process.env.NEWAPI_ADMIN_TOKEN) return;
  const run = async () => {
    try { await syncAgentRatios(); } catch (e) { console.error("[agent] ratio sync failed:", (e as Error).message); }
    // 卡密归属补扫：兑换成功的代理卡密，把兑换人补绑成该代理的客户（造物靠反向代理钩子实时绑，
    // XOi 没有那层代理，改为定时补）。
    try { const n = await backfillCardCustomers(); if (n) console.log(`[agent] 卡密归属补扫：新增 ${n} 个客户`); } catch (e) { console.error("[agent] 卡密归属补扫失败:", (e as Error).message); }
    // 兜底：直接调网关建的空分组令牌（绕过了站内转发的改写）
    try { await db()!.query(`UPDATE tokens SET "group" = 'default' WHERE ("group" IS NULL OR "group" = '') AND user_id IN (SELECT id FROM users WHERE "group" LIKE 'agt\\_%')`); } catch (e) { console.error("[agent] token group fix failed:", (e as Error).message); }
  };
  setTimeout(run, 30_000);
  globalThis.__xoiAgentSweeper = setInterval(run, 10 * 60_000);
}
