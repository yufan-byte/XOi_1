import express from "express";
import u from "@/utils";
import { z } from "zod";
import sharp from "sharp";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { Output, tool } from "ai";
import { assetItemSchema } from "@/agents/productionAgent/tools";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";
import { requireDirectorReview } from '@/utils/directorStageReview';
import { loadDirectorContinuity, continuityPrompt, runSceneGroups, selectedContinuityAnchor } from '@/utils/directorContinuity';
import { saveStoryboardImageVersion } from '@/utils/storyboardImageHistory';
import { creativePreferencePrompt } from '../../../../../shared/creativePreference';
const router = express.Router();
export type AssetData = z.infer<typeof assetItemSchema>;

export default router.post(
  "/",
  validateFields({
    storyboardIds: z.array(z.number()),
    projectId: z.number(),
    scriptId: z.number(),
    concurrentCount: z.number().min(1).optional(),
    compulsory: z.boolean().optional(),
  }),
  async (req, res) => {
    const userId = (req as any).user?.id;
    const {
      storyboardIds,
      projectId,
      scriptId,
      concurrentCount = 5,
      compulsory = false,
    }: {
      storyboardIds: number[];
      projectId: number;
      scriptId: number;
      concurrentCount: number;
      compulsory: boolean;
    } = req.body;
    if (!storyboardIds || storyboardIds.length === 0) return res.status(400).send(error("storyboardIds不能为空"));
    const reviewError = await requireDirectorReview(u.db, projectId, scriptId);
    if (reviewError) return res.status(409).send(error(reviewError));
    let continuityFrames: Awaited<ReturnType<typeof loadDirectorContinuity>>;
    try { continuityFrames = await loadDirectorContinuity(u.db, projectId, scriptId); }
    catch (e) { return res.status(400).send(error(u.error(e).message)); }
    const generationIds = new Set(storyboardIds);
    try {
      for (const frame of continuityFrames.filter(f => generationIds.has(Number(f.id)))) {
        const anchor = selectedContinuityAnchor(continuityFrames, frame);
        if (anchor && generationIds.has(Number(anchor.id)) && continuityFrames.indexOf(anchor) > continuityFrames.indexOf(frame)) throw Error('所选空间锚点也在本轮重画且位于后方，请先生成锚点再重画其他镜头');
      }
    } catch (e) { return res.status(400).send(error(u.error(e).message)); }
    for (const [index, frame] of continuityFrames.entries()) {
      if (!generationIds.has(Number(frame.id)) || frame.continuity?.transition !== 'continue') continue;
      const previous = continuityFrames[index - 1];
      if (!frame.sceneId || !previous || previous.sceneId !== frame.sceneId) return res.status(400).send(error('连续动作接镜需要上一镜与本镜关联同一个场景，请先与导演助理核对分镜表'));
    }

    // 检查积分（每张图片扣一次）
    if (userId) {
      const required = await getActionPoints("image_generate");
      const total = required * storyboardIds.length;
      if (total > 0) {
        const balance = await getUserPoints(userId);
        if (balance < total) {
          return res.status(400).send(error(`积分不足，需要 ${total} 积分，当前余额 ${balance}`));
        }
      }
    }
    // 当没有 storyboardIds 时，通过 AI 生成新的分镜面板数据
    let finalStoryboardIds: number[] = storyboardIds || [];
    // shouldGenerateImage === 0 的分镜标记为「未生成」，其余标记为「生成中」
    const storyboardData = await u.db("o_storyboard").where("scriptId", scriptId).where("projectId", projectId).whereIn("id", finalStoryboardIds);
    if (!storyboardData.length) return res.status(500).send(error("未查到分镜数据"));
    const storyIds = storyboardData.map((i) => i.id);
    if (compulsory) {
      await u.db("o_storyboard").whereIn("id", storyIds).where("scriptId", scriptId).update({ state: "生成中", shouldGenerateImage: 1 });
    } else {
      await u.db("o_storyboard").whereIn("id", storyIds).where("scriptId", scriptId).where("shouldGenerateImage", 0).update({ state: "未生成" });
      await u.db("o_storyboard").whereIn("id", storyIds).where("scriptId", scriptId).where("shouldGenerateImage", 1).update({ state: "生成中" });
    }

    const projectSettingData = await u.db("o_project").where("id", projectId).select("imageModel", "imageQuality", "artStyle", "videoRatio").first();

    // 按显式顺序读取参考；PostgreSQL 没有 SQLite 的隐式 rowid。
    const assets2StoryboardRows = await u
      .db("o_assets2Storyboard")
      .whereIn("storyboardId", storyIds)
      .orderBy("sortOrder", "asc", "last").orderBy("assetId")
      .select("storyboardId", "assetId");

    // 收集所有 assetId，批量查对应的 imageId
    const allAssetIds = [...new Set(assets2StoryboardRows.map((r: any) => r.assetId))];
    const assetImageMap: Record<number, number> = {};
    if (allAssetIds.length > 0) {
      const assetRows = await u.db("o_assets").whereIn("id", allAssetIds).select("id", "imageId");
      assetRows.forEach((row: any) => {
        assetImageMap[row.id] = row.imageId;
      });
    }

    // 按 rowid 顺序重建 assetRecord，值为有序的 imageId 列表
    const assetRecord: Record<number, number[]> = {};
    assets2StoryboardRows.forEach((item: any) => {
      if (!assetRecord[item.storyboardId]) {
        assetRecord[item.storyboardId] = [];
      }
      const imageId = assetImageMap[item.assetId];
      if (imageId != null) {
        assetRecord[item.storyboardId].push(imageId);
      }
    });
    const realStoryData = await u.db("o_storyboard").where("scriptId", scriptId).where("projectId", projectId).whereIn("id", storyIds);

    // 扣除积分（每张图片扣一次）—— 按 o_project.imageModel 解析出差异化计费上下文
    let pointsDeducted = 0;
    let balance = 0;
    if (userId) {
      const imgModelStr = String((projectSettingData?.imageModel as string | undefined) ?? "");
      const kvArr = imgModelStr.includes(":") ? imgModelStr.split(/:(.+)/) : [] as string[];
      const pricingCtx = { vendorId: kvArr[0] || null, modelName: kvArr[1] || null } as const;
      const required = await getActionPoints("image_generate", pricingCtx);
      if (required > 0) {
        for (let i = 0; i < storyboardIds.length; i++) {
          await deductPoints(userId, "image_generate", "批量生成图片", pricingCtx);
        }
        pointsDeducted = required * storyboardIds.length;
        balance = await getUserPoints(userId);
      }
    }

    // 参考图缺失提示：assetRecord 为空的分镜意味着 AI 拿不到角色/场景形象参考，
    // 只能凭空生成 —— 角色一致性/场景连续性会崩。这里不阻断（可能是有意为之），
    // 但必须用 message 明确告知，避免前端静默产出崩坏结果（旧行为是无声 filter 掉）。
    const noRefCount = realStoryData.filter((i) => !(assetRecord[i.id!]?.length)).length;
    const warningMessage =
      noRefCount > 0
        ? `${noRefCount}/${realStoryData.length} 个分镜缺少角色/场景参考图，生成结果可能与设定不一致；建议先到「角色场景」页生成资产图。`
        : "成功";

    res.status(200).send(
      success(
        realStoryData.map((i) => ({
          id: i.id,
          prompt: i.prompt,
          associateAssetsIds: assetRecord[i.id!],
          src: null,
          state: i.state,
          videoDesc: i.videoDesc,
          shouldGenerateImage: i.shouldGenerateImage,
          pointsDeducted,
          balance,
        })),
        warningMessage,
      ),
    );

    const sceneAnchors = new Map<number, string>();
    const generated = new Map<number, boolean>();
    for (const frame of continuityFrames) {
      if (frame.sceneId && frame.filePath && !generationIds.has(Number(frame.id)) && !sceneAnchors.has(frame.sceneId)) sceneAnchors.set(frame.sceneId, frame.filePath);
    }
    const generateTask = async (item: (typeof storyboardData)[number]) => {
      const index = continuityFrames.findIndex(f => Number(f.id) === Number(item.id));
      const frame = continuityFrames[index];
      const previous = continuityFrames[index - 1];
      const repeloadObj = {
        prompt: item.prompt! + '\n' + creativePreferencePrompt(projectSettingData?.artStyle, '视觉风格') + continuityPrompt(frame.continuity, frame.sceneName, previous?.continuity),
        size: projectSettingData?.imageQuality as "1K" | "2K" | "4K",
        aspectRatio: projectSettingData?.videoRatio as `${number}:${number}`,
      };
      try {
        const references: {type:'image';base64:string}[] = [];
        const legend: string[] = [];
        for (const asset of frame.references) {
          if (!asset.filePath) continue;
          references.push({type:'image',base64:await u.oss.getImageBase64(asset.filePath)});
          legend.push(`参考${references.length}：固定${asset.type === 'scene' ? '场景布局' : '资产'}「${asset.name}」`);
        }
        const pinned = selectedContinuityAnchor(continuityFrames, frame);
        if (pinned && generated.get(Number(pinned.id)) === false) throw Error('固定空间锚点本轮生成失败，请先修复锚点');
        let anchor = pinned?.filePath || (frame.sceneId ? sceneAnchors.get(frame.sceneId) : undefined);
        if (frame.continuity?.transition === 'continue') {
          if (!previous?.filePath || generated.get(Number(previous.id)) === false) throw Error('上一镜图片尚未完成，本镜未提交模型。请重试上一镜后再继续');
          anchor = previous.filePath;
        }
        if (anchor) {
          references.push({type:'image',base64:await u.oss.getImageBase64(anchor)});
          legend.push(`参考${references.length}：${frame.continuity?.transition === 'continue' ? '上一镜画面，延续人物和空间状态' : '本场景已确认的画面锚点，仅保持布景/光线，不照抄构图'}`);
        }
        if (pinned?.filePath && pinned.filePath !== anchor) {
          references.push({ type: 'image', base64: await u.oss.getImageBase64(pinned.filePath) });
          legend.push(`参考${references.length}：用户固定的空间布局锚点，保留床、门窗和家具空间关系，不覆盖上一镜人物末态`);
        }
        const scene = frame.references.find((a: { type: string; id: unknown; describe?: string }) => a.type === 'scene' && Number(a.id) === frame.sceneId);
        if (scene?.describe) repeloadObj.prompt += '\n固定场景设定：' + scene.describe;
        repeloadObj.prompt += '\n参考图对应关系：' + legend.join('；');
        const imageCls = await u.Ai.Image(projectSettingData?.imageModel as `${string}:${string}`).run(
          {
            referenceList: references,
            ...repeloadObj,
          },
          {
            taskClass: "生成分镜图片",
            describe: "分镜图片生成",
            relatedObjects: JSON.stringify(repeloadObj),
            projectId: projectId,
          },
        );
        const savePath = `/${projectId}/assets/${scriptId}/${u.uuid()}.jpg`;
        await imageCls.save(savePath);
        frame.filePath = savePath;
        generated.set(Number(item.id), true);
        if (frame.sceneId && !sceneAnchors.has(frame.sceneId)) sceneAnchors.set(frame.sceneId, savePath);
        await saveStoryboardImageVersion(u.db, projectId, scriptId, Number(item.id), savePath);
      } catch (e) {
        generated.set(Number(item.id), false);
        await u.db("o_storyboard")
          .where("id", item.id)
          .update({
            reason: u.error(e).message,
            state: "生成失败",
          });
      }
    };
    // 按 concurrentCount 控制并发数，分批执行；跳过 shouldGenerateImage === 0 的分镜
    let generateList = [];
    if (compulsory) {
      generateList = storyboardData;
    } else {
      generateList = storyboardData.filter((item) => item.shouldGenerateImage !== 0);
    }
    generateList.sort((a,b) => continuityFrames.findIndex(f=>Number(f.id)===Number(a.id))-continuityFrames.findIndex(f=>Number(f.id)===Number(b.id)));
    await runSceneGroups(generateList, item => {
      const frame = continuityFrames.find(f=>Number(f.id)===Number(item.id));
      return frame?.sceneId ? `scene:${frame.sceneId}` : `shot:${item.id}`;
    }, generateTask, Math.min(concurrentCount, 8));
  },
);
async function getAssetsImageBase64(imageIds: number[]) {
  if (!imageIds.length) return [];

  const imagePaths = await u.db("o_image").whereIn("o_image.id", imageIds).select("o_image.id", "o_image.filePath");

  // 建立 id 到 filePath 的映射
  const id2Path = new Map<number, string>();
  for (const row of imagePaths) {
    id2Path.set(row.id, row.filePath);
  }

  // 保证输出顺序与 imageIds 一致
  const imageUrls = await Promise.all(
    imageIds.map(async (id) => {
      const filePath = id2Path.get(id);
      if (filePath) {
        try {
          return await u.oss.getImageBase64(filePath);
        } catch {
          return null;
        }
      }
      return null;
    }),
  );
  // 保留顺序，并且过滤掉无效项
  return (imageUrls.filter(Boolean) as string[]).map((url) => ({ type: "image" as const, base64: url }));
}
