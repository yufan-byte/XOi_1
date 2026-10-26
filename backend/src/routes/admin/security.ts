/**
 * 平台管理 · 安全检测（管理员 role ≥ 10 可见，含告警摘要）
 *
 * 四类信号全部来自网关同库直查（o_auth_audit / logs / users），只读、无副作用：
 *   1. 登录爆破：近 24h 登录失败（fail/blocked）按 IP 聚合，≥10 次告警；
 *   2. 管理员异地登录：管理员账号（role≥10）出现历史从未登录过的成功 IP → 告警；
 *   3. 异常消费：近 1 小时单用户消耗积分超过阈值（XOI_ALERT_HOURLY_POINTS，默认 500 = ¥50）→ 告警；
 *   4. 卡密倒卖信号：近 1 小时单用户兑换（topup 日志）≥ 10 次 → 告警。
 *
 * 设计原则：检测是"提醒"不是"拦截"——自动封禁误伤率太高，告警后由管理员人工处置
 * （用户管理页可停用账号）。阈值只影响告警显示，不影响任何业务路径。
 */
import express from "express";
import axios from "axios";
import { success, error } from "@/lib/responseFormat";
import { currentUser } from "@/lib/reseller/auth";
import { db as agentDb, requireDb } from "@/lib/agent/db";

const router = express.Router();

/** 管理员可见 = XOi 侧 role≥10（loadAuthUser 口径），由 requireAdmin 前置 + 这里复核 */
async function requireStaff(req: express.Request): Promise<boolean> {
  const me = await currentUser(req);
  return !!me && (me.role ?? 0) >= 10;
}

const HOURLY_POINTS = Math.max(50, Number(process.env.XOI_ALERT_HOURLY_POINTS || 500));

