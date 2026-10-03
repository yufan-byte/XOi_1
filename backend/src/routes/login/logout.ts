/**
 * 退出登录（v3.0 新增）
 *
 * XOi 的 JWT 是无状态的，靠 o_user.session_version 实现「踢下线」：
 * 这里把当前用户的 session_version +1，所有已签发的旧 token 立刻失效。
 * 前端拿到 200 之后自行清 localStorage（见 console/src/lib/api.ts 的 logout()）。
 */
import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";

const router = express.Router();

export default router.post("/", async (req, res) => {
  const id = (req as unknown as { user?: { id?: number } }).user?.id;
  if (!id) return res.status(401).send(error("未登录"));
  try {
    await u.db("o_user").where("id", id).increment("session_version", 1);
  } catch (e) {
    console.error("[logout] session_version 自增失败:", e instanceof Error ? e.message : e);
    return res.status(500).send(error("退出失败，请稍后重试"));
  }
  return res.status(200).send(success(null, "已退出登录"));
});
