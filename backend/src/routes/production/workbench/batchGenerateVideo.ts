import express from "express";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { ReferenceList } from "@/utils/ai";
import { capturePoints, pricingContextFromModel, quoteBilling, releasePoints, reservePoints, type BillingReservation } from "@/utils/billing";
const router = express.Router();

type Type = "imageReference" | "startImage" | "endImage" | "videoReference" | "audioReference";
interface UploadItem {
  fileType: "image" | "video" | "audio";
  type: Type;
  sources?: "assets" | "storyboard";
  id?: number;
  src?: string;
  label?: string;
  prompt?: string;
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number(),
    trackData: z.array(
      z.object({
        uploadData: z.array(
          z.object({
            id: z.number(),
            sources: z.string(),
          }),
        ),
        trackId: z.number(),
        prompt: z.string(),
        duration: z.number(),
      }),
    ),
    model: z.string(),
    mode: z.string(),
    resolution: z.string(),
    audio: z.boolean().optional(),
  }),
  async (req, res) => {
    const userId = (req as any).user?.id;
    const { scriptId, projectId, trackData, model, resolution, audio, mode } = req.body;

    let modeData = [];
    if (Array.isArray(mode)) {
    } else if (typeof mode === "string" && mode.startsWith('["') && mode.endsWith('"]')) {
      try {
        modeData = JSON.parse(mode);
      } catch (e) {}
    }

    // 批量任务按子任务预扣，任何一条失败都只释放自己的积分；不再把整批当成一笔扣费。
    const batchId = uuidv4();
    const reservations: Array<BillingReservation | null> = [];
    const pricingCtx = pricingContextFromModel(model);
    const quotedPoints = userId ? await quoteBilling({ action: "video_generate", pricingCtx }) : 0;
    if (userId) {
      for (let index = 0; index < trackData.length; index += 1) {
        const reservation = await reservePoints({
          userId,
          requestId: `drama-video-batch:${batchId}:${index}`,
          scene: "drama.video",
          action: "video_generate",
          description: "漫剧批量视频生成",
          pricingCtx,
          quotedPoints,
          referenceType: "video_batch_task",
          referenceId: batchId,
          metadata: { batchId, index, duration: trackData[index].duration, resolution, audio: Boolean(audio) },
        });
        if (!reservation.success) {
          for (const previous of reservations) {
            if (previous) await releasePoints(previous, "批量任务余额不足，预扣释放");
          }
          return res.status(400).send(error(reservation.message || "积分不足，无法发起批量视频任务"));
        }
        reservations.push(reservation);
      }
    }

    // 获取生成视频比例
    const ratio = await u.db("o_project").select("videoRatio").where("id", projectId).first();

    // 为每个 track 预处理数据并插入数据库，返回任务列表
    let tasks: Array<any>;
    try {
      tasks = await Promise.all(
        (trackData as { uploadData: { id: number; sources: string }[]; trackId: number; prompt: string; duration: number }[]).map(async (track, index) => {
        const { uploadData, trackId, prompt, duration } = track;

        // 查询出图片数据
        const images = await Promise.all(
          uploadData.map(async (item) => {
            if (item.sources === "storyboard") {
              const filePath = await u.db("o_storyboard").where("id", item.id).select("filePath").first();
              return { path: filePath?.filePath, sources: "storyBoard" };
            }
            if (item.sources === "assets") {
              const filePath = await u
                .db("o_assets")
                .where("o_assets.id", item.id)
                .leftJoin("o_image", "o_assets.imageId", "o_image.id")
                .select("o_image.filePath", "o_image.type")
                .first();
              return { path: filePath?.filePath, sources: filePath.type };
            }
          }),
        );

        const videoPath = `/${projectId}/video/${uuidv4()}.mp4`;
        const [videoId] = await u.db("o_video").insert({
          filePath: videoPath,
          time: Date.now(),
          state: "生成中",
          scriptId,
          projectId,
          videoTrackId: trackId,
        });

        return { videoId, videoPath, prompt, duration, images, trackId, reservation: reservations[index] || null };
        }),
      );
    } catch (taskError) {
      for (const reservation of reservations) {
        if (reservation) await releasePoints(reservation, "批量任务创建失败退还");
      }
      throw taskError;
    }

    const pointsDeducted = reservations.reduce((sum, item) => sum + Number(item?.deducted || 0), 0);
    const balance = userId ? (await u.db("o_user").where("id", userId).select("points").first())?.points || 0 : 0;

    res.status(200).send(success({ tasks: tasks.map((t) => ({ videoId: t.videoId, trackId: t.trackId })), pointsDeducted, balance }));
    for (const { videoId, videoPath, prompt, duration, images, reservation } of tasks) {
      // 所有任务全部并发后台执行，完全不阻塞任何进程
      const base64 = await Promise.all(
        images.map(async (item: { path?: string; sources?: string } | null) => {
          if (!item?.path) return null;
          return { base64: await u.oss.getImageBase64(item.path), type: item.sources == "audio" ? "audio" : "image" };
        }),
      );
      const relatedObjects = { projectId, videoId, scriptId, type: "视频" };
      const aiVideo = u.Ai.Video(model);
      aiVideo
        .run(
          {
            prompt,
            referenceList: base64.filter(Boolean) as ReferenceList[],
            mode: modeData.length > 0 ? modeData : mode,
            duration,
            aspectRatio: (ratio?.videoRatio as "16:9" | "9:16") || "16:9",
            resolution,
            audio,
          },
          {
            projectId,
            taskClass: "视频生成",
            describe: "根据提示词生成视频",
            relatedObjects: JSON.stringify(relatedObjects),
          },
        )
        .then(async () => await aiVideo.save(videoPath))
        .then(async () => {
          await u.db("o_video").where("id", videoId).update({ state: "生成成功" });
          if (reservation) await capturePoints(reservation);
        })
        .catch(async (error: any) => {
          await u
            .db("o_video")
            .where("id", videoId)
            .update({
              state: "生成失败",
              errorReason: u.error(error).message,
            });
          if (reservation) {
            try {
              await releasePoints(reservation, "批量视频生成失败退还");
            } catch (releaseError: any) {
              console.error(`[drama-video-batch] 任务 ${videoId} 退款异常:`, releaseError?.message || releaseError);
            }
          }
        });
    }
  },
);
