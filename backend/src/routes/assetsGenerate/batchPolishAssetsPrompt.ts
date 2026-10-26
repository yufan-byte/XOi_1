import express from "express";
import u from "@/utils";
import pLimit from "p-limit";
import * as zod from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";
import { resolveTextModelKey } from "@/utils/textModel";
import { promptRejectionReason } from "@/utils/promptQuality";
const router = express.Router();
interface OutlineItem {
  description: string;
  name: string;
}

interface OutlineData {
  chapterRange: number[];
  characters?: OutlineItem[];
  props?: OutlineItem[];
  scenes?: OutlineItem[];
}

interface NovelChapter {
  id: number;
  reel: string;
  chapter: string;
  chapterData: string;
  projectId: number;
}

type ItemType = "characters" | "props" | "scenes";

//润色提示词
export default router.post(
  "/",
  validateFields({
    items: zod.array(
      zod.object({
        assetsId: zod.number(),
        type: zod.string(),
        name: zod.string(),
        describe: zod.string(),
      }),
    ),
    projectId: zod.number(),
    concurrentCount: zod.number().int().min(1).optional(),
    otherTextPrompt: zod.string(),
    textModel: zod.string().optional(),
  }),
  async (req, res) => {
    const userId = (req as any).user?.id;
    const { projectId, items, concurrentCount, otherTextPrompt, textModel } = req.body;

    // 检查积分（每个资产扣一次）
    if (userId) {
      const required = await getActionPoints("text_generate");
      const total = required * items.length;
      if (total > 0) {
        const balance = await getUserPoints(userId);
        if (balance < total) {
          return res.status(400).send(error(`积分不足，需要 ${total} 积分，当前余额 ${balance}`));
        }
      }
    }
    //获取风格
    const project = await u.db("o_project").where("id", projectId).select("artStyle", "type", "intro", "textModel").first();
    //如果没有找到对应的项目，返回错误
    if (!project) return res.status(500).send(success({ message: "项目为空" }));

    // 文本模型：面板本次选择 > 项目配置 > 系统默认 > 账号可用 DeepSeek（universalAi 已退役）
    const pickedModel = String(textModel || "").trim();
    const projectModel = String((project as any).textModel || "").trim();
    const aiKey = await resolveTextModelKey({ projectId, override: pickedModel || projectModel });

    // 预加载公共数据
    const assetsIds = items.map((item: { assetsId: number }) => item.assetsId);
    //查询所有资产，用于判断每个资产是否是衍生资产
    const assetsDataList = await u.db("o_assets").whereIn("id", assetsIds).select("id", "assetsId");
    if (!assetsDataList || assetsDataList.length === 0) return res.status(500).send(error("资产不存在"));
    const assetsDataMap = new Map(assetsDataList.map((a: any) => [a.id, a]));
    // 所有前置检测通过后，再批量更新状态为生成中
    await u.db("o_assets").whereIn("id", assetsIds).update({ promptState: "生成中" });

    const getTypeConfig = (
      isDerivative: boolean,
    ): Record<string, { promptKey: string; itemType: ItemType; label: string; nameLabel: string; visualManual: string }> => ({
      role: {
        promptKey: "role-polish",
        itemType: "characters",
        label: "角色标准四视图",
        nameLabel: "角色",
        visualManual: isDerivative ? "art_character_derivative" : "art_character",
      },
      scene: {
        promptKey: "scene-polish",
        itemType: "scenes",
        label: "场景图",
        nameLabel: "场景",
        visualManual: isDerivative ? "art_scene_derivative" : "art_scene",
      },
      tool: {
        promptKey: "tool-polish",
        itemType: "props",
        label: "道具图",
        nameLabel: "道具",
        visualManual: isDerivative ? "art_prop_derivative" : "art_prop",
      },
    });

    // 后台异步并发生成，不阻塞响应
    const limit = pLimit(concurrentCount ?? 1);
    const tasks = items.map((item: { assetsId: number; type: string; name: string; describe: string }) =>
      limit(async () => {
        // 任何提前返回 / 异常都必须落到终态，否则前端会永远停在"生成中"
        let settled = false;
        const fail = async (reason: string) => {
          if (settled) return;
          settled = true;
          await u
            .db("o_assets")
            .where("id", item.assetsId)
            .update({ promptState: "失败", promptErrorReason: reason })
            .catch(() => {});
        };
        try {
          const assetData = assetsDataMap.get(item.assetsId);
          if (!assetData) return await fail("资产不存在");
          const typeConfig = getTypeConfig(!!assetData.assetsId);
          const config = typeConfig[item.type];
          if (!config) return await fail("未知资产类型，无法生成提示词");
          //获取到视觉手册
          const visualManual = await u.getArtPrompt(project.artStyle as string, "art_skills", config.visualManual);
          if (!visualManual) return await fail("视觉手册未定义");

          const { _output } = (await u.Ai.Text(aiKey).invoke({
            system:
              visualManual +
              "\n" +
              otherTextPrompt +
              "\n\n【硬性要求】即使素材设定与全局风格约束存在冲突，也必须按项目既定的画风/年代/质感改写后直接输出可出图的画面提示词；禁止用\"无法生成\"、\"违反规则\"之类的话拒答，禁止输出解释说明或免责声明。只输出提示词正文。",
            messages: [
              {
                role: "user",
                content: `
                    **基础参数：**
      **${config.nameLabel}设定：**
      - ${config.nameLabel}名称:${item.name},
      - ${config.nameLabel}描述:${item.describe},`,
              },
            ],
          })) as any;

          const rejected = promptRejectionReason(_output);
          if (rejected) return await fail(rejected);

          await u.db("o_assets").where("id", item.assetsId).update({ prompt: _output, promptState: "已完成", promptErrorReason: null });
          settled = true;
        } catch (e: any) {
          await fail(u.error(e).message);
        }
      }),
    );

    // 后台执行，不等待结果；收尾时兜底把任何残留的"生成中"落成失败态
    Promise.all(tasks)
      .catch((err: any) => console.error("[batchPolishAssetsPrompt] 批量任务异常:", u.error(err).message))
      .finally(async () => {
        await u
          .db("o_assets")
          .whereIn("id", assetsIds)
          .where("promptState", "生成中")
          .update({ promptState: "失败", promptErrorReason: "任务异常中断，请重新生成" })
          .catch(() => {});
      });

    // 扣除积分（每个资产扣一次）
    let pointsDeducted = 0;
    let balance = 0;
    if (userId) {
      const required = await getActionPoints("text_generate");
      if (required > 0) {
        for (let i = 0; i < items.length; i++) {
          await deductPoints(userId, "text_generate", "批量优化提示词");
        }
        pointsDeducted = required * items.length;
        balance = await getUserPoints(userId);
      }
    }

    return res.status(200).send(success({ total: items.length, pointsDeducted, balance }));
  },
);