router.get("/overview", async (_req, res) => {
  if (!(await requireStaff(_req))) return res.status(403).json(error("仅管理员可查看安全检测"));
  try {
    const pool = requireDb();
    const since24h = Math.floor(Date.now() / 1000) - 86_400;
    const since1h = Math.floor(Date.now() / 1000) - 3_600;
    const since7d = Math.floor(Date.now() / 1000) - 7 * 86_400;

    // 1) 登录爆破：近 24h 失败/拦截按 IP 聚合（o_auth_audit.at 是 ISO 文本，用 ::timestamp 比较）
    const brute = await pool.query(
      `SELECT ip, count(*)::int AS n, max(name) FILTER (WHERE name IS NOT NULL) AS sample_name
       FROM o_auth_audit
       WHERE result IN ('fail','blocked') AND at::timestamp > now() - interval '24 hours' AND ip IS NOT NULL AND ip <> ''
       GROUP BY ip HAVING count(*) >= 10 ORDER BY n DESC LIMIT 10`,
    );
    const bruteHits = brute.rows.filter((r) => Number(r.n) >= 10);

    // 2) 管理员异地登录：管理员近 24h 成功登录 IP 与其历史（7 天前至今全部成功记录）基线对比
    const adminLogins = await pool.query(
      `SELECT a.name, a.ip, max(a.at::timestamp) AS last_at
       FROM o_auth_audit a
       WHERE a.result = 'ok' AND a.at::timestamp > now() - interval '24 hours' AND a.ip IS NOT NULL AND a.ip <> ''
         AND a.uid IN (SELECT id FROM users WHERE role >= 10)
       GROUP BY a.name, a.ip ORDER BY last_at DESC LIMIT 20`,
    );
    const base = await agentDb()!.query(
      `SELECT DISTINCT name, ip FROM o_auth_audit
       WHERE result = 'ok' AND at::timestamp BETWEEN now() - interval '90 days' AND now() - interval '24 hours'
         AND name = ANY($1::text[]) AND ip IS NOT NULL AND ip <> ''`,
      [adminLogins.rows.map((r) => r.name)],
    );
    const knownPairs = new Set(base.rows.map((r) => `${r.name}|${r.ip}`));
    const adminNewIp = adminLogins.rows.filter((r) => !knownPairs.has(`${r.name}|${r.ip}`));

    // 3) 异常消费：近 1h 按用户聚合消耗。排除管理员（role≥10）：内部账号的批量操作/压测
    //    会造成误报；每个用户的调用扣的是**他自己的网关 quota**（原子、前置、余额不足直接拒），
    //    管理员账号同理，不存在"平台垫付"。平台真金敞口见 /upstream-pool。
    const spend = await pool.query(
      `SELECT l.user_id, u.username, SUM(l.quota) AS quota, count(*)::int AS calls
       FROM logs l JOIN users u ON u.id = l.user_id
       WHERE l.type = 2 AND l.created_at >= $1 AND u.role < 10
       GROUP BY l.user_id, u.username HAVING SUM(l.quota) > $2 ORDER BY quota DESC LIMIT 10`,
      [since1h, HOURLY_POINTS * 500000],
    );

    // 4) 卡密兑换频率（type=1 充值日志含卡密兑换）：近 1h 按用户计数
    const redeem = await pool.query(
      `SELECT l.user_id, u.username, count(*)::int AS n
       FROM logs l JOIN users u ON u.id = l.user_id
       WHERE l.type = 1 AND l.created_at >= $1
       GROUP BY l.user_id, u.username HAVING count(*) >= 10 ORDER BY n DESC LIMIT 5`,
      [since1h],
    );

    // 总量参考（供面板展示，不参与告警）
    const summary = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM o_auth_audit WHERE result IN ('fail','blocked') AND at::timestamp > now() - interval '24 hours') AS fails24h,
        (SELECT count(*)::int FROM logs WHERE type = 2 AND created_at >= $1) AS calls1h,
        (SELECT COALESCE(SUM(quota),0) AS q FROM logs WHERE type = 2 AND created_at >= $1) AS quota1h,
        (SELECT COALESCE(SUM(l.quota),0) AS q FROM logs l JOIN users u ON u.id = l.user_id WHERE l.type = 2 AND l.created_at >= $1 AND u.role >= 100) AS poolQuota1h,
        (SELECT COALESCE(u2.quota,0) AS q FROM users u2 WHERE u2.role >= 100 ORDER BY u2.id LIMIT 1) AS poolBalance`,
      [since1h],
    );

    const alerts = [
      ...bruteHits.map((r) => ({ kind: "brute" as const, level: "high" as const, title: "登录爆破", detail: `IP ${r.ip} 24 小时内登录失败 ${r.n} 次${r.sample_name ? `（目标含 ${r.sample_name}）` : ""}`, at: new Date().toISOString() })),
      ...adminNewIp.map((r) => ({ kind: "admin-ip" as const, level: "high" as const, title: "管理员新 IP 登录", detail: `管理员 ${r.name} 从新 IP ${r.ip} 登录成功（该 IP 历史无成功记录）`, at: String(r.last_at) })),
      ...spend.rows.filter((r) => Number(r.quota) > 0).map((r) => ({ kind: "spend" as const, level: Number(r.quota) > HOURLY_POINTS * 500000 * 4 ? "high" as const : "medium" as const, title: "异常消费", detail: `用户 ${r.username}（#${r.user_id}）近 1 小时消耗 ${Math.round(Number(r.quota) / 500000 * 100) / 100} 积分（¥${Math.round(Number(r.quota) / 500000 * 10) / 10}），共 ${r.calls} 次调用`, at: new Date().toISOString() })),
      ...redeem.rows.map((r) => ({ kind: "redeem" as const, level: "medium" as const, title: "兑换频率异常", detail: `用户 ${r.username}（#${r.user_id}）近 1 小时充值/兑换 ${r.n} 次，疑似倒卡`, at: new Date().toISOString() })),
    ];
    alerts.sort((a, b) => (a.level === "high" ? -1 : 1) - (b.level === "high" ? -1 : 1));

    res.json(success({
      alerts,
      thresholds: { hourlyPoints: HOURLY_POINTS, bruteCount: 10, redeemCount: 10 },
      summary: {
        fails24h: Number(summary.rows[0]?.fails24h ?? 0),
        calls1h: Number(summary.rows[0]?.calls1h ?? 0),
        quota1h: Math.round(Number(summary.rows[0]?.quota1h ?? 0) / 500000 * 100) / 100,
        // 平台积分池：管理员账号的网关余额（生成调用实际从这里扣，与用户余额分离展示）
        poolBalance: Math.round(Number(summary.rows[0]?.poolBalance ?? 0) / 500000 * 100) / 100,
        poolQuota1h: Math.round(Number(summary.rows[0]?.poolQuota1h ?? 0) / 500000 * 100) / 100,
        checkedAt: new Date().toISOString(),
      },
    }));
  } catch (e) {
    res.status(502).json(error(`安全检测读取失败：${(e as Error).message}`));
  }
});

