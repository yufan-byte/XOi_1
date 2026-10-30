/**
 * GET /api/model-lines —— 按「线路」（= new-api 渠道）统计真实成功率。
 *
 * 为什么不用 xoi_generation_tasks（见 model-health.ts）：那边只能按**裸模型名**聚合，
 * 而「稳定优先 / 价格优先 / 速度优先」比的是**同一条能力的不同上游线路**，
 * 名字一样、渠道不同。按模型名聚合出来所有线路共用一个数字，排序等于没排。
 *
 * 数据源：new-api 自带的 logs 表（每次上游请求一行），字段已经够用：
 *   channel_id / model_name / use_time（秒）/ type（2=消费成功，5=错误）/ created_at（**秒**）
 * 这条链路比造物「抓外部 aicost 面板再落盘」更直接：没有 5 分钟延迟，也不会整片「暂无数据」。
 *
 * 口径：
 *   · 窗口 120 分钟，5 分钟一个桶，共 24 个点（左旧右新）
 *   · 桶里没有请求记 -1（前端画灰点），有请求记 0~100 的整数成功率
 *   · health 为整个窗口的成功率；样本为 0 时为 null（不编 0%，也不编 100%）
 *   · avgSec 只统计成功请求的 use_time 均值
 *
 * 查询参数：
 *   ?model=<modelName>  额外返回该模型「有渠道但最近没流量」的线路（来自 abilities），health 为 null
 *   ?window=<分钟>      默认 120，夹在 30~1440
 */
import express from "express";
import knex, { type Knex } from "knex";
import { db } from "@/utils/db";

const router = express.Router();

const BUCKET_MINUTES = 5;
const MAX_WINDOW_MINUTES = 1440;
/** 单次最多读多少条日志：正常 120 分钟远低于这个数，超标说明流量异常，按最近的行算 */
const MAX_ROWS = 20000;

let gatewayDb: Knex | null = null;
/** 网关库连接：只读，独立小池，不和业务库抢连接 */
function gw(): Knex {
  if (gatewayDb) return gatewayDb;
  const url = process.env.NEWAPI_DATABASE_URL;
  if (!url) throw new Error("NEWAPI_DATABASE_URL 未配置");
  gatewayDb = knex({
    client: "pg",
    connection: { connectionString: url },
    pool: { min: 0, max: 3 },
  });
  return gatewayDb;
}

interface Acc {
  model: string;
  channelId: number;
  ok: number;
  fail: number;
  secSum: number;
  secN: number;
  /** 每桶 [成功数, 总数] */
  buckets: number[][];
}

interface Line {
  channelId: number;
  channelName: string;
  /** 渠道状态：1 启用 / 2 手动禁用 / 3 自动禁用（new-api 口径） */
  channelStatus: number | null;
  ok: number;
  fail: number;
  /** 窗口内成功率（0~100，一位小数）；无样本为 null */
  health: number | null;
  /** 成功请求的平均耗时（秒） */
  avgSec: number | null;
  /** 24 个桶，-1 表示该桶没有请求 */
  buckets: number[];
}

interface ModelRow {
  /** gateway=网关请求日志（渠道级）；tasks=站内任务记录（视频/图片走自己的管线，不进网关） */
  source?: "gateway" | "tasks";
  ok: number;
  fail: number;
  health: number | null;
  avgSec: number | null;
  buckets: number[];
  lines: Line[];
}

const pct = (ok: number, total: number) => (total > 0 ? Math.round((ok / total) * 1000) / 10 : null);

