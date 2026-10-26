import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import {createUnlinkedStoryboardTracks} from '@/utils/storyboardStore';
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
    const results=await createUnlinkedStoryboardTracks(u.db,projectId,scriptId,storyboardIds,duration);
    res.status(200).send(success(results));
  },
);
