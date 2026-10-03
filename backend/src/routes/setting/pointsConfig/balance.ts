/**
 * 余额查询（v3.0 P1 改造）
 *
 * 唯一账本已换成 new-api 的 users.quota，明细改从 `o_quota_ledger` 读。
 *
 * 【为什么不直接删掉这个接口】前端 `stores/user.ts` 的 refreshProfile() 还在调它，
 * 侧栏角标 / 个人中心徽章都依赖返回值。所以这里保持**响应字段名不变**
 * （points / member_level / breakdown），只是数据来源换掉，前端零改动。
 *
 * 语义映射：
 *   points        = 展示积分（默认 1 积分 = 1 元，见 QUOTA_PER_POINT）
 *   member_level  = 恒为 "free"（会员体系随积分体系一并退役，造物没有这个概念）
 *   breakdown     = 按流水类型汇总的累计入账（单位：展示积分）
 */
import express from "express";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";
import { getQuota, quotaToYuan, QUOTA_PER_UNIT } from "@/utils/quota";

const u = database;
const router = express.Router();

const QUOTA_PER_POINT = Number(process.env.QUOTA_PER_POINT || QUOTA_PER_UNIT) || QUOTA_PER_UNIT;

router.get("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).send(error("未登录"));

  // 禁用缓存，确保每次都返回最新数据
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  try {
    const quota = await getQuota(userId, { fresh: true });
    const points = Math.floor(quota / QUOTA_PER_POINT);

    // 明细来自新的额度流水表；旧表 o_points_log 已退役，不再读它
    let rows: { type: string | null; delta: number | string | null }[] = [];
    try {
      rows = await u.db("o_quota_ledger").where("user_id", userId).select("type", "delta");
    } catch {
      // 表还没建（老库未跑迁移）时不该让余额接口整页报错
      rows = [];
    }

    const breakdown = { checkin: 0, gift: 0, purchased: 0, member: 0 };
    for (const r of rows) {
      const amount = Math.floor(Number(r.delta || 0) / QUOTA_PER_POINT);
      if (amount <= 0) continue; // 明细只统计入账侧
      if (r.type === "checkin") breakdown.checkin += amount;
      else if (r.type === "gift" || r.type === "admin") breakdown.gift += amount;
      else if (r.type === "recharge" || r.type === "refund") breakdown.purchased += amount;
      else if (r.type === "member") breakdown.member += amount;
    }

    res.send(
      success({
        points,
        member_level: "free",
        breakdown,
        // —— v3.0 新增字段，新前端请直接用这两个 ——
        /** 折算成元的余额 */
        balance: quotaToYuan(quota),
        /** new-api 的原始额度（500000 = ¥1） */
        quota,
        /** 计价币种，前端格式化用 */
        currency: "CNY",
      }),
    );
  } catch (e: any) {
    res.status(500).send(error(e.message || "余额查询失败"));
  }
});

export default router;
