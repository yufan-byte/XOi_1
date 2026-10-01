import express from "express";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { ReferenceList } from "@/utils/ai";
import { capturePoints, pricingContextFromModel, releasePoints, reservePoints, type BillingReservation } from "@/utils/billing";
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
    uploadData: z.array(
      z.object({
        id: z.number(),
        sources: z.string(),
      }),
    ),
    prompt: z.string(),
    model: z.string(),
    mode: z.string(),
    resolution: z.string(),
    duration: z.number(),
    audio: z.boolean().optional(),
    trackId: z.number(),
  }),
  async (req, res) => {
    const { scriptId, projectId, prompt, uploadData, model, duration, resolution, audio, mode, trackId } = req.body;
    const userId = (req as any).user?.id;

    let modeData = [];
    if (Array.isArray(mode)) {
    } else if (typeof mode === "string" && mode.startsWith('["') && mode.endsWith('"]')) {
      try {
        modeData = JSON.parse(mode);
      } catch (e) {}
    }
    //获取生成视频比例
    const ratio = await u.db("o_project").select("videoRatio").where("id", projectId).first();
    const videoPath = `/${projectId}/video/${uuidv4()}.mp4`; //视频保存路径
    //查询出图片数据
    const images = await Promise.all(
      uploadData.map(async (item: UploadItem) => {
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
    //把images里面的图片转成base64格式
    const base64 = await Promise.all(
      images.map(async (item) => {
        if (!item) return null;
        return { base64: await u.oss.getImageBase64(item.path), type: item.sources == "audio" ? "audio" : "image" };
      }),
    );
    // 统一计费：提交任务前预扣，成功结算，失败释放。requestId 让重试和并发点击幂等。
    const requestId = `drama-video:${uuidv4()}`;
    let reservation: BillingReservation | null = null;
    if (userId) {
      reservation = await reservePoints({
        userId,
        requestId,
        scene: "drama.video",
        action: "video_generate",
        description: "漫剧视频生成",
        pricingCtx: pricingContextFromModel(model),
        referenceType: "video_task",
        referenceId: requestId,
        metadata: { duration, resolution, audio: Boolean(audio) },
      });
      if (!reservation.success) {
        return res.status(400).json(error(reservation.message || "积分不足，无法发起视频生成任务"));
      }
    }

    let videoId: number;
    try {
      [videoId] = await u.db("o_video").insert({
        filePath: videoPath,
        time: Date.now(),
        state: "生成中",
        scriptId,
        projectId,
        videoTrackId: trackId,
      });
    } catch (insertError) {
      if (reservation) await releasePoints(reservation, "视频任务创建失败退还");
      throw insertError;
    }
    res.status(200).send(success(videoId));
    const relatedObjects = {
      projectId,
      videoId,
      scriptId,
      type: "视频",
    };
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
        if (reservation) {
          try {
            await capturePoints(reservation);
          } catch (settleError: any) {
            // 成品已交付时不退款，只记录结算异常，后台可按 requestId 补偿处理。
            console.error(`[drama-video] 任务 ${videoId} 结算异常:`, settleError?.message || settleError);
          }
        }
      })
      .catch(async (error: any) => {
        // 生成失败，不扣分
        await u
          .db("o_video")
          .where("id", videoId)
          .update({
            state: "生成失败",
            errorReason: u.error(error).message,
          });
        if (reservation) {
          try {
            await releasePoints(reservation, "视频生成失败退还");
          } catch (releaseError: any) {
            console.error(`[drama-video] 任务 ${videoId} 退款异常:`, releaseError?.message || releaseError);
          }
        }
      });
  },
);
