import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";

const router = express.Router();

// 修改用户角色（admin）
export default router.post(
  "/",
  validateFields({
    userId: z.number(),
    role: z.string(),
  }),
  async (req, res) => {
    const { userId, role } = req.body;

    if (!["admin", "user"].includes(role)) {
      return res.status(400).send(error("无效角色"));
    }

    // 不允许修改自己的角色
    const currentUser = (req as any).user;
    if (currentUser.id === userId) {
      return res.status(400).send(error("不能修改自己的角色"));
    }

    await u.db("o_user").where("id", userId).update({ role });
    res.status(200).send(success("角色更新成功"));
  },
);
