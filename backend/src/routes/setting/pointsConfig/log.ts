import express from "express";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";

const u = database;
const router = express.Router();

// 查询当前用户积分流水
router.get("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).send(error("未登录"));

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const logs = await u.db("o_points_log")
      .where("user_id", userId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);

    const total = await u.db("o_points_log")
      .where("user_id", userId)
      .count("* as count")
      .first();

    res.send(success({
      logs,
      pagination: {
        page,
        limit,
        total: Number((total as any)?.count || 0)
      }
    }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

export default router;
