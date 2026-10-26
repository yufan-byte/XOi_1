/**
 * GET /api/model-health —— 模型线路真实成功率（站内任务记录聚合）。
 * 数据源：xoi_generation_tasks（图片 / 视频 / 音频任务，payload.modelKey 记录线路）。
 * 只统计已到终态的任务（succeeded / failed），按裸模型名聚合近 24h 与近 2h 两档；
 * 没有数据的模型不出现——前端显示「暂无数据」，不编造数字。
 */
import express from "express";
import { db } from "@/utils/db";

const router = express.Router();
const DAY = 24 * 3600_000;
const TWO_HOURS = 2 * 3600_000;

router.get("/", async (req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const now = Date.now();
    const rows = await db("xoi_generation_tasks")
      .whereIn("status", ["succeeded", "failed"])
      .andWhere("updated_at", ">", now - DAY)
      .select("kind", "status", "payload", "updated_at")
      .limit(4000);
    /** 裸模型名 → { ok24, total24, ok2, total2, secSum2, secN2 } */
    const agg = new Map<string, { ok24: number; total24: number; ok2: number; total2: number; secSum2: number; secN2: number }>();
    const bump = (name: string, ok: boolean, at: number, seconds?: number) => {
      if (!name) return;
      let e = agg.get(name);
      if (!e) { e = { ok24: 0, total24: 0, ok2: 0, total2: 0, secSum2: 0, secN2: 0 }; agg.set(name, e); }
      e.total24++; if (ok) e.ok24++;
      if (at >= now - TWO_HOURS) {
        e.total2++; if (ok) e.ok2++;
        if (Number.isFinite(seconds) && seconds! > 0) { e.secSum2 += seconds!; e.secN2++; }
      }
    };
    for (const r of rows) {
      let modelKey = "";
      let queuedAt: number | undefined; let completedAt: number | undefined;
      try { const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload; modelKey = String(p?.modelKey ?? ""); queuedAt = p?.queuedAt; completedAt = p?.completedAt; } catch { /* 脏行跳过 */ }
      const name = modelKey.replace(/^[a-z-]+:/i, "");
      bump(name, r.status === "succeeded", Number(r.updated_at) || 0, completedAt && queuedAt ? (completedAt - queuedAt) / 1000 : undefined);
    }
    // 图片任务另有一份绘图账本（同一次任务两处都记，取并集会重复计一次；只补 generation_tasks 没覆盖到的名字）
    try {
      const draws = await db("xoi_draw_logs").whereIn("status", ["succeeded", "failed"]).andWhere("started_at", ">", now - DAY).select("model", "status", "started_at", "finished_at").limit(4000);
      for (const d of draws) {
        const name = String(d.model || "").replace(/^[a-z-]+:/i, "");
        if (!agg.has(name)) bump(name, d.status === "succeeded", Number(d.started_at) || 0, d.finished_at && d.started_at ? (Number(d.finished_at) - Number(d.started_at)) / 1000 : undefined);
      }
    } catch { /* 绘图账本缺失不影响主数据 */ }
    const out: Record<string, { health: number; total24: number; total2: number; avgSec2: number | null }> = {};
    for (const [name, e] of agg) {
      if (!e.total24) continue;
      out[name] = {
        health: Math.round((e.ok24 / e.total24) * 1000) / 10,
        total24: e.total24,
        total2: e.total2,
        avgSec2: e.secN2 ? Math.round((e.secSum2 / e.secN2) * 10) / 10 : null,
      };
    }
    res.json({ success: true, data: out });
  } catch (e: any) {
    console.error("[model-health] 聚合失败:", e?.message || e);
    res.status(503).json({ success: false, message: "线路健康度暂时不可用" });
  }
});

export default router;
