/**
 * 灵感广场的服务端存储 —— 移植自造物引擎 src/lib/works-store.ts（逐字平移，未改语义）。
 *
 * 与 skill-store 同样的两处适配：库连接复用 `@/lib/agent/db`（同一个 new-api 库，决策 D2），
 * 报错出口从 Next 的 `Response.json` 换成 Express 的 `workFail(res, e)`。
 *
 * 表（mc_works / mc_work_likes）由本模块自己 ensure。
 */
import type { Response as ExpressResponse } from "express";
import { db } from "@/lib/agent/db";

export const WORK_TYPES = ["canvas", "image", "video"] as const;
export type WorkType = (typeof WORK_TYPES)[number];
export type WorkStatus = "pending" | "published" | "rejected";
export const WORK_LIMITS = { title: 40, description: 300, payload: 2 * 1024 * 1024, perUser: 100 } as const;

export class WorkError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** 统一的报错出口（对应造物的 workFail） */
export function workFail(res: ExpressResponse, e: unknown): void {
  if (e instanceof WorkError) { res.status(e.status).json({ success: false, message: e.message }); return; }
  console.error("[works]", e);
  res.status(500).json({ success: false, message: "操作失败，请稍后重试" });
}

let ready: Promise<void> | null = null;
export function ensureWorkTables(): Promise<void> {
  const pool = db(); if (!pool) return Promise.reject(new WorkError("数据库未配置", 503));
  ready ??= (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS mc_works (
      id text PRIMARY KEY, user_id integer NOT NULL, work_type text NOT NULL, title text NOT NULL,
      description text NOT NULL DEFAULT '', category text NOT NULL DEFAULT 'other', cover_url text NOT NULL DEFAULT '',
      cover_kind text NOT NULL DEFAULT 'image', payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'pending', review_note text,
      views integer NOT NULL DEFAULT 0, likes integer NOT NULL DEFAULT 0, replicas integer NOT NULL DEFAULT 0,
      created_at bigint NOT NULL, updated_at bigint NOT NULL)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mc_works_feed ON mc_works (work_type, status, updated_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mc_works_user ON mc_works (user_id, updated_at DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mc_work_likes (
      user_id integer NOT NULL, work_id text NOT NULL, at bigint NOT NULL, PRIMARY KEY (user_id, work_id))`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export interface WorkRow {
  id: string; userId: number; workType: WorkType; title: string; description: string; category: string;
  coverUrl: string; coverKind: "image" | "video"; payload: Record<string, unknown>; status: WorkStatus;
  reviewNote: string | null; views: number; likes: number; replicas: number; createdAt: number; updatedAt: number;
  author?: string; liked?: boolean;
}
const num = (v: unknown) => Number(v) || 0;
const row = (x: Record<string, unknown>): WorkRow => ({
  id: String(x.id), userId: num(x.user_id), workType: x.work_type as WorkType, title: String(x.title), description: String(x.description ?? ""),
  category: String(x.category ?? "other"), coverUrl: String(x.cover_url ?? ""), coverKind: (x.cover_kind as "image" | "video") ?? "image",
  payload: (x.payload as Record<string, unknown>) ?? {}, status: x.status as WorkStatus, reviewNote: (x.review_note as string) ?? null,
  views: num(x.views), likes: num(x.likes), replicas: num(x.replicas), createdAt: num(x.created_at), updatedAt: num(x.updated_at),
  ...(x.username ? { author: String(x.username) } : {}), ...(x.liked === undefined ? {} : { liked: !!x.liked }),
});
const newId = () => `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface WorkInput { workType: string; title: string; description?: string; category?: string; coverUrl?: string; coverKind?: string; payload?: unknown }

export async function publishWork(userId: number, x: WorkInput): Promise<WorkRow> {
  await ensureWorkTables();
  const type = (WORK_TYPES as readonly string[]).includes(x.workType) ? (x.workType as WorkType) : null;
  if (!type) throw new WorkError("作品类型不对");
  const title = String(x.title ?? "").trim().slice(0, WORK_LIMITS.title);
  if (!title) throw new WorkError("请填写作品标题");
  const description = String(x.description ?? "").trim().slice(0, WORK_LIMITS.description);
  const category = String(x.category ?? "other").slice(0, 40) || "other";
  const cover = String(x.coverUrl ?? "").slice(0, 600);
  if (cover && !/^(https?:\/\/|\/api\/media\/)/.test(cover)) throw new WorkError("封面需要是 http(s) 链接或站内上传的地址");
  const payload = JSON.stringify(x.payload ?? {});
  if (payload.length > WORK_LIMITS.payload) throw new WorkError("作品内容太大，请精简后再发布（上限 2MB）");
  const pool = db()!;
  const n = await pool.query<{ n: string }>("SELECT count(*) AS n FROM mc_works WHERE user_id = $1", [userId]);
  if (Number(n.rows[0].n) >= WORK_LIMITS.perUser) throw new WorkError(`最多发布 ${WORK_LIMITS.perUser} 个作品`);
  const now = Date.now();
  const r = await pool.query(`INSERT INTO mc_works (id, user_id, work_type, title, description, category, cover_url, cover_kind, payload, status, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$10) RETURNING *`,
    [newId(), userId, type, title, description, category, cover, x.coverKind === "video" ? "video" : "image", payload, now]);
  return row(r.rows[0]);
}

export async function myWorks(userId: number): Promise<WorkRow[]> {
  await ensureWorkTables();
  const r = await db()!.query("SELECT * FROM mc_works WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 200", [userId]);
  return r.rows.map(row);
}

/** 广场列表：已上架的作品（本人能额外看到自己待审核的） */
export async function feedWorks(type: WorkType, userId: number | null): Promise<WorkRow[]> {
  await ensureWorkTables();
  const r = await db()!.query(`SELECT w.*, u.username, (l.user_id IS NOT NULL) AS liked FROM mc_works w
      LEFT JOIN users u ON u.id = w.user_id
      LEFT JOIN mc_work_likes l ON l.work_id = w.id AND l.user_id = $2
    WHERE w.work_type = $1 AND (w.status = 'published' OR w.user_id = $2) ORDER BY w.updated_at DESC LIMIT 200`, [type, userId ?? 0]);
  return r.rows.map(row);
}

export async function getWork(id: string, userId: number | null): Promise<WorkRow | null> {
  await ensureWorkTables();
  const r = await db()!.query(`SELECT w.*, u.username, (l.user_id IS NOT NULL) AS liked FROM mc_works w
    LEFT JOIN users u ON u.id = w.user_id LEFT JOIN mc_work_likes l ON l.work_id = w.id AND l.user_id = $2 WHERE w.id = $1`, [id, userId ?? 0]);
  const x = r.rows[0]; if (!x) return null;
  const w = row(x);
  return w.status === "published" || w.userId === userId ? w : null;
}

export async function deleteWork(userId: number, id: string): Promise<boolean> {
  await ensureWorkTables();
  const r = await db()!.query("DELETE FROM mc_works WHERE id = $1 AND user_id = $2", [id, userId]);
  if (r.rowCount) await db()!.query("DELETE FROM mc_work_likes WHERE work_id = $1", [id]);
  return !!r.rowCount;
}

export async function setLike(userId: number, id: string, on: boolean): Promise<number> {
  await ensureWorkTables();
  const pool = db()!;
  if (on) {
    const r = await pool.query("INSERT INTO mc_work_likes (user_id, work_id, at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [userId, id, Date.now()]);
    if (r.rowCount) await pool.query("UPDATE mc_works SET likes = likes + 1 WHERE id = $1", [id]);
  } else {
    const r = await pool.query("DELETE FROM mc_work_likes WHERE user_id = $1 AND work_id = $2", [userId, id]);
    if (r.rowCount) await pool.query("UPDATE mc_works SET likes = GREATEST(0, likes - 1) WHERE id = $1", [id]);
  }
  const q = await pool.query<{ likes: number }>("SELECT likes FROM mc_works WHERE id = $1", [id]);
  return num(q.rows[0]?.likes);
}

/** 计数：浏览 / 复刻。只对已上架的作品计数，作者自己看不计。 */
export async function bump(id: string, field: "views" | "replicas", userId: number | null): Promise<void> {
  await ensureWorkTables();
  await db()!.query(`UPDATE mc_works SET ${field} = ${field} + 1 WHERE id = $1 AND status = 'published' AND user_id <> $2`, [id, userId ?? 0]);
}

export async function pendingWorks(): Promise<WorkRow[]> {
  await ensureWorkTables();
  // 同 pendingSkills：驳回后仍留在列表里，站长点错了能改回来
  const r = await db()!.query(`SELECT w.*, u.username FROM mc_works w LEFT JOIN users u ON u.id = w.user_id
    WHERE w.status IN ('pending','published','rejected') ORDER BY (w.status = 'pending') DESC, w.updated_at DESC LIMIT 200`);
  return r.rows.map(row);
}

export async function reviewWork(id: string, action: "approve" | "reject" | "unlist", note = ""): Promise<WorkRow> {
  await ensureWorkTables();
  const status: WorkStatus = action === "approve" ? "published" : action === "reject" ? "rejected" : "pending";
  const r = await db()!.query("UPDATE mc_works SET status = $2, review_note = $3, updated_at = $4 WHERE id = $1 RETURNING *", [id, status, note.slice(0, 200) || null, Date.now()]);
  if (!r.rowCount) throw new WorkError("这个作品不存在", 404);
  return row(r.rows[0]);
}
