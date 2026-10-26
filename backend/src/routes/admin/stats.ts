/**
 * 平台管理 · 收益总览（管理员的「每天用户跑了多少」）
 *
 * 管理员要看的四条线全部在**网关同库**（决策 D2，@/lib/agent/db 的裸 pg 通道）：
 *   · 消耗：logs（type=2 扣费流水；created_at 是**秒**，与 agent-store incomeOf 同口径）
 *   · 充值：top_ups（在线充值订单，真钱真源；status 为 text，'success' = 已支付）
 *   · 卡密：redemptions（核销 = 面额到账，按 redeemed_time 归日；status 3 = 已使用）
 *   · 新增用户：users
 *
 * topups/redemptions/users 的时间戳在不同 new-api 版本里有秒/毫秒两种实现，统一用
 * CASE 兜底（> 1e12 视为毫秒）；logs.created_at 已在 incomeOf 验证为秒，直接用。
 * 任何一张表查询失败只降级该列（返回空），不让整个看板 500 —— 看板要的是「总能看到数」。
 *
 * 挂载：/api/admin/stats（app.ts 里 /api/admin 已统一套 requireAdmin，role ≥ 10）
 *   GET /daily?days=30     → { days:[{day,consumeCny,requests,topupCny,topupCount,redeemedCny,redeemedCount,newUsers}], totals }
 */
import express from "express";
import type { Pool } from "pg";
import { success, error } from "@/lib/responseFormat";
import { boundedInteger } from "@/utils/adminQuery";
import { requireDb } from "@/lib/agent/db";

const router = express.Router();

/** 额度 → 人民币：500000 额度单位 = ¥1（与 lib/reseller/newapi.ts 同口径） */
const QUOTA_PER_UNIT = 500000;
const TZ = "Asia/Shanghai";
const DAY_MS = 86_400_000;

type DayRow = { day: string; consumeCny: number; requests: number; topupCny: number; topupCount: number; redeemedCny: number; redeemedCount: number; newUsers: number; poolConsume: number };

/** 秒/毫秒两版时间戳都能正确归日的表达式 */
const dayExpr = (col: string) =>
  `to_char(to_timestamp(${col} / CASE WHEN ${col} > 1000000000000 THEN 1000 ELSE 1 END) AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`;

/** 单表聚合；失败降级为空（看板不因一张表的结构差异整体挂掉） */
async function safeQuery(pool: Pool | null, sql: string, args: unknown[]): Promise<Array<Record<string, unknown>>> {
  if (!pool) return [];
  try {
    return (await pool.query(sql, args)).rows as Array<Record<string, unknown>>;
  } catch (e) {
    console.warn(`[admin/stats] 聚合查询降级：${(e as Error).message}`);
    return [];
  }
}

router.get("/daily", async (req, res) => {
  try {
    const days = boundedInteger(req.query.days, 30, 365);
    const sinceSec = Math.floor((Date.now() - days * DAY_MS) / 1000);
    const pool = requireDb();

    // 秒列（logs）与未知单位列分开处理；WHERE 里对未知单位列同样做秒归一
    const normSec = (col: string) => `(${col} / CASE WHEN ${col} > 1000000000000 THEN 1000 ELSE 1 END)`;

    const [consume, topups, redeemed, signups] = await Promise.all([
      // 消耗口径：只统计**真实用户**（role<100）的扣费；管理员账号是平台积分池，
      // 它的消耗是平台垫付上游的成本，单列 poolConsume 供对账，不与用户消耗混算。
      safeQuery(pool,
        `SELECT to_char(to_timestamp(l.created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, SUM(l.quota) AS q, COUNT(*) AS n,
                SUM(CASE WHEN u.role >= 100 THEN l.quota ELSE 0 END) AS pool_q
         FROM logs l JOIN users u ON u.id = l.user_id
         WHERE l.type = 2 AND l.created_at >= $1 GROUP BY 1`, [sinceSec]),
      safeQuery(pool,
        `SELECT ${dayExpr("create_time")} AS day, SUM(money) AS m, COUNT(*) AS n
         FROM top_ups WHERE LOWER(status::text) IN ('success', '1') AND ${normSec("create_time")} >= $1 GROUP BY 1`, [sinceSec]),
      safeQuery(pool,
        `SELECT ${dayExpr("redeemed_time")} AS day, SUM(quota) AS q, COUNT(*) AS n
         FROM redemptions WHERE redeemed_time > 0 AND ${normSec("redeemed_time")} >= $1 GROUP BY 1`, [sinceSec]),
      safeQuery(pool,
        `SELECT ${dayExpr("created_at")} AS day, COUNT(*) AS n
         FROM users WHERE ${normSec("created_at")} >= $1 GROUP BY 1`, [sinceSec]),
    ]);

    const cnyOf = (quota: unknown) => Number(quota ?? 0) / QUOTA_PER_UNIT;
    const byDay = new Map<string, DayRow & { poolConsume: number }>();
    // 顺手把今天往前的每一天都补零，前端不用对齐日期
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    for (let i = 0; i < days; i++) {
      const day = new Date(Date.now() + 8 * 3600_000 - i * DAY_MS).toISOString().slice(0, 10);
      byDay.set(day, { day, consumeCny: 0, requests: 0, topupCny: 0, topupCount: 0, redeemedCny: 0, redeemedCount: 0, newUsers: 0, poolConsume: 0 });
    }
    const merge = (rows: Array<Record<string, unknown>>, fn: (r: DayRow, x: Record<string, unknown>) => void) => {
      for (const x of rows) { const cur = byDay.get(String(x.day)); if (cur) fn(cur, x); }
    };
    merge(consume, (r, x) => {
      const pool = cnyOf((x as Record<string, unknown>).pool_q);
      r.poolConsume += pool;
      r.consumeCny += cnyOf(x.q) - pool;
      r.requests += Number(x.n ?? 0);
    });
    merge(topups, (r, x) => { r.topupCny += Number(x.m ?? 0); r.topupCount += Number(x.n ?? 0); });
    merge(redeemed, (r, x) => { r.redeemedCny += cnyOf(x.q); r.redeemedCount += Number(x.n ?? 0); });
    merge(signups, (r, x) => { r.newUsers += Number(x.n ?? 0); });

    const list = [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totals = {
      consumeCny: round2(list.reduce((s, r) => s + r.consumeCny, 0)),
      requests: list.reduce((s, r) => s + r.requests, 0),
      topupCny: round2(list.reduce((s, r) => s + r.topupCny, 0)),
      topupCount: list.reduce((s, r) => s + r.topupCount, 0),
      redeemedCny: round2(list.reduce((s, r) => s + r.redeemedCny, 0)),
      redeemedCount: list.reduce((s, r) => s + r.redeemedCount, 0),
      newUsers: list.reduce((s, r) => s + r.newUsers, 0),
      poolConsume: round2(list.reduce((s, r) => s + r.poolConsume, 0)),
    };
    res.json(success({ today, days: list, totals }));
  } catch (e) {
    res.status(500).json(error(`收益统计读取失败：${(e as Error).message}`));
  }
});

export default router;
