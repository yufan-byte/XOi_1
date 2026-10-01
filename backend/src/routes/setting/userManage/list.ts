import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";

const router = express.Router();

// 获取所有用户列表（admin）
export default router.get("/", async (req, res) => {
  const users = await u.db("o_user")
    .select("id", "name", "role", "status", "created_at")
    .orderBy("id", "asc");
  res.status(200).send(success(users));
});
