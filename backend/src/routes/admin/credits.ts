/**
 * 平台「额度发放」——管理员直接给某个用户加/减额度（仅服务端）。
 *
 * 为什么需要它：在它之前，站长/客服要「给用户补钱」只有两条路 ——
 *   ① 发一张卡密再发给用户；② 让用户自己充值。前者把「一次性补偿」包装成
 *      「发行可流通凭证」，还会把码留在兑换码库里被重复核销的风险；后者根本走不通。
 *   客服补偿、误扣回滚、活动奖励、内部测试都需要一个**点对点、可审计**的入口。
 *
 * 为什么落 o_quota_ledger 而不是另建表：`utils/quota` 的 applyQuotaChange 已经是
 * 全站唯一的额度写入口（充值 / 赠送 / 签到 / 返还都走它），它自带
 * 「type + description + operator_id」的审计字段，正好用来记「谁、给谁、为什么、加了多少钱」。
 * 这里只是把 type 固定成 "admin"，operator_id 固定成当前登录的管理员。
 *
 * 权限：/api/admin 前缀已统一 requireAdmin（role ≥ 10 可读）；**动钱只允许站长（role ≥ 100）**，
 *      由下面的 superAdmin() 再查一次 new-api 的 users.role 兜底 —— 别只信前端隐藏按钮。
 * 红线：不代理 /api/token/*、不代改密码；这里只动 users.quota 一列，不动任何令牌。
 */
import express, { type Request, type Response } from "express";
import { requireAdmin } from "@/middleware/requireAdmin";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";
import { db } from "@/lib/agent/db";
import { applyQuotaChange, getBalanceYuan } from "@/utils/quota";
import { QuotaOperationError } from "@/utils/quotaOperations";
import { BILLING_ID_PATTERN } from "../../../../shared/billableOperations";

const router = express.Router();
router.use(requireAdmin);

/** 单笔发放上限（元）。客服补偿场景足够，同时挡住手滑多按两个零。 */
const MAX_YUAN = 100_000;
/** 发放方式：grant=加额度，revoke=扣回（误发追回） */
type Direction = "grant" | "revoke";

interface Operator { id: number; username: string }

/** 站长闸门：动钱的动作只有 role ≥ 100 能做（前端隐藏按钮不算数，后端必须再查一次）。 */
async function superAdmin(req: Request, res: Response): Promise<Operator | null> {
  const me = (req as unknown as { user?: { id?: number; name?: string } }).user;
  if (!me?.id) { res.status(401).send(error("未登录")); return null; }
  const pool = db();
  if (!pool) { res.status(500).send(error("数据库未配置")); return null; }
  const r = await pool.query<{ username: string; role: number }>("SELECT username, role FROM users WHERE id = $1", [me.id]);
  const role = Number(r.rows[0]?.role ?? 0);
  if (role < 100) { res.status(403).send(error("仅站长可发放额度")); return null; }
  return { id: me.id, username: String(r.rows[0]?.username ?? me.name ?? "") };
}

