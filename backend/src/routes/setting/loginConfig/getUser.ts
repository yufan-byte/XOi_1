import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
const router = express.Router();

export default router.get("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).send(error("未登录"));

  const data = await u.db("o_user")
    .select("id", "name", "display_id", "role", "status", "created_at", "points", "member_level")
    .where("id", userId)
    .first();
  if (!data) return res.status(404).send(error("用户不存在"));

  res.status(200).send(success(data));
});
