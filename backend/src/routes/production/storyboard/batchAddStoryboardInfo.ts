import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { saveStoryboardBatch } from "@/utils/storyboardStore";
import { requireDirectorReview } from '@/utils/directorStageReview';
import { continuitySchema } from '@/utils/directorContinuity';
const router = express.Router();
export default router.post(
  "/",
  validateFields({
    data: z.array(
      z.object({
        prompt: z.string(),
        duration: z.number(),
        track: z.string(),
        state: z.string(),
        src: z.string().nullable(),
        videoDesc: z.string(),
        shouldGenerateImage: z.number(),
        associateAssetsIds: z.array(z.number()),
        continuity: continuitySchema.nullable().optional(),
      }),
    ),
    scriptId: z.number(),
    projectId: z.number(),
  }),
  async (req, res) => {
    const { data, scriptId, projectId } = req.body;
    const reviewError = await requireDirectorReview(u.db, projectId, scriptId);
    if (reviewError) return res.status(409).send(error(reviewError));
    if (!data.length) return res.status(400).send({ success: false, message: "数据不能为空" });
    const lastStoryboard = await saveStoryboardBatch(u.db, projectId, scriptId, data);
    const storyboardData = await Promise.all(
      lastStoryboard.map(async (i) => {
        return {
          associateAssetsIds: i.associateAssetsIds,
          src: i.filePath ? await u.oss.getSmallImageUrl(i.filePath).catch(() => "") : "",
          id: i.id,
          trackId: i.trackId,
          prompt: i.prompt,
          duration: Number(i.duration),
          state: i.state,
          scriptId: i.scriptId,
          reason: i.reason,
          videoDesc: i.videoDesc
          ,continuity: i.continuity ? JSON.parse(i.continuity) : null
        };
      }),
    );
    return res.status(200).send(success(storyboardData));
  },
);
