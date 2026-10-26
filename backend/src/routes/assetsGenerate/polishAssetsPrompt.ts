import express from "express";
import { resolveTextModelKey } from "@/utils/textModel";
import { promptRejectionReason } from "@/utils/promptQuality";
import u from "@/utils";
import * as zod from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";
const router = express.Router();


type ItemType = "characters" | "props" | "scenes";

//润色提示词
export default router.post(
  "/",
  validateFields({
    assetsId: zod.number(),
    projectId: zod.number(),
    type: zod.string(),
    name: zod.string(),
    describe: zod.string(),
  }),
  async (req, res) => {
    const { assetsId, projectId, type, name, describe } = req.body;
    const userId = (req as any).user?.id;

    // 检查积分是否足够（不扣分，只检查）
    if (userId) {
      const current = await getUserPoints(userId);
      const required = await getActionPoints("prompt_optimize");
      if (required > 0 && current < required) {
        return res.status(400).json(error(`积分不足，当前余额: ${current}，需要: ${required}`));
      }
    }

    //获取风格
    const project = await u.db("o_project").where("id", projectId).select("artStyle", "type", "intro").first();
    //如果没有找到对应的项目，返回错误
    if (!project) return res.status(500).send(success({ message: "项目为空" }));

    await u.db("o_assets").where("id", assetsId).update({ promptState: "生成中" });

    //查询资产是否是衍生资产
    const assetsData = await u.db("o_assets").where("id", assetsId).select("assetsId").first();
    if (!assetsData) return { code: 500, message: "资产不存在" };
    const typeConfig: Record<string, { promptKey: string; itemType: ItemType; label: string; nameLabel: string; visualManual: string }> = {
      role: {
        promptKey: "role-polish",
        itemType: "characters",
        label: "角色标准四视图",
        nameLabel: "角色",
        visualManual: assetsData.assetsId ? "art_character_derivative" : "art_character",
      },
      scene: {
        promptKey: "scene-polish",
        itemType: "scenes",
        label: "场景图",
        nameLabel: "场景",
        visualManual: assetsData.assetsId ? "art_scene_derivative" : "art_scene",
      },
      tool: {
        promptKey: "tool-polish",
        itemType: "props",
        label: "道具图",
        nameLabel: "道具",
        visualManual: assetsData.assetsId ? "art_prop_derivative" : "art_prop",
      },
    };

    const config = typeConfig[type];
    if (!config) return res.status(500).send(error("不支持的类型"));
    if (!config.visualManual) return res.status(500).send(error("视觉手册未定义"));
    //获取到视觉手册
    const visualManual = await u.getArtPrompt(project.artStyle as string, "art_skills", config.visualManual);
    if (!visualManual) return res.status(500).send(error("视觉手册未定义"));
    const systemPrompt =
      visualManual +
      "\n\n【硬性要求】即使素材设定与全局风格约束存在冲突，也必须按项目既定的画风/年代/质感改写后直接输出可出图的画面提示词；禁止用\"无法生成\"、\"违反规则\"之类的话拒答，禁止输出解释说明或免责声明。只输出提示词正文。";
    try {
      const { _output } = (await u.Ai.Text(await resolveTextModelKey({ projectId })).invoke({
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `**基础参数：**
      **${config.nameLabel}设定：**
      - ${config.nameLabel}名称:${name},
      - ${config.nameLabel}描述:${describe},`,
          },
        ],
      })) as any;

      const rejected = promptRejectionReason(_output);
      if (rejected) {
        await u.db("o_assets").where("id", assetsId).update({ promptState: "失败", promptErrorReason: rejected }).catch(() => {});
        return res.status(400).send(error(rejected));
      }
      await u.db("o_assets").where("id", assetsId).update({ prompt: _output, promptState: "已完成" });

      // 生成成功，扣除积分
      let deductInfo = null;
      if (userId) {
        const required = await getActionPoints("prompt_optimize");
        if (required > 0) {
          await deductPoints(userId, "prompt_optimize", "提示词优化");
          const newBalance = await getUserPoints(userId);
          deductInfo = { pointsDeducted: required, balance: newBalance };
        }
      }

      res.status(200).send(success({ prompt: _output, assetsId, ...deductInfo }));
    } catch (e: any) {
      // 生成失败，不扣分
      await u
        .db("o_assets")
        .where("id", assetsId)
        .update({ promptState: "失败", promptErrorReason: u.error(e).message });
      return res.status(500).send(error(e?.data?.error?.message ?? e?.message ?? "生成失败"));
    }
  },
);