/** 目标用户：支持传 new-api 数字 id，或用户名（精确匹配）。 */
async function findTarget(target: string): Promise<{ id: number; username: string } | null> {
  const pool = db(); if (!pool) return null;
  const t = target.trim();
  if (!t) return null;
  const byId = /^\d+$/.test(t) ? Number(t) : null;
  const r = byId
    ? await pool.query<{ id: number; username: string }>("SELECT id, username FROM users WHERE id = $1", [byId])
    : await pool.query<{ id: number; username: string }>("SELECT id, username FROM users WHERE username = $1", [t]);
  return r.rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* GET / → 最近的发放记录（审计流水 type=admin）                          */
/* ------------------------------------------------------------------ */

/** 列表对所有管理员（role ≥ 10）开放：看得到「谁给谁发过多少」，是审计的一部分。 */
router.get("/", async (_req, res) => {
  try {
    const rows = (await u.db("o_quota_ledger")
      .where("type", "admin")
      .orderBy("id", "desc")
      .limit(100)
      .select("id", "user_id", "delta", "quota_after", "description", "operator_id", "created_at")) as Array<Record<string, unknown>>;

    // 用户名 / 操作人名在 new-api 的 users 表（同库，但走裸 pg 一次批量取，避免 N+1）
    const ids = [...new Set(rows.flatMap((r) => [Number(r.user_id), Number(r.operator_id ?? 0)]).filter((n) => n > 0))];
    const names = new Map<number, string>();
    const pool = db();
    if (pool && ids.length) {
      const r = await pool.query<{ id: number; username: string }>("SELECT id, username FROM users WHERE id = ANY($1::int[])", [ids]);
      for (const x of r.rows) names.set(Number(x.id), x.username);
    }

    res.send(success(rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      username: names.get(Number(r.user_id)) ?? `#${r.user_id}`,
      delta: Number(r.delta),
      amount: Number(r.delta) / 500000,
      balanceAfter: Number(r.quota_after ?? 0) / 500000,
      reason: String(r.description ?? ""),
      operatorId: Number(r.operator_id ?? 0),
      operator: names.get(Number(r.operator_id ?? 0)) ?? (r.operator_id ? `#${r.operator_id}` : "—"),
      createdAt: String(r.created_at ?? ""),
    }))));
  } catch (e) {
    console.error("[admin/credits] 列表失败:", (e as Error).message);
    res.status(500).send(error("发放记录读取失败"));
  }
});

/* ------------------------------------------------------------------ */
/* POST / → 发放 / 扣回                                                  */
/* ------------------------------------------------------------------ */

router.post("/", async (req, res) => {
  const me = await superAdmin(req, res); if (!me) return;
  const b = (req.body ?? {}) as { target?: unknown; amount?: unknown; reason?: unknown; direction?: unknown };

  const target = String(b.target ?? "").trim();
  const amount = Math.round((Number(b.amount) || 0) * 100) / 100;
  const reason = String(b.reason ?? "").trim();
  const direction: Direction = b.direction === "revoke" ? "revoke" : "grant";
  const requestId=String(req.headers["idempotency-key"]||"");
  if(!BILLING_ID_PATTERN.test(requestId))return res.status(400).send(error("请刷新额度发放页面，提交时必须携带唯一操作编号"));

  if (!target) return res.status(400).send(error("请填写目标用户（用户 ID 或用户名）"));
  if (!(amount > 0)) return res.status(400).send(error("金额需大于 0"));
  if (amount > MAX_YUAN) return res.status(400).send(error(`单笔金额不能超过 ¥${MAX_YUAN}`));
  if (reason.length < 2) return res.status(400).send(error("请填写发放原因（至少 2 个字），这条会进审计流水"));
  if (reason.length > 200) return res.status(400).send(error("原因过长（最多 200 字）"));

  try {
    const target_user = await findTarget(target);
    if (!target_user) return res.status(404).send(error("找不到该用户（可用用户 ID 或用户名精确匹配）"));

    if (direction === "revoke") {
      const balance = await getBalanceYuan(target_user.id, { fresh: true });
      if (balance < amount) {
        return res.status(400).send(error(`该用户当前余额 ¥${balance.toFixed(2)}，不足以扣回 ¥${amount.toFixed(2)}`));
      }
    }

    const delta = Math.round(amount * 500000) * (direction === "revoke" ? -1 : 1);
    const { quotaAfter } = await applyQuotaChange({
      userId: target_user.id,
      delta,
      type: "admin",
      description: `${direction === "revoke" ? "扣回" : "发放"}：${reason}`,
      operatorId: me.id,
      referenceType: "manual",
      referenceId: String(me.id),
      idempotencyKey: `admin:${me.id}:${requestId}`,
    });

    res.send(success({
      userId: target_user.id,
      username: target_user.username,
      amount: direction === "revoke" ? -amount : amount,
      balanceAfter: quotaAfter === null ? null : quotaAfter / 500000,
      operator: me.username,
    }));
  } catch (e) {
    console.error("[admin/credits] 发放失败:", (e as Error).message);
    res.status(e instanceof QuotaOperationError?e.status:500).send(error(e instanceof QuotaOperationError?e.message:"额度发放失败，请联系站长核对流水"));
  }
});

export default router;
