import express from "express";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";
import { getUserPoints } from "@/utils/points";

const u = database;
const router = express.Router();

// 查询当前用户积分
router.get("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).send(error("未登录"));

  // 禁用缓存，确保每次都返回最新数据
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    const points = await getUserPoints(userId);
    const user = await u.db("o_user").where("id", userId).first();

    // 按类型统计积分明细
    const logs = await u.db("o_points_log").where("user_id", userId).select("type", "amount");
    const breakdown = { checkin: 0, gift: 0, purchased: 0, member: 0 };
    for (const log of logs) {
      if (log.type === "checkin") breakdown.checkin += log.amount;
      else if (log.type === "gift") breakdown.gift += log.amount;
      else if (log.type === "recharge") breakdown.purchased += log.amount;
      else if (log.type === "member") breakdown.member += log.amount;
    }

    res.send(success({
      points,
      member_level: user?.member_level || "free",
      breakdown
    }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

export default router;