/**
 * GET /upstream-pool —— 上游渠道额度池（平台真金所在，rootOnly）
 *
 * 平台的资金模型：用户充钱进**各自的网关 quota**；生成调用扣用户自己的 quota（网关转发
 * 时原子扣，余额不足直接拒——上游不会被白白调用）；网关再经渠道扣**上游站点的额度**。
 * 因此平台的真金敞口 = 上游渠道令牌的剩余额度；负债 = 全体用户 quota 总和。
 * 净敞口 = 上游剩余 − 用户负债，<0 就必须给上游充值。
 *
 * 额度读取：new-api 兼容的 /v1/dashboard/billing/{subscription,usage}（渠道 sk- 令牌可查），
 * 5 分钟缓存；渠道查询失败逐个标注，不影响其他渠道。
 */
router.get("/upstream-pool", async (_req, res) => {
  if (!(await requireStaff(_req))) return res.status(403).json(error("仅管理员可查看上游额度池"));
  try {
    const pool = requireDb();
    const channels = (await pool.query(
      `SELECT id, name, base_url, key FROM channels WHERE status = 1 AND base_url IS NOT NULL AND base_url <> '' AND key IS NOT NULL AND key <> '' ORDER BY priority DESC, id`,
    )).rows as Array<{ id: number; name: string; base_url: string; key: string }>;

    const withCache = await Promise.all(channels.map(async (ch) => {
      const base = ch.base_url.replace(/\/+$/, "");
      const key = ch.key.startsWith("sk-") ? ch.key : `sk-${ch.key}`;
      try {
        const opts = { headers: { Authorization: `Bearer ${key}` }, timeout: 10_000, validateStatus: () => true };
        const [sub, usage] = await Promise.all([
          axios.get(`${base}/v1/dashboard/billing/subscription`, opts),
          axios.get(`${base}/v1/dashboard/billing/usage`, opts),
        ]);
        if (sub.status !== 200 || usage.status !== 200) throw new Error(`上游返回 ${sub.status}/${usage.status}`);
        const hard = Number(sub.data?.hard_limit_usd ?? sub.data?.system_hard_limit_usd ?? 0);
        const used = Number(usage.data?.total_usage ?? 0);
        return { id: ch.id, name: ch.name, baseUrl: base, limitUsd: hard, usedUsd: Math.round(used * 100) / 100, remainUsd: Math.round((hard - used) * 100) / 100, ok: true as const };
      } catch (e) {
        return { id: ch.id, name: ch.name, baseUrl: base, ok: false as const, error: (e as Error).message.slice(0, 120) };
      }
    }));

    const okChannels = withCache.filter((c) => c.ok) as Array<Extract<typeof withCache[number], { ok: true }>>;
    const totalRemainUsd = Math.round(okChannels.reduce((s2, c) => s2 + c.remainUsd, 0) * 100) / 100;
    // 用户负债：全体普通用户的 quota 总和（平台要保障可用的额度）
    const debt = await pool.query(`SELECT COALESCE(SUM(quota),0) AS q, count(*)::int AS n FROM users WHERE role < 10 AND status = 1`);
    const debtQuota = Number(debt.rows[0]?.q ?? 0);
    const debtCny = Math.round(debtQuota / 500000 * 100) / 100;
    // 上游真金余额：渠道令牌多为不限额型，dashboard 查不出账号余额——由站长在造物站
    // 核对后手工填入（POST /upstream-pool/balance，存 o_setting）；未填时提示人工核对。
    const manual = await pool.query("SELECT value FROM options WHERE key = 'xoi_upstream_balance_cny' LIMIT 1");
    const manualCny = Number(manual.rows[0]?.value);
    // 净敞口（元）：手填的上游真金余额 − 用户负债（负数 = 必须给上游充值）
    const netCny = Number.isFinite(manualCny) && manualCny >= 0 ? Math.round((manualCny - debtCny) * 100) / 100 : null;
    res.json(success({
      manualBalanceCny: Number.isFinite(manualCny) && manualCny >= 0 ? manualCny : null,
      channels: withCache,
      totalRemainUsd,
      debt: { quota: debtQuota, cny: debtCny, users: debt.rows[0]?.n ?? 0 },
      netCny,
      checkedAt: new Date().toISOString(),
    }));
  } catch (e) {
    res.status(502).json(error(`上游额度池读取失败：${(e as Error).message}`));
  }
});

