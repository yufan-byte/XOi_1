import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";

const router = express.Router();

// 封禁/解封用户（admin）
export default router.post(
  "/",
  validateFields({
    userId: z.number(),
    status: z.string(),
  }),
  async (req, res) => {
    const { userId, status } = req.body;

    if (!["active", "banned"].includes(status)) {
      return res.status(400).send(error("无效状态"));
    }

    // 不允许封禁自己
    const currentUser = (req as any).user;
    if (currentUser.id === userId) {
      return res.status(400).send(error("不能封禁自己"));
    }

    await u.db("o_user").where("id", userId).update({ status });
    res.status(200).send(success(status === "banned" ? "已封禁" : "已解封"));
  },
);
