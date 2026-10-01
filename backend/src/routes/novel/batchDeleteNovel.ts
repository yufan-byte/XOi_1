import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    ids: z.array(z.number()),
  }),
  async (req, res) => {
    const { ids } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).send(error("未登录"));
    if (!ids.length) {
      return res.status(400).send(error("请先选择需要删除的内容"));
    }

    // 验证所有原文属于当前用户的项目
    const novels = await u.db("o_novel").whereIn("id", ids);
    if (novels.length > 0) {
      const projectIds = [...new Set(novels.map((n) => n.projectId))];
      const userProjects = await u.db("o_project").whereIn("id", projectIds).where("userId", userId).select("id");
      const userProjectIds = new Set(userProjects.map((p) => p.id));
      const unauthorized = projectIds.filter((pid) => !userProjectIds.has(pid));
      if (unauthorized.length > 0) {
        return res.status(403).send(error("无权删除其他用户的原文"));
      }
    }
    const chapterData = await u.db("o_eventChapter").whereIn("novelId", ids);
    await u.db("o_eventChapter").whereIn("novelId", ids).delete();
    const eventIds = chapterData.map((i) => i.id);
    if (eventIds.length) await u.db("o_event").whereIn("id", eventIds).delete();

    await u.db("o_novel").whereIn("id", ids).del();

    res.status(200).send(success({ message: "删除原文成功" }));
  },
);