router.get("/", async (req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const nowSec = Math.floor(Date.now() / 1000);
    const requested = Number(req.query.window);
    const windowMinutes = Number.isFinite(requested)
      ? Math.min(MAX_WINDOW_MINUTES, Math.max(30, Math.round(requested)))
      : 120;
    const bucketCount = Math.ceil(windowMinutes / BUCKET_MINUTES);
    const since = nowSec - windowMinutes * 60;
    const wantedModel = typeof req.query.model === "string" ? req.query.model.trim() : "";

    const rows = await gw()("logs")
      .where("created_at", ">=", since)
      .whereIn("type", [2, 5])
      .whereNotNull("channel_id")
      .select("channel_id", "model_name", "use_time", "type", "created_at")
      .orderBy("created_at", "desc")
      .limit(MAX_ROWS);

    /** `${model}\u0000${channelId}` → 累计 */
    const acc = new Map<string, Acc>();
    for (const r of rows) {
      const model = String(r.model_name || "").trim();
      const channelId = Number(r.channel_id);
      if (!model || !Number.isSafeInteger(channelId)) continue;
      const key = `${model}\u0000${channelId}`;
      let e = acc.get(key);
      if (!e) {
        e = {
          model,
          channelId,
          ok: 0,
          fail: 0,
          secSum: 0,
          secN: 0,
          // 每个桶两个计数：[成功, 总数]
          buckets: Array.from({ length: bucketCount }, () => [0, 0]),
        };
        acc.set(key, e);
      }
      const ok = Number(r.type) === 2;
      const idx = bucketCount - 1 - Math.floor((nowSec - Number(r.created_at)) / (BUCKET_MINUTES * 60));
      const slot = e.buckets[idx];
      if (slot) {
        slot[1] += 1;
        if (ok) {
          slot[0] += 1;
          const sec = Number(r.use_time);
          if (Number.isFinite(sec) && sec > 0) {
            e.secSum += sec;
            e.secN += 1;
          }
        }
      }
      if (ok) e.ok += 1;
      else e.fail += 1;
    }

    // 渠道名 / 状态：logs 里 channel_name 常为空，真名在 channels 表
    const channelIds = [...new Set([...acc.values()].map((e) => e.channelId))];
    const named = channelIds.length
      ? await gw()("channels").whereIn("id", channelIds).select("id", "name", "status").catch(() => [])
      : [];
    const meta = new Map<number, { name: string; status: number | null }>();
    for (const c of named as Array<{ id: number; name: string; status: number }>) {
      meta.set(Number(c.id), { name: String(c.name || `渠道 ${c.id}`), status: Number(c.status) });
    }

    const models: Record<string, ModelRow> = {};
    const toLine = (e: Acc): Line => {
      const total = e.ok + e.fail;
      const m = meta.get(e.channelId);
      return {
        channelId: e.channelId,
        channelName: m?.name || `渠道 ${e.channelId}`,
        channelStatus: m?.status ?? null,
        ok: e.ok,
        fail: e.fail,
        health: pct(e.ok, total),
        avgSec: e.secN ? Math.round((e.secSum / e.secN) * 10) / 10 : null,
        buckets: e.buckets.map(([o, t]) => (t > 0 ? Math.round((o / t) * 100) : -1)),
      };
    };

    for (const e of acc.values()) {
      const target = (models[e.model] ||= { ok: 0, fail: 0, health: null, avgSec: null, buckets: [], lines: [] });
      target.lines.push(toLine(e));
    }

    // 模型层：把各线路的桶合并（同一模型换线时，用户关心的是「这个模型行不行」）
    for (const [name, row] of Object.entries(models)) {
      row.lines.sort((a, b) => (b.health ?? -1) - (a.health ?? -1) || a.channelId - b.channelId);
      row.ok = row.lines.reduce((s, l) => s + l.ok, 0);
      row.fail = row.lines.reduce((s, l) => s + l.fail, 0);
      row.health = pct(row.ok, row.ok + row.fail);
      const withSec = row.lines.filter((l) => l.avgSec != null && l.ok > 0);
      const secTotal = withSec.reduce((s, l) => s + (l.avgSec as number) * l.ok, 0);
      const secCount = withSec.reduce((s, l) => s + l.ok, 0);
      row.avgSec = secCount ? Math.round((secTotal / secCount) * 10) / 10 : null;
      row.buckets = Array.from({ length: bucketCount }, (_, i) => {
        let ok = 0;
        let total = 0;
        for (const l of row.lines) {
          const v = l.buckets[i];
          if (typeof v === "number" && v >= 0) {
            ok += (v / 100) * 1;
            total += 1;
          }
        }
        return total ? Math.round((ok / total) * 100) : -1;
      });
      models[name] = row;
    }

    /**
     * 回退：画布 / 一站的媒体任务有一部分走 /v1/canvas 适配层（XOi 自己的计费与供应商管线），
     * 不落在网关 logs 里 —— 那部分只有站内任务表有记录。
     * 网关没有数据的模型，用 xoi_generation_tasks 补一份，并明确标出来源是「站内任务」，
     * 别让用户以为是渠道级数据。
     */
    try {
      const tasks = await db("xoi_generation_tasks")
        .whereIn("status", ["succeeded", "failed"])
        .andWhere("updated_at", ">", Date.now() - windowMinutes * 60_000)
        .select("status", "payload", "updated_at")
        .limit(8000);
      /** 裸模型名 → 累计 */
      const byModel = new Map<string, { ok: number; fail: number; buckets: number[][]; secSum: number; secN: number }>();
      const nowMs = Date.now();
      for (const t of tasks) {
        let modelKey = "";
        let queuedAt: number | undefined;
        let completedAt: number | undefined;
        try {
          const p = typeof (t as any).payload === "string" ? JSON.parse((t as any).payload) : (t as any).payload;
          modelKey = String(p?.modelKey ?? "");
          queuedAt = p?.queuedAt;
          completedAt = p?.completedAt;
        } catch {
          continue;
        }
        const name = modelKey.replace(/^[a-z-]+:/i, "");
        if (!name) continue;
        let e = byModel.get(name);
        if (!e) {
          e = { ok: 0, fail: 0, buckets: Array.from({ length: bucketCount }, () => [0, 0]), secSum: 0, secN: 0 };
          byModel.set(name, e);
        }
        const ok = String((t as any).status) === "succeeded";
        const at = Number((t as any).updated_at) || nowMs;
        const idx = bucketCount - 1 - Math.floor((nowMs - at) / (BUCKET_MINUTES * 60_000));
        const slot = e.buckets[idx];
        if (slot) {
          slot[1] += 1;
          if (ok) {
            slot[0] += 1;
            // completedAt 很多任务没回写，用任务行自己的完成时间兜底
            const doneAt = completedAt && completedAt > (queuedAt || 0) ? completedAt : at;
            if (queuedAt && doneAt > queuedAt) {
              e.secSum += (doneAt - queuedAt) / 1000;
              e.secN += 1;
            }
          }
        }
        if (ok) e.ok += 1;
        else e.fail += 1;
      }
      for (const [name, e] of byModel) {
        const row = models[name];
        // 网关有数据就以网关为准（那是真正的渠道级数字）；只有网关没有时才回退
        if (row && row.ok + row.fail > 0) continue;
        const total = e.ok + e.fail;
        models[name] = {
          ok: e.ok,
          fail: e.fail,
          health: pct(e.ok, total),
          avgSec: e.secN ? Math.round((e.secSum / e.secN) * 10) / 10 : null,
          buckets: e.buckets.map(([o, t]) => (t > 0 ? Math.round((o / t) * 100) : -1)),
          lines: [
            {
              channelId: 0,
              channelName: "站内任务记录",
              channelStatus: null,
              ok: e.ok,
              fail: e.fail,
              health: pct(e.ok, total),
              avgSec: e.secN ? Math.round((e.secSum / e.secN) * 10) / 10 : null,
              buckets: e.buckets.map(([o, t]) => (t > 0 ? Math.round((o / t) * 100) : -1)),
            },
          ],
          source: "tasks",
        };
      }
    } catch {
      /* 任务表读不到不影响网关数据 */
    }

        // 指定模型时，把「有渠道但最近没流量」的线路也带上：前端显示为「暂无数据」而不是整条消失
    if (wantedModel) {
      try {
        const served = await gw()("abilities")
          .where({ model: wantedModel, enabled: true })
          .select("channel_id");
        const row = (models[wantedModel] ||= { ok: 0, fail: 0, health: null, avgSec: null, buckets: [], lines: [] });
        const known = new Set(row.lines.map((l) => l.channelId));
        const missing = [...new Set(served.map((s: { channel_id: number }) => Number(s.channel_id)))].filter(
          (id) => Number.isSafeInteger(id) && !known.has(id),
        );
        if (missing.length) {
          const extra = await gw()("channels").whereIn("id", missing).select("id", "name", "status").catch(() => []);
          for (const c of extra as Array<{ id: number; name: string; status: number }>) {
            row.lines.push({
              channelId: Number(c.id),
              channelName: String(c.name || `渠道 ${c.id}`),
              channelStatus: Number(c.status),
              ok: 0,
              fail: 0,
              health: null,
              avgSec: null,
              buckets: Array.from({ length: bucketCount }, () => -1),
            });
          }
        }
      } catch {
        /* abilities 表缺失不影响主数据 */
      }
    }

    return res.json({
      success: true,
      data: {
        updatedAt: Date.now(),
        windowMinutes,
        bucketMinutes: BUCKET_MINUTES,
        models,
      },
    });
  } catch (e) {
    console.error("[model-lines] 聚合失败:", (e as Error)?.message || e);
    return res.status(503).json({ success: false, message: "线路成功率暂时不可用" });
  }
});

export default router;
