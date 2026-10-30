import express from "express";
import pLimit from "p-limit";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";
import { isUsablePrompt } from "@/utils/promptQuality";
import { createBatchImagePlaceholders } from "@/utils/assetImageCandidates";

const router = express.Router();

type AssetType = "role" | "scene" | "tool";

interface AssetTypeConfig {
  label: string;
  taskClass: string;
  dir: string;
  promptTitle: string;
  promptEnd: string;
}

const assetTypeConfig: Record<AssetType, AssetTypeConfig> = {
  role: {
    label: "角色",
    taskClass: "角色图生成",
    dir: "role",
    promptTitle: "角色标准四视图",
    promptEnd: "人物角色四视图",
  },
  scene: {
    label: "场景",
    taskClass: "场景图生成",
    dir: "scene",
    promptTitle: "标准场景图",
    promptEnd: "标准场景图",
  },
  tool: {
    label: "道具",
    taskClass: "道具图生成",
    dir: "props",
    promptTitle: "标准道具图",
    promptEnd: "标准道具图",
  },
};

type Composition = "default" | "single" | "four-view" | "prompt";
function buildPrompt(cfg: AssetTypeConfig, artStyle: string, name: string, prompt: string, composition: Composition = "default"): string {
  const title = composition === "single" ? `单张${cfg.label}图` : composition === "four-view" ? `${cfg.label}四视图` : composition === "prompt" ? `${cfg.label}图` : cfg.promptTitle;
  const ending = composition === "prompt" ? "请遵循上面的提示词构图和设计要求。" : `请严格按照要求生成${title}。`;
  return `
    请根据以下参数生成${title}：

    **基础参数：**
    - 画风风格: ${artStyle || "未指定"}

    **${cfg.label}设定：**
    - 名称:${name},
    - 提示词:${prompt},

    ${ending}
  `;
}

const requestSchema = {
  projectId: z.number(),
  model: z.string().trim().min(1),
  resolution: z.string().trim().min(1),
  aspectRatio: z.string().regex(/^\d{1,2}:\d{1,2}$/).optional(),
  composition: z.enum(["default", "single", "four-view", "prompt"]).optional(),
  // 不替换当前定稿；新图进入该资产的历史候选，用户稍后选择采用。
  candidateOnly: z.boolean().optional(),
  concurrentCount: z.number().int().min(1).max(6).optional(),
  items: z.array(
    z.object({
      id: z.number(),
      type: z.enum(["role", "scene", "tool"]),
      name: z.string(),
      prompt: z.string(),
      base64: z.string().optional().nullable(),
      model: z.string().trim().min(1).optional(),
      resolution: z.string().trim().min(1).optional(),
      aspectRatio: z.string().regex(/^\d{1,2}:\d{1,2}$/).optional(),
      composition: z.enum(["default", "single", "four-view", "prompt"]).optional(),
    }),
  ).min(1).max(100),
};

