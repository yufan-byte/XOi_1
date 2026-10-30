import express from "express";
import { resolveTextModelKey } from "@/utils/textModel";
import { promptRejectionReason, normalizePromptOutput } from "@/utils/promptQuality";
import u from "@/utils";
import * as zod from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";
import { buildSkillContext, SkillContextError } from "@/utils/skillContext";
import { PROMPT_HARD_RULES, resolveAssetStyle } from "@/utils/assetStyleGuide";
import { friendlyTextModelError } from "@/utils/modelError";
const router = express.Router();


type ItemType = "characters" | "props" | "scenes";
const selectedSkillSchema = zod.union([
  zod.string(),
  zod.object({ path: zod.string(), category: zod.enum(["character", "scene", "prop", "general"]) }),
]);
const assetSkillCategory: Record<string, "character" | "scene" | "prop"> = { role: "character", scene: "scene", tool: "prop" };

//润色提示词
export default router.post(
  "/",
  validateFields({
    assetsId: zod.number(),
    projectId: zod.number(),
    type: zod.string(),
    name: zod.string(),
    describe: zod.string(),
    styleMode: zod.enum(["project", "custom", "free"]).optional(),
    styleDescription: zod.string().max(3000).optional(),
    /** 用户勾选的 Skill（相对 skills 根目录的 .md 路径） */
    skills: zod.array(selectedSkillSchema).max(8).optional(),
  }),
  async (req, res) => {
    const { assetsId, projectId, type, name, describe, skills, styleMode, styleDescription } = req.body;
    if (styleMode === "custom" && !String(styleDescription || "").trim()) return res.status(400).send(error("请填写自定义画风，或选择自由创作"));
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
    const styleBlock = await resolveAssetStyle({
      mode: styleMode,
      description: styleDescription,
      project: project as any,
      manualKey: config.visualManual,
      loadManual: async (artStyle, key) => u.getArtPrompt(artStyle, "art_skills", key),
    });
    const category = assetSkillCategory[type];
    let skillContext: string;
    try {
      skillContext = await buildSkillContext(skills, {
        userId: Number(userId) || null,
        category,
        header: "\n\n【本次生成启用的 Skills】请严格采用其中与当前资产相关的设计方法；不得把人物、场景、道具的规则互相串用：",
      });
    } catch (e) {
      if (e instanceof SkillContextError) return res.status(400).send(error(e.message));
      throw e;
    }
    await u.db("o_assets").where("id", assetsId).update({ promptState: "生成中" });
    const systemPrompt = [styleBlock, skillContext].filter(Boolean).join("\n") + PROMPT_HARD_RULES;
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
      // 技能输出常带 Markdown 标题/围栏，落库前收敛成纯提示词
      const promptText = normalizePromptOutput(_output);
      await u.db("o_assets").where("id", assetsId).update({ prompt: promptText, promptState: "已完成", promptErrorReason: null });

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

      res.status(200).send(success({ prompt: promptText, assetsId, ...deductInfo, warnings: [] }));
    } catch (e: any) {
      // 生成失败，不扣分（错误文案统一翻译成人话，别把 "Invalid JSON response" 丢给用户）
      const reason = friendlyTextModelError(e?.data?.error?.message ?? u.error(e).message ?? e?.message);
      await u.db("o_assets").where("id", assetsId).update({ promptState: "失败", promptErrorReason: reason });
      return res.status(500).send(error(reason));
    }
  },
);
