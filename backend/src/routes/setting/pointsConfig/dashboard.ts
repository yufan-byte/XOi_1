import express from "express";
import { boundedInteger, queryText } from "@/utils/adminQuery";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";

const u = database;
const router = express.Router();

// 管理员仪表盘统计
router.get("/dashboard", async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  try {
    // 用户总数
    const userCount = await u.db("o_user").count("* as count").first();

    // 总积分发放
    const totalPoints = await u.db("o_user").sum("points as total").first();

    // 消费积分统计
    const consumed = await u.db("o_points_log")
      .where("type", "consume")
      .sum("amount as total")
      .first();

    // 充值积分统计
    const recharged = await u.db("o_points_log")
      .where("type", "recharge")
      .sum("amount as total")
      .first();

    // 赠送积分统计
    const gifted = await u.db("o_points_log")
      .where("type", "gift")
      .sum("amount as total")
      .first();

    // 退款积分统计
    const refunded = await u.db("o_points_log")
      .where("type", "refund")
      .sum("amount as total")
      .first();

    // 各操作消费统计
    const actionStats = await u.db("o_points_log")
      .where("type", "consume")
      .select("action")
      .sum("amount as total")
      .count("* as count")
      .groupBy("action");

    // 会员统计
    const memberStats = await u.db("o_user")
      .select("member_level")
      .count("* as count")
      .groupBy("member_level");

    const [paidOrders, pendingOrders, revenue, runningTasks] = await Promise.all([
      u.db("o_order").where("status", "paid").count("id as count").first(),
      u.db("o_order").where("status", "pending").count("id as count").first(),
      u.db("o_order").where("status", "paid").sum("amount as total").first(),
      u.db("o_tasks").whereIn("state", ["pending", "running", "processing", "进行中"]).count("id as count").first(),
    ]);

    res.send(success({
      users: Number((userCount as any)?.count || 0),
      total_points: Number((totalPoints as any)?.total || 0),
      consumed_points: Math.abs(Number((consumed as any)?.total || 0)),
      recharged_points: Number((recharged as any)?.total || 0),
      gifted_points: Number((gifted as any)?.total || 0),
      refunded_points: Math.abs(Number((refunded as any)?.total || 0)),
      action_stats: actionStats,
      member_stats: memberStats,
      paid_orders: Number((paidOrders as any)?.count || 0),
      pending_orders: Number((pendingOrders as any)?.count || 0),
      revenue: Number((revenue as any)?.total || 0),
      running_tasks: Number((runningTasks as any)?.count || 0),
    }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 获取最近积分流水
router.get("/recentLogs", async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  try {
    const limit = boundedInteger(req.query.limit, 20, 100);
    const logs = await u.db("o_points_log")
      .join("o_user", "o_points_log.user_id", "=", "o_user.id")
      .select(
        "o_points_log.*",
        "o_user.name as user_name"
      )
      .orderBy("o_points_log.created_at", "desc")
      .limit(limit);

    res.send(success(logs));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

export default router;
