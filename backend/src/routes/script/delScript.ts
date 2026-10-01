import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 删除剧本
export default router.post(
  "/",
  validateFields({
    ids: z.array(z.number()),
  }),
  async (req, res) => {
    const { ids } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).send(error("未登录"));

    // 验证所有剧本属于当前用户的项目
    const scriptData = await u.db("o_script").whereIn("id", ids);
    if (scriptData.length > 0) {
      const projectIds = [...new Set(scriptData.map((s) => s.projectId))];
      const userProjects = await u.db("o_project").whereIn("id", projectIds).where("userId", userId).select("id");
      const userProjectIds = new Set(userProjects.map((p) => p.id));
      const unauthorized = projectIds.filter((pid) => !userProjectIds.has(pid));
      if (unauthorized.length > 0) {
        return res.status(403).send(error("无权删除其他用户的剧本"));
      }
    }
    if (scriptData && scriptData.length) {
      const scriptProjectId = new Set(scriptData.map((item) => item.projectId));
      await u.db("o_agentWorkData").whereIn("projectId", Array.from(scriptProjectId)).whereIn("episodesId", ids).delete();
    }
    const storyboardData = await u.db("o_storyboard").whereIn("scriptId", ids);
    if (storyboardData.length) {
      await Promise.all(
        storyboardData.map(async (item) => {
          try {
            item.filePath && (await u.oss.deleteFile(item.filePath));
          } catch (e) {}
        }),
      );
      const storyboardIds = storyboardData.map((item) => item.id);
      await u.db("o_assets2Storyboard").whereIn("storyboardId", storyboardIds).delete();
    }
    await u.db("o_scriptAssets").whereIn("scriptId", ids).delete();
    await u.db("o_script").whereIn("id", ids).delete();
    await u.db("o_storyboard").whereIn("scriptId", ids).delete();
    await u.db("o_video").whereIn("scriptId", ids).delete();
    res.status(200).send(success({ message: "删除剧本成功" }));
  },
);
