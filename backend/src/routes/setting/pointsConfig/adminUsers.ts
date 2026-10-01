import express from "express";
import { boundedInteger, queryText } from "@/utils/adminQuery";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";

const u = database;
const router = express.Router();

// 管理员查看所有用户积分
router.get("/users", async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  try {
    const page = boundedInteger(req.query.page, 1, 10000);
    const limit = boundedInteger(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;
    const search = queryText(req.query.search);

    let query = u.db("o_user")
      .select("o_user.id", "o_user.name", "o_user.points", "o_user.member_level", "o_user.created_at")
      .orderBy("o_user.points", "desc");

    if (search) {
      query = query.where("o_user.name", "like", `%${search}%`);
    }

    const users = await query.limit(limit).offset(offset);
    const total = await u.db("o_user").count("* as count").first();

    res.send(success({
      users,
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

// 管理员查看指定用户的积分流水
router.get("/user/:id/log", async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  try {
    const targetId = parseInt(req.params.id);
    const page = boundedInteger(req.query.page, 1, 10000);
    const limit = boundedInteger(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;

    const logs = await u.db("o_points_log")
      .where("user_id", targetId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);

    const total = await u.db("o_points_log")
      .where("user_id", targetId)
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