export default router.post("/", validateFields(requestSchema), async (req, res) => {
  const userId = (req as any).user?.id;
  const { projectId, model, resolution, aspectRatio, composition, candidateOnly, concurrentCount, items } = req.body;

  // 防止同一资产重复排队，避免重复计费和最后完成者覆盖前一个任务。
  if (new Set(items.map((item: { id: number }) => item.id)).size !== items.length) {
    return res.status(400).send(error("批次中包含重复资产，请检查后重试"));
  }

  // 检查积分（每个资产扣一次）
  if (userId) {
    const required = await getActionPoints("image_generate");
    const total = required * items.length;
    if (total > 0) {
      const balance = await getUserPoints(userId);
      if (balance < total) {
        return res.status(400).send(error(`积分不足，需要 ${total} 积分，当前余额 ${balance}`));
      }
    }
  }

  // 0. 出图前置闸门：任一选中项没有可用提示词就整批拦下（不插占位、不扣积分、不浪费额度）
  const notReady = (items as Array<{ name: string; prompt: string }>).filter(
    (item) => !String(item.prompt ?? "").trim() || !isUsablePrompt(item.prompt),
  );
  if (notReady.length) {
    return res.status(400).send(
      error(`以下资产还没有可用提示词，已阻止出图：${notReady.map((item) => item.name).join("、")}。请先生成提示词。`),
    );
  }

  // 1. 查询项目
  const project = await u.db("o_project").where("id", projectId).select("artStyle", "type", "intro").first();
  if (!project) return res.status(404).send(error("项目不存在"));

  // 资源归属由统一 resourceScope 校验；此处再检查资产的真实类型，不能由请求伪造。
  const assets = await u.db("o_assets").where("projectId", projectId).whereIn("id", items.map((item: { id: number }) => item.id)).select("id", "type");
  const assetTypes = new Map(assets.map((asset) => [Number(asset.id), asset.type]));
  if (items.some((item: { id: number; type: string }) => assetTypes.get(item.id) !== item.type)) {
    return res.status(400).send(error("资产类型与当前项目中的记录不一致，请刷新后重试"));
  }

  // 2. 逐条插入 o_image 占位记录，收集 imageId 列表
  const totalNovelId = await createBatchImagePlaceholders(u.db, projectId, items, !!candidateOnly);

  // 3. 后台异步并发生成，不阻塞响应
  const limit = pLimit(concurrentCount ?? 1);

  const tasks = items.map((item: { id: number; type: string; name: string; prompt: string; base64?: string | null; model?: string; resolution?: string; aspectRatio?: string; composition?: Composition }, index: number) =>
    limit(async () => {
      const imageId = totalNovelId[index];
      const data = await u.db("o_image").where("id", imageId).select("state").first();
      if (data?.state === "生成失败") {
        return;
      }
      const cfg = assetTypeConfig[item.type as AssetType];
      const itemModel = item.model || model;
      const itemResolution = item.resolution || resolution;
      const itemAspectRatio = (item.aspectRatio || aspectRatio || "16:9") as `${number}:${number}`;

      const imagePath = `/${projectId}/${cfg.dir}/${uuidv4()}.jpg`;
      const userPrompt = buildPrompt(cfg, project.artStyle ?? "", item.name, item.prompt, item.composition || composition || "default");
      const describe = `生成${cfg.label}图，名称：${item.name}，提示词：${item.prompt}`;
      const relatedObjects = { id: item.id, projectId, type: cfg.label };
      try {
        const aiImage = u.Ai.Image(itemModel);
        await aiImage.run(
          {
            prompt: userPrompt,
            referenceList: item.base64 ? [{ base64: item.base64, type: "image" }] : [],
            size: itemResolution,
            aspectRatio: itemAspectRatio,
          },
          {
            taskClass: cfg.taskClass,
            describe,
            projectId,
            relatedObjects: JSON.stringify(relatedObjects),
          },
        );
        await aiImage.save(imagePath);

        const imageData = await u.db("o_image").where("id", imageId).select("*").first();
        if (!imageData) return;
        if (imageData.state === "生成失败") return;
        await u
          .db("o_image")
          .where("id", imageId)
          .update({
            state: "已完成",
            filePath: imagePath,
            type: item.type,
            model: itemModel.split(/:(.+)/)[1] || itemModel,
            resolution: itemResolution,
          });

      } catch (e: any) {
        await u
          .db("o_image")
          .where("id", imageId)
          .update({ state: "生成失败", errorReason: u.error(e).message });
      }
    }),
  );

  // 后台执行，不等待结果
  Promise.all(tasks).catch(() => {});

  // 扣除积分（每个资产扣一次）
  let pointsDeducted = 0;
  let balance = 0;
  if (userId) {
    const required = await getActionPoints("image_generate");
    if (required > 0) {
      for (let i = 0; i < items.length; i++) {
        await deductPoints(userId, "image_generate", "批量生成图片素材");
      }
      pointsDeducted = required * items.length;
      balance = await getUserPoints(userId);
    }
  }

  return res.status(200).send(success({ total: items.length, pointsDeducted, balance, candidateOnly: !!candidateOnly,
    images: items.map((item: { id: number }, index: number) => ({ assetsId: item.id, imageId: totalNovelId[index] })) }));
});