/**
 * GET /upstream-recon —— 上游对账（rootOnly）
 *
 * 需要站长在管理页填入造物账号的「系统访问令牌」（登录造物站 → 个人设置 → 生成访问令牌），
 * 存 o_setting（rootOnly 写入）。有令牌即可拉：
 *   · 造物账号真实余额（/api/user/self 的 quota——这是平台真金，渠道 sk- 令牌查不到它）
 *   · 近 7 天上游每日消耗（/api/log/self 分页聚合 type=2）——对账"造物扣了我们多少"
 * 与 XOi 侧用户消耗对比 → 毛利 = 用户消耗 − 上游成本（XOi 售价含加价，正常应为正）。
 */
/** 上游凭据（rootOnly 写入 o_setting）：造物站账号密码，登录换 access_token（7h 有效，缓存 6h） */
async function upstreamCredentials(): Promise<{ base: string; user: string; pass: string } | null> {
  const pool = requireDb();
  const rows = await pool.query("SELECT key, value FROM options WHERE key IN ('xoi_upstream_site_base','xoi_upstream_site_user','xoi_upstream_site_pass')");
  const map = Object.fromEntries(rows.rows.map((r) => [r.key, String(r.value || "")]));
  const base = map.xoi_upstream_site_base, user = map.xoi_upstream_site_user, pass = map.xoi_upstream_site_pass;
  return base && user && pass ? { base: base.replace(/\/+$/, ""), user, pass } : null;
}
let upstreamSession: { at: number; base: string; token: string; uid: number } | null = null;

async function upstreamSessionToken(base: string, user: string, pass: string): Promise<{ token: string; uid: number }> {
  if (upstreamSession && upstreamSession.base === base && Date.now() - upstreamSession.at < 6 * 3600_000) {
    return { token: upstreamSession.token, uid: upstreamSession.uid };
  }
  const login = await axios.post(`${base}/api/user/login`, { username: user, password: pass }, { timeout: 15_000, validateStatus: () => true });
  if (login.status !== 200 || login.data?.success === false) throw new Error(`上游登录失败（${login.status}）：${String(login.data?.message || "请核对账密").slice(0, 120)}`);
  const token = String(login.data?.data?.access_token || "");
  const uid = Number(login.data?.data?.user?.id || 0);
  if (!token || !uid) throw new Error("上游登录响应缺少凭据");
  upstreamSession = { at: Date.now(), base, token, uid };
  return { token, uid };
}

