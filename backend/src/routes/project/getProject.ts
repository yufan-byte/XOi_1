import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
const router = express.Router();

// 获取项目（按用户隔离）
export default router.post("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).send({ message: "未登录" });
  }
  const data = await u.db("o_project").where("userId", userId).select("*");
  res.status(200).send(success(data));
});
