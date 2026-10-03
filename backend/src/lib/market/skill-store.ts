/**
 * Skill 市场的服务端存储 —— 移植自造物引擎 src/lib/skill-store.ts（逐字平移，未改语义）。
 *
 * 差别只有两处：
 *   1. 库连接：造物走 `@/lib/newapi-db` 的 `db()`，这里复用它同一个池（`@/lib/agent/db`）——
 *      两条链路写的是同一个 new-api 库（决策 D2），没必要开第二个连接池。
 *   2. 报错出口：造物返回 Next 的 `Response.json(...)`，这里是 Express，改成 `skillFail(res, e)`。
 *
 * 表（mc_skills / mc_skill_saves）同样由本模块自己 ensure，不归 initDB 管 —— 它们是
 * new-api 库里的「市场」表，和 mc_agents 那四张是同一类东西。
 */
import type { Response as ExpressResponse } from "express";
import { db } from "@/lib/agent/db";

export const SKILL_LIMITS = { name: 40, description: 300, body: 256 * 1024, cover: 500, tools: 24, models: 12 } as const;
export const SCOPES = ["chat", "vibeapp", "canvas", "ppt", "promptwriter"] as const;
export type Scope = (typeof SCOPES)[number];
export type SkillStatus = "private" | "pending" | "published" | "rejected";

export class SkillError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** 统一的报错出口（对应造物的 skillFail） */
export function skillFail(res: ExpressResponse, e: unknown): void {
  if (e instanceof SkillError) { res.status(e.status).json({ success: false, message: e.message }); return; }
  console.error("[skills]", e);
  res.status(500).json({ success: false, message: "操作失败，请稍后重试" });
}

