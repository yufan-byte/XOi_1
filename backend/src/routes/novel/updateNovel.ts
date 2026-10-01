import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 更新原文数据
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    index: z.union([z.number(), z.string()]),
    reel: z.string(),
    chapter: z.string(),
    chapterData: z.string(),
    event: z.string(),
  }),
  async (req, res) => {
    const { id, index, reel, chapter, chapterData, event } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).send(error("未登录"));

    // 验证原文属于当前用户的项目
    const novel = await u.db("o_novel").where("id", id).first();
    if (!novel) return res.status(404).send(error("原文不存在"));
    const project = await u.db("o_project").where("id", novel.projectId).where("userId", userId).first();
    if (!project) return res.status(403).send(error("无权修改此原文"));

    await u.db("o_novel").where("id", id).update({
      chapterIndex: index,
      reel,
      chapter,
      chapterData,
      event: event,
    });

    res.status(200).send(success({ message: "更新原文成功" }));
  },
);
