import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    trackId: z.number(),
    videoId: z.number(),
  }),
  async (req, res) => {
    const { trackId, videoId } = req.body;
    const adopted = await u.db.transaction(async trx => {
      const track = await trx('o_videoTrack').where({ id: trackId }).forUpdate().first();
      if (!track) return false;
      const video = await trx('o_video').where({ id: videoId, videoTrackId: trackId, projectId: track.projectId, scriptId: track.scriptId }).first();
      if (!video?.filePath || !['生成成功', '已完成'].includes(video.state || '')) return false;
      await trx('o_videoTrack').where({ id: trackId }).update({ videoId });
      return true;
    });
    if (!adopted) return res.status(409).json(error('该版本尚未完成或不属于本片段，未改变采用结果'));
    res.status(200).send(success({ message: "视频选择成功" }));
  },
);