let ready: Promise<void> | null = null;
export function ensureSkillTables(): Promise<void> {
  const pool = db(); if (!pool) return Promise.reject(new SkillError("数据库未配置", 503));
  ready ??= (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS mc_skills (
      id text PRIMARY KEY, user_id integer NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '',
      body text NOT NULL DEFAULT '', agent_scope text NOT NULL DEFAULT 'chat', category_id text NOT NULL DEFAULT 'chat',
      cover_url text NOT NULL DEFAULT '', tools jsonb NOT NULL DEFAULT '[]'::jsonb, models jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'private', visible boolean NOT NULL DEFAULT true, share_code text,
      review_note text, saves integer NOT NULL DEFAULT 0, created_at bigint NOT NULL, updated_at bigint NOT NULL)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS mc_skills_share ON mc_skills (share_code) WHERE share_code IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mc_skills_user ON mc_skills (user_id, updated_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mc_skills_market ON mc_skills (status, visible, updated_at DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mc_skill_saves (
      user_id integer NOT NULL, skill_id text NOT NULL, saved_at bigint NOT NULL, PRIMARY KEY (user_id, skill_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mc_skill_installs (
      user_id integer NOT NULL, skill_id text NOT NULL, installed_at bigint NOT NULL, PRIMARY KEY (user_id, skill_id))`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export interface SkillRow {
  id: string; userId: number; name: string; description: string; body: string; agentScope: string; categoryId: string;
  coverUrl: string; tools: string[]; models: string[]; status: SkillStatus; visible: boolean; shareCode: string | null;
  reviewNote: string | null; saves: number; createdAt: number; updatedAt: number; author?: string;
}
const num = (v: unknown) => Number(v) || 0;
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);
const row = (x: Record<string, unknown>): SkillRow => ({
  id: String(x.id), userId: num(x.user_id), name: String(x.name), description: String(x.description ?? ""), body: String(x.body ?? ""),
  agentScope: String(x.agent_scope ?? "chat"), categoryId: String(x.category_id ?? "chat"), coverUrl: String(x.cover_url ?? ""),
  tools: arr(x.tools, SKILL_LIMITS.tools), models: arr(x.models, SKILL_LIMITS.models), status: x.status as SkillStatus,
  visible: !!x.visible, shareCode: (x.share_code as string) ?? null, reviewNote: (x.review_note as string) ?? null,
  saves: num(x.saves), createdAt: num(x.created_at), updatedAt: num(x.updated_at),
  ...(x.username ? { author: String(x.username) } : {}),
});

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
export const newSkillId = () => `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface SkillInput {
  id?: string; name: string; description: string; body: string; agentScope: string; categoryId: string;
  coverUrl?: string; tools?: unknown; models?: unknown; visible?: boolean; submit?: boolean;
}

/** 新建 / 更新自己的 Skill。
 *  上架（submit）目前只有站长能做（站长 2026-09-20 要求）：普通用户建的 Skill 只属于自己，
 *  能在智能体里启用、能用分享码给别人，但不会进市场。 */
export async function saveSkill(userId: number, x: SkillInput, canPublish = false): Promise<SkillRow> {
  if (x.submit && !canPublish) throw new SkillError("Skill 上架目前只由站长发布；你可以保存自用，或把分享码给需要的人", 403);
  await ensureSkillTables();
  const name = String(x.name ?? "").trim(); const description = String(x.description ?? "").trim();
  if (!name) throw new SkillError("请填写 Skill 名称");
  if (name.length > SKILL_LIMITS.name) throw new SkillError(`名称最多 ${SKILL_LIMITS.name} 字`);
  if (!description) throw new SkillError("请填写一句话简介（智能体靠它判断什么时候用这个 Skill）");
  if (description.length > SKILL_LIMITS.description) throw new SkillError(`简介最多 ${SKILL_LIMITS.description} 字`);
  const body = String(x.body ?? "");
  if (Buffer.byteLength(body) > SKILL_LIMITS.body) throw new SkillError("正文过长，请精简后再保存");
  const scope = (SCOPES as readonly string[]).includes(x.agentScope) ? x.agentScope : "chat";
  const category = String(x.categoryId ?? "chat").slice(0, 40) || "chat";
  const cover = String(x.coverUrl ?? "").slice(0, SKILL_LIMITS.cover);
  if (cover && !/^(https?:\/\/|\/api\/media\/)/.test(cover)) throw new SkillError("封面需要是 http(s) 链接或站内上传的地址");
  const tools = arr(x.tools, SKILL_LIMITS.tools); const models = arr(x.models, SKILL_LIMITS.models);
  const now = Date.now();
  const pool = db()!;

  if (x.id) {
    const cur = await pool.query("SELECT * FROM mc_skills WHERE id = $1 AND user_id = $2", [x.id, userId]);
    if (!cur.rowCount) throw new SkillError("这个 Skill 不存在或不属于你", 404);
    const prev = row(cur.rows[0]);
    // 已上架的 Skill 改了内容要重新审核；只改「市场可见」不影响状态
    const contentChanged = prev.name !== name || prev.description !== description || prev.body !== body || prev.coverUrl !== cover;
    // 站长提交即上架（他就是审核人）；内容改了也直接生效
    const status: SkillStatus = x.submit ? "published" : prev.status === "published" || prev.status === "pending" ? (contentChanged ? "private" : prev.status) : "private";
    const r = await pool.query(`UPDATE mc_skills SET name=$3, description=$4, body=$5, agent_scope=$6, category_id=$7, cover_url=$8,
        tools=$9, models=$10, visible=$11, status=$12, review_note = CASE WHEN $12 = 'rejected' THEN review_note ELSE NULL END, updated_at=$13
      WHERE id=$1 AND user_id=$2 RETURNING *`,
      [x.id, userId, name, description, body, scope, category, cover, JSON.stringify(tools), JSON.stringify(models), x.visible !== false, status, now]);
    return row(r.rows[0]);
  }

  const count = await pool.query<{ n: string }>("SELECT count(*) AS n FROM mc_skills WHERE user_id = $1", [userId]);
  if (Number(count.rows[0].n) >= 200) throw new SkillError("最多保存 200 个自建 Skill");
  const id = newSkillId();
  let code = newCode();
  for (let i = 0; i < 5; i++) { const hit = await pool.query("SELECT 1 FROM mc_skills WHERE share_code = $1", [code]); if (!hit.rowCount) break; code = newCode(); }
  const r = await pool.query(`INSERT INTO mc_skills (id, user_id, name, description, body, agent_scope, category_id, cover_url, tools, models, status, visible, share_code, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING *`,
    [id, userId, name, description, body, scope, category, cover, JSON.stringify(tools), JSON.stringify(models), x.submit ? "published" : "private", x.visible !== false, code, now]);
  return row(r.rows[0]);
}

export async function mySkills(userId: number): Promise<SkillRow[]> {
  await ensureSkillTables();
  const r = await db()!.query("SELECT * FROM mc_skills WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 300", [userId]);
  return r.rows.map(row);
}

export async function getSkill(id: string, userId: number | null): Promise<SkillRow | null> {
  await ensureSkillTables();
  const r = await db()!.query(`SELECT s.*, u.username FROM mc_skills s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = $1`, [id]);
  const x = r.rows[0]; if (!x) return null;
  const s = row(x);
  if (s.userId === userId) return s;
  // 别人的 Skill 只有上架后可见；分享码要另外走 importByCode
  return s.status === "published" && s.visible ? s : null;
}

/** 市场里用户发布的 Skill（官方 Skill 在前端与这份列表合并） */
export async function marketSkills(): Promise<SkillRow[]> {
  await ensureSkillTables();
  const r = await db()!.query(`SELECT s.*, u.username FROM mc_skills s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.status = 'published' AND s.visible = true ORDER BY s.saves DESC, s.updated_at DESC LIMIT 500`);
  // 市场列表不带分享码：它是「复制走这份 Skill」的凭据，只有作者本人该看到
  return r.rows.map((x) => ({ ...row(x), shareCode: null }));
}

export async function deleteSkill(userId: number, id: string): Promise<boolean> {
  await ensureSkillTables();
  const r = await db()!.query("DELETE FROM mc_skills WHERE id = $1 AND user_id = $2", [id, userId]);
  if (r.rowCount) {
    await db()!.query("DELETE FROM mc_skill_saves WHERE skill_id = $1", [id]);
    await db()!.query("DELETE FROM mc_skill_installs WHERE skill_id = $1", [id]);
  }
  return !!r.rowCount;
}

// ---------- 安装 ----------

/** 安装是用户维度的能力开关；Skill 原件仍归市场/作者，卸载不会删除原件。 */
export async function installedIds(userId: number): Promise<string[]> {
  await ensureSkillTables();
  const r = await db()!.query<{ skill_id: string }>("SELECT skill_id FROM mc_skill_installs WHERE user_id = $1 ORDER BY installed_at DESC LIMIT 500", [userId]);
  return r.rows.map((x) => x.skill_id);
}

export async function setInstalled(userId: number, skillId: string, on: boolean): Promise<number> {
  await ensureSkillTables();
  const id = String(skillId).slice(0, 80);
  if (!id) throw new SkillError("缺少 Skill");
  const pool = db()!;
  if (on) {
    await pool.query("INSERT INTO mc_skill_installs (user_id, skill_id, installed_at) VALUES ($1,$2,$3) ON CONFLICT (user_id, skill_id) DO UPDATE SET installed_at = EXCLUDED.installed_at", [userId, id, Date.now()]);
  } else {
    await pool.query("DELETE FROM mc_skill_installs WHERE user_id = $1 AND skill_id = $2", [userId, id]);
  }
  const count = await pool.query<{ n: string }>("SELECT count(*) AS n FROM mc_skill_installs WHERE skill_id = $1", [id]);
  return Number(count.rows[0]?.n ?? 0);
}

// ---------- 保存（收藏） ----------

/** 保存的 Skill id 列表：既可能是官方 Skill（静态数据里的 id），也可能是站内用户发布的 */
export async function savedIds(userId: number): Promise<string[]> {
  await ensureSkillTables();
  const r = await db()!.query<{ skill_id: string }>("SELECT skill_id FROM mc_skill_saves WHERE user_id = $1 ORDER BY saved_at DESC LIMIT 500", [userId]);
  return r.rows.map((x) => x.skill_id);
}

export async function setSaved(userId: number, skillId: string, on: boolean): Promise<void> {
  await ensureSkillTables();
  const id = String(skillId).slice(0, 80); if (!id) throw new SkillError("缺少 Skill");
  const pool = db()!;
  if (on) {
    const r = await pool.query("INSERT INTO mc_skill_saves (user_id, skill_id, saved_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [userId, id, Date.now()]);
    if (r.rowCount) await pool.query("UPDATE mc_skills SET saves = saves + 1 WHERE id = $1", [id]);
  } else {
    const r = await pool.query("DELETE FROM mc_skill_saves WHERE user_id = $1 AND skill_id = $2", [userId, id]);
    if (r.rowCount) await pool.query("UPDATE mc_skills SET saves = GREATEST(0, saves - 1) WHERE id = $1", [id]);
  }
}

/** 已保存的、站内用户发布的 Skill 详情（官方 Skill 由前端按 id 从静态数据取） */
export async function savedSkills(userId: number): Promise<SkillRow[]> {
  await ensureSkillTables();
  // 收藏表只记 id，不代表有权看：任何人 POST 一个 id 就能把别人未公开的 Skill 收进来，
  // 然后从这里连正文带分享码一起读走。所以这里必须再过一遍可见性——已上架的，或自己的。
  const r = await db()!.query(`SELECT s.*, u.username FROM mc_skill_saves v JOIN mc_skills s ON s.id = v.skill_id
    LEFT JOIN users u ON u.id = s.user_id
    WHERE v.user_id = $1 AND (s.status = 'published' OR s.user_id = $1)
    ORDER BY v.saved_at DESC LIMIT 300`, [userId]);
  // 分享码等于「把这份 Skill 复制走」的凭据，只有作者本人能看到
  return r.rows.map((x) => { const v = row(x); return v.userId === userId ? v : { ...v, shareCode: null }; });
}

/** 分享码导入：复制一份到自己名下（不动原作者的那份） */
export async function importByCode(userId: number, code: string): Promise<SkillRow> {
  await ensureSkillTables();
  const c = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(c)) throw new SkillError("分享码不对，请检查后重试");
  const r = await db()!.query("SELECT * FROM mc_skills WHERE share_code = $1", [c]);
  if (!r.rowCount) throw new SkillError("没有找到这个分享码对应的 Skill", 404);
  const src = row(r.rows[0]);
  if (src.userId === userId) throw new SkillError("这是你自己的 Skill，不用导入");
  return saveSkill(userId, { name: src.name, description: src.description, body: src.body, agentScope: src.agentScope, categoryId: src.categoryId, coverUrl: src.coverUrl, tools: src.tools, models: src.models, visible: false });
}

// ---------- 审核（站长） ----------

export async function pendingSkills(): Promise<SkillRow[]> {
  await ensureSkillTables();
  // 驳回的也要留在审核列表里：否则站长一旦点错「驳回」，这条就从他唯一的入口消失，改判只能去改库
  const r = await db()!.query(`SELECT s.*, u.username FROM mc_skills s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.status IN ('pending','published','rejected') ORDER BY (s.status = 'pending') DESC, s.updated_at DESC LIMIT 200`);
  return r.rows.map(row);
}

export async function reviewSkill(id: string, action: "approve" | "reject" | "unlist", note = ""): Promise<SkillRow> {
  await ensureSkillTables();
  const status: SkillStatus = action === "approve" ? "published" : action === "reject" ? "rejected" : "private";
  const r = await db()!.query("UPDATE mc_skills SET status = $2, review_note = $3, updated_at = $4 WHERE id = $1 RETURNING *", [id, status, note.slice(0, 200) || null, Date.now()]);
  if (!r.rowCount) throw new SkillError("这个 Skill 不存在", 404);
  return row(r.rows[0]);
}
