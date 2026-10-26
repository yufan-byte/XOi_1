/**
 * GET /api/log/self        —— 当前用户的消费明细（网关 logs 表，**服务端直查**）
 * GET /api/log/self/stat   —— 当前用户的用量统计（quota / rpm / tpm）
 *
 * ⚠️ 数据归属修复（2026-10-24 渗透实测）：以前走 backendRaw 透传网关 /api/log/self
 * （管理员令牌 + New-Api-User 头）——但网关用户端点**忽略 New-Api-User**，返回的永远是
 * 管理员令牌本人（root）的日志：普通用户的「积分明细」显示的是别人的消费记录
 * （数据错乱 + root 用量隐私泄露）。修复：改走网关同库直查（决策 D2），`WHERE user_id=?`
 * 强制本人数据，分页/筛选语义与网关一致。
 *
 * 挂载：core.ts 扫描 routes/log/self.ts 生成 `/api/log/self`（"log" 已加入 ROUTE_WHITELIST），
 * 内部再挂 "/" 与 "/stat" 两个子路径。
 */
import express from "express";
import { currentUser } from "@/lib/reseller/auth";
import { error } from "@/lib/responseFormat";
import { usageQuery, usageAttributionQuery, usageSource, usageRequestIds } from "@/utils/usageAttribution";
import { db } from "@/utils/db";
import { db as agentDb, requireDb } from "@/lib/agent/db";

const router = express.Router();

/** 网关 logs 表列名与 new-api 一致；quota 单位为 500000=¥1，前端按同一口径换算 */
router.get("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).send(error("请先登录"));
  const uid = Number(me.id);
  if (!Number.isSafeInteger(uid) || uid <= 0) return res.status(401).send(error("请先登录"));

  try {
    const params = new URLSearchParams(usageQuery(req.query));
    const page = Math.max(1, Number(params.get("p") || 1));
    const pageSize = Math.max(1, Number(params.get("page_size") || 20));
    const type = params.get("type") || "";
    const start = params.get("start_timestamp") || "";
    const end = params.get("end_timestamp") || "";
    const model = params.get("model_name") || "";

    const conds = ["user_id = $1"];
    const args: unknown[] = [uid];
    if (type && /^\d+$/.test(type)) { args.push(Number(type)); conds.push(`type = $${args.length}`); }
    if (start && /^\d+$/.test(start)) { args.push(Number(start)); conds.push(`created_at >= $${args.length}`); }
    if (end && /^\d+$/.test(end)) { args.push(Number(end)); conds.push(`created_at < $${args.length}`); }
    if (model) { args.push(`%${model}%`); conds.push(`model_name ILIKE $${args.length}`); }

    const pool = requireDb();
    const countRow = await pool.query(`SELECT count(*)::int AS n FROM logs WHERE ${conds.join(" AND ")}`, args);
    const total = Number(countRow.rows[0]?.n ?? 0);
    args.push(pageSize, (page - 1) * pageSize);
    const rows = await pool.query(
      `SELECT id, user_id, created_at, type, content, username, token_name, model_name, quota,
              prompt_tokens, completion_tokens, use_time, is_stream, other
       FROM logs WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );

    const items = rows.rows as Record<string, unknown>[];
    for (const item of items) item.xoi_source = { status: "unknown" };
    const ids = usageRequestIds(items);
    if (ids.length) {
      try {
        // This endpoint must not create schema or modify the gateway ledger.
        const result = await db.raw(usageAttributionQuery(ids.length), [uid, ...ids]).timeout(2000);
        const grouped = new Map<string, { billing_id: string; operation_path: string }[]>();
        for (const row of result.rows) grouped.set(row.request_id, [...(grouped.get(row.request_id) || []), row]);
        for (const item of items) item.xoi_source = usageSource(grouped.get(String(item.request_id)) || []);
      } catch {
        // Provenance unavailable must not hide the original financial record.
        for (const item of items) item.xoi_source = { status: "unavailable" };
        console.warn("[usage] 功能来源关联暂不可用，保留原始账单");
      }
    }

    res.status(200).json({ data: { items, total, page, page_size: pageSize }, message: "", success: true });
  } catch (e) {
    res.status(502).send(error(`消费记录加载失败：${(e as Error).message}`));
  }
});

router.get("/stat", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).send(error("请先登录"));
  const uid = Number(me.id);
  if (!Number.isSafeInteger(uid) || uid <= 0) return res.status(401).send(error("请先登录"));

  try {
    const params = new URLSearchParams(usageQuery(req.query, true));
    const type = params.get("type") || "2";
    const start = params.get("start_timestamp") || "";
    const end = params.get("end_timestamp") || "";
    const model = params.get("model_name") || "";

    const conds = ["user_id = $1"];
    const args: unknown[] = [uid];
    if (type && /^\d+$/.test(type)) { args.push(Number(type)); conds.push(`type = $${args.length}`); }
    if (start && /^\d+$/.test(start)) { args.push(Number(start)); conds.push(`created_at >= $${args.length}`); }
    if (end && /^\d+$/.test(end)) { args.push(Number(end)); conds.push(`created_at < $${args.length}`); }
    if (model) { args.push(`%${model}%`); conds.push(`model_name ILIKE $${args.length}`); }

    const pool = requireDb();
    const row = await pool.query(
      `SELECT COALESCE(SUM(quota), 0) AS quota, count(*)::int AS count
       FROM logs WHERE ${conds.join(" AND ")}`,
      args,
    );
    const quota = Number(row.rows[0]?.quota ?? 0);
    const count = Number(row.rows[0]?.count ?? 0);
    const windowSec = Math.max(1, (Number(end) || Math.floor(Date.now() / 1000)) - (Number(start) || Math.floor(Date.now() / 1000) - 60));
    res.status(200).json({ data: { quota, rpm: Math.round((count / windowSec) * 60 * 100) / 100, tpm: 0 }, message: "", success: true });
  } catch (e) {
    res.status(502).send(error(`用量统计加载失败：${(e as Error).message}`));
  }
});

export default router;
