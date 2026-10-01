import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number(),
    duration: z.number().optional(),
    storyboardIds: z.array(z.number()),
  }),
  async (req, res) => {
    const { projectId, scriptId, duration = 8, storyboardIds } = req.body;

    // 验证分镜数据
    // 一个分镜只能关联一个片段；重复点击批量创建时跳过已关联的分镜，避免重复插入轨道。
    const storyboards = await u.db("o_storyboard")
      .whereIn("id", storyboardIds)
      .where({ projectId, scriptId })
      .whereNull("trackId");
    // 全部已关联时返回空结果，使接口具备幂等性，重复请求不会报错或创建重复轨道。
    if (!storyboards.length) return res.status(200).send(success([]));

    const results = [];

    // 为每个分镜创建对应的 track
    for (const storyboard of storyboards) {
      const trackId = Date.now() + Math.floor(Math.random() * 1000);

      // 创建 track
      await u.db("o_videoTrack").insert({
        id: trackId,
        projectId,
        scriptId,
        duration,
      });

      // 更新分镜的 trackId 关联
      await u.db("o_storyboard").where("id", storyboard.id).update({
        trackId,
      });

      results.push({ trackId, storyboardId: storyboard.id });
    }

    res.status(200).send(success(results));
  },
);
