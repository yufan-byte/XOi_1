import express from "express";
import u from "@/utils";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { rateLimiter } from "@/middleware/rateLimiter";
const router = express.Router();

export default router.post(
  "/",
  rateLimiter({ windowMs: 60000, max: 10, keyGenerator: (req) => String((req as any).user?.id) }),
  validateFields({
    name: z.string().trim().min(3).max(50),
    password: z.string().max(72).optional(),
    oldPassword: z.string().max(100).optional(),
  }),
  async (req, res) => {
    const { name, password, oldPassword } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).send(error("未登录"));
    }

    if (!name || !name.trim()) {
      return res.status(400).send(error("用户名不能为空"));
    }

    // 检查用户名是否已被其他人使用
    const existing = await u.db("o_user").where("name", name.trim()).whereNot("id", userId).first();
    if (existing) {
      return res.status(400).send(error("用户名已被使用"));
    }

    // 构建更新对象
    const updateData: any = { name: name.trim() };

    // 如果提供了密码，必须验证旧密码
    if (password) {
      if (!oldPassword) {
        return res.status(400).send(error("修改密码需要提供旧密码"));
      }
      if (password.length < 6) {
        return res.status(400).send(error("密码长度至少 6 位"));
      }
      if (password === oldPassword) {
        return res.status(400).send(error("新密码不能与旧密码相同"));
      }

      // 验证旧密码
      const user = await u.db("o_user").where("id", userId).select("password").first();
      if (!user || !user.password || !user.password.startsWith("$2")) {
        return res.status(500).send(error("账号密码格式异常"));
      }
      const oldPasswordMatch = await bcrypt.compare(oldPassword, user.password);
      if (!oldPasswordMatch) {
        return res.status(400).send(error("旧密码错误"));
      }

      updateData.password = await bcrypt.hash(password, 12);
      updateData.session_version = u.db.raw("session_version + 1");
    }

    await u.db("o_user").where("id", userId).update(updateData);
    res.status(200).send(success("修改成功"));
  },
);
