import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 删除原文
export default router.post(
  "/",
  validateFields({
    id: z.number(),
  }),
  async (req, res) => {
    const { id } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).send(error("未登录"));

    // 验证原文属于当前用户的项目
    const novel = await u.db("o_novel").where("id", id).first();
    if (!novel) return res.status(404).send(error("原文不存在"));
    const project = await u.db("o_project").where("id", novel.projectId).where("userId", userId).first();
    if (!project) return res.status(403).send(error("无权删除此原文"));

    const chapterData = await u.db("o_eventChapter").where("novelId", id);
    await u.db("o_eventChapter").where("novelId", id).delete();
    const eventIds = chapterData.map((i) => i.id);
    if (eventIds.length) await u.db("o_event").whereIn("id", eventIds).delete();
    await u.db("o_novel").where("id", id).del();

    res.status(200).send(success({ message: "删除原文成功" }));
  },
);