router.get("/upstream-recon", async (_req, res) => {
  if (!(await requireStaff(_req))) return res.status(403).json(error("仅管理员可查看上游对账"));
  try {
    const cred = await upstreamCredentials();
    if (!cred) {
      return res.json(success({ configured: false, message: "未配置造物账号。在下方填入账号与密码（只存服务器数据库），系统自动登录拉取对账。" }));
    }
    const { token, uid } = await upstreamSessionToken(cred.base, cred.user, cred.pass);
    const headers = { Authorization: `Bearer ${token}`, "New-Api-User": String(uid) };
    const pool = requireDb();

    // 1) 造物账号真实余额（平台真金；渠道 sk- 令牌查不到它）
    let balanceQuota: number | null = null;
    let usedQuota: number | null = null;
    try {
      const self = await axios.get(`${cred.base}/api/user/self`, { headers, timeout: 12_000, validateStatus: () => true });
      if (self.status === 200 && self.data?.success !== false) {
        balanceQuota = Number(self.data?.data?.quota ?? 0);
        usedQuota = Number(self.data?.data?.used_quota ?? 0);
      }
    } catch { /* 余额读取失败不阻断对账 */ }

    // 2) 近 7 天上游每日消耗（type=2 分页聚合，最多 20 页 × 100 条）
    const byDay = new Map<string, number>();
    let fetched = 0;
    for (let p = 0; p < 20 && fetched < 2000; p++) {
      const r = await axios.get(`${cred.base}/api/log/self?p=${p}&page_size=100&type=2`, { headers, timeout: 12_000, validateStatus: () => true });
      if (r.status !== 200) break;
      const payload = r.data?.data;
      const items = Array.isArray(payload) ? payload : payload?.items ?? [];
      if (!items.length) break;
      fetched += items.length;
      for (const it of items) {
        const day = new Date(Number(it.created_at) * 1000).toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) || 0) + Number(it.quota || 0));
      }
      if (items.length < 100) break;
    }
    // ⚠️ 换算口径：上游 log/self 的 quota 是 1,000,000 = ¥1（实测对齐 3 条 Seedance 视频账单）；
    // 与余额的 500,000 = ¥1 不同（log 记录美元基准，⚡ 展示含汇率），除数别混用。
    const upstreamDays = [...byDay.entries()].map(([day, quota]) => ({ day, upstreamCny: Math.round(quota / 1_000_000 * 100) / 100 })).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 7);

    // 3) XOi 侧同期每日消耗（用户真实消耗 / 池垫付分列，对账对照）
    const sinceSec = Math.floor(Date.now() / 1000) - 7 * 86_400;
    const local = await pool.query(
      `SELECT to_char(to_timestamp(l.created_at) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS day,
              SUM(CASE WHEN u.role < 100 THEN l.quota ELSE 0 END) AS user_q,
              SUM(CASE WHEN u.role >= 100 THEN l.quota ELSE 0 END) AS pool_q
       FROM logs l JOIN users u ON u.id = l.user_id
       WHERE l.type = 2 AND l.created_at >= $1 GROUP BY 1 ORDER BY 1 DESC`,
      [sinceSec],
    );
    const localMap = new Map<string, { userCny: number; poolCny: number }>(local.rows.map((r) => [String(r.day), { userCny: Math.round(Number(r.user_q) / 500000 * 100) / 100, poolCny: Math.round(Number(r.pool_q) / 500000 * 100) / 100 }]));
    const recon = upstreamDays.map((u) => {
      const l = localMap.get(u.day) ?? { userCny: 0, poolCny: 0 };
      return { ...u, userCny: l.userCny, poolCny: l.poolCny, marginCny: Math.round((l.userCny - u.upstreamCny) * 100) / 100 };
    });
    const totalMargin = Math.round(recon.reduce((s, r) => s + r.marginCny, 0) * 100) / 100;

    res.json(success({
      configured: true,
      account: cred.user.replace(/^(.{3}).*(@.*)$/, "$1***$2"),
      upstreamBalanceCny: balanceQuota === null ? null : Math.round(balanceQuota / 500000 * 100) / 100,
      upstreamUsedCny: usedQuota === null ? null : Math.round(usedQuota / 500000 * 100) / 100,
      recon, totalMarginCny: totalMargin, fetched,
    }));
  } catch (e) {
    res.status(502).json(error(`上游对账读取失败：${(e as Error).message}`));
  }
});

/** 保存上游账密（rootOnly；只存服务器数据库） */
router.post("/upstream-credentials", async (req, res) => {
  const me = await currentUser(req);
  if (!me || (me.role ?? 0) < 100) return res.status(403).json(error("仅站长可配置上游账号"));
  const user = String(req.body?.user || "").trim();
  const pass = String(req.body?.pass || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) return res.status(400).json(error("请填写上游账号（邮箱）"));
  if (pass.length < 6 || pass.length > 100) return res.status(400).json(error("密码长度 6–100"));
  const pool = requireDb();
  const entries: Array<[string, string]> = [["xoi_upstream_site_user", user], ["xoi_upstream_site_pass", pass]];
  for (const [k, v] of entries) {
    const existing = await pool.query("SELECT key FROM options WHERE key = $1 LIMIT 1", [k]);
    if (existing.rowCount) await pool.query("UPDATE options SET value = $1 WHERE key = $2", [v, k]);
    else await pool.query("INSERT INTO options (key, value) VALUES ($2, $1)", [v, k]);
  }
  upstreamSession = null; // 强制重新登录
  res.json(success({ saved: true }));
});


router.post("/upstream-pool/balance", async (req, res) => {
  const me = await currentUser(req);
  if (!me || (me.role ?? 0) < 100) return res.status(403).json(error("仅站长可更新上游余额"));
  const cny = Number(req.body?.cny);
  if (!Number.isFinite(cny) || cny < 0 || cny > 10_000_000) return res.status(400).json(error("请填写 0–10000000 的余额（元）"));
  const pool = requireDb();
  const existing = await pool.query("SELECT key FROM options WHERE key = 'xoi_upstream_balance_cny' LIMIT 1");
  if (existing.rowCount) await pool.query("UPDATE options SET value = $1 WHERE key = 'xoi_upstream_balance_cny'", [String(cny)]);
  else await pool.query("INSERT INTO options (key, value) VALUES ('xoi_upstream_balance_cny', $1)", [String(cny)]);
  res.json(success({ manualBalanceCny: cny }));
});

export default router;
