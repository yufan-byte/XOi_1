/**
 * 平台运营 · 网关记录（充值订单 / 兑换码）
 *
 * 为什么读网关而不是 XOi 自己的表：
 *   XOi 的充值与兑换**都是网关（new-api）在处理** —— 支付渠道、订单、回调、卡密全在网关侧
 *   （我们的 routes/user/{pay,topup}.ts 只是原样代理）。所以「真钱在哪」的真源在网关的
 *   `topup` / `redemption` 两张表，管理员令牌 + New-Api-User 就能拉（已在 2026-10-03 实测：
 *   `GET /api/user/topup?p=0&page_size=3` → `{data:{page,page_size,total,items}}`）。
 *   本仓库 routes/admin/orders.ts 读的是 **o_order（旧积分订单，已下线）**，不要拿它当充值记录。
 *
 * 挂载：/api/admin/gateway（app.ts 里 /api/admin 已统一套 requireAdmin）
 *   GET /topups?p=&page_size=      充值订单
 *   GET /redemptions?p=&page_size= 兑换码
 */
import express from "express";
import { backendRaw } from "@/lib/reseller/auth";
import { success, error } from "@/lib/responseFormat";
import { boundedInteger } from "@/utils/adminQuery";

const router = express.Router();

/** 网关分页参数口径：p 从 0 起（new-api 约定），page_size ≤ 100 */
function pager(req: express.Request): string {
  const page = boundedInteger(req.query.p, 0, 100000);
  const size = boundedInteger(req.query.page_size, 20, 100);
  return `p=${page}&page_size=${size}`;
}

async function proxy(req: express.Request, res: express.Response, upstream: string, label: string) {
  try {
    const { status, body } = await backendRaw(req, `${upstream}?${pager(req)}`);
    // 网关形状 {data:{page,page_size,total,items},message,success} 原样带回，控制台按 total/items 渲染
    res.status(status).send(body);
  } catch (e) {
    res.status(502).send(error(`${label}加载失败：${(e as Error).message}`));
  }
}

router.get("/topups", async (req, res) => proxy(req, res, "/api/user/topup", "充值记录"));
router.get("/redemptions", async (req, res) => proxy(req, res, "/api/redemption", "兑换码"));

export default router;
