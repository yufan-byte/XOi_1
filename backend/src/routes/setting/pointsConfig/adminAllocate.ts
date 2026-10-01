import express from "express";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";
import { giftPoints } from "@/utils/points";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";

const u = database;
const router = express.Router();

// 管理员分配积分给用户
router.post("/allocate", validateFields({
  user_id: z.number().int().positive(),
  points: z.number().int().min(1).max(100000),
  description: z.string().max(500).optional(),
  request_id: z.string().uuid(),
}), async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  const { user_id, points, description } = req.body;
  if (!user_id || !points || !Number.isInteger(points) || points <= 0) {
    return res.status(400).send(error("积分数必须为正整数"));
  }
  if (points > 100000) {
    return res.status(400).send(error("单次赠送积分不能超过100000"));
  }

  try {
    // 检查目标用户是否存在
    const targetUser = await u.db("o_user").where("id", user_id).first();
    if (!targetUser) return res.status(404).send(error("用户不存在"));

    await giftPoints(user_id, points, userId, description, req.body.request_id);
    res.send(success({ message: "分配成功" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 管理员批量分配积分
router.post("/batchAllocate", validateFields({
  user_ids: z.array(z.number().int().positive()).min(1).max(100),
  points: z.number().int().min(1).max(100000),
  description: z.string().max(500).optional(),
  request_id: z.string().uuid(),
}), async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  const { user_ids, points, description } = req.body;
  if (!user_ids || !Array.isArray(user_ids) || !points || points <= 0) {
    return res.status(400).send(error("参数错误"));
  }

  try {
    for (const uid of new Set<number>(user_ids)) {
      const targetUser = await u.db("o_user").where("id", uid).first();
      if (targetUser) {
        await giftPoints(uid, points, userId, description, req.body.request_id + ":" + uid);
      }
    }
    res.send(success({ message: "批量分配成功" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

export default router;
