import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { useSkill } from "@/utils/agent/skillsTools";
import { tool, jsonSchema } from "ai";
import { o_script } from "@/types/database";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";
import { normalizeAssetExtraction } from "@/utils/assetExtractionResult";
import { db } from "@/utils/db";
import { resolveTextModelKey } from "@/utils/textModel";

const router = express.Router();

/** 新资产：AI 首次识别到的资产，需要完整信息 */
const NewAssetSchema = z.object({
  name: z.string().describe("资产名称,仅为名称不做其他任何表述"),
  desc: z.string().describe("资产描述"),
  type: z.enum(["role", "tool", "scene"]).describe("资产类型"),
  scriptIds: z.array(z.number()).describe("使用该资产的剧本id数组"),
});

/** 已有资产：数据库中已存在的资产，只需给出名称和关联的剧本 */
const ExistingAssetRefSchema = z.object({
  name: z.string().describe("已有资产的名称,必须与已有资产列表中的名称完全一致"),
  scriptIds: z.array(z.number()).describe("使用该资产的剧本id数组"),
});

export const AssetSchema = z.object({
  name: z.string().describe("资产名称,仅为名称不做其他任何表述"),
  desc: z.string().describe("资产描述"),
  type: z.enum(["role", "tool", "scene"]).describe("资产类型"),
});

type NewAsset = z.infer<typeof NewAssetSchema>;
type ExistingAssetRef = z.infer<typeof ExistingAssetRefSchema>;
type Asset = z.infer<typeof AssetSchema>;

/** 每批 AI 调用的结果 */
type GroupResult = {
  batchScriptIds: number[];
  newAssets: NewAsset[];
  existingRefs: ExistingAssetRef[];
} | null;

/** 单批拼给模型的剧本总字数上限：中文约 1 字 ≈ 1 token，40k 字对 DeepSeek 等 64K 上下文模型留足系统提示与输出余量 */
const MAX_BATCH_CHARS = 40000;
/** 单集剧本超过该字数直接拒绝（必然超出常见模型上下文），提前失败并写明原因，不做无意义调用 */
const MAX_SCRIPT_CHARS = 120000;

/**
 * 长文本校验 + 分批打包：groupSize（每批最多几集）与总字数双上限。
 * - 普通剧本：塞满 groupSize 集或 MAX_BATCH_CHARS 字即成一批，超长自动细分，单批输入不会悄悄越过模型上下文；
 * - 单集超过 MAX_SCRIPT_CHARS：无法再拆，直接标记失败，调用方在剧本列表能看到原因。
 */
function packScriptBatches(
  scriptIds: number[],
  scriptMap: Map<number, o_script>,
  groupSize: number,
): { batches: number[][]; oversized: { scriptId: number; chars: number }[] } {
  const batches: number[][] = [];
  const oversized: { scriptId: number; chars: number }[] = [];
  let current: number[] = [];
  let currentChars = 0;
  for (const id of scriptIds) {
    const chars = (scriptMap.get(id)?.content?.length || 0) + 40; // 40 ≈ 每集分隔标记的开销
    if (chars > MAX_SCRIPT_CHARS) {
      oversized.push({ scriptId: id, chars });
      continue;
    }
    if (current.length && (current.length >= Math.max(1, groupSize) || currentChars + chars > MAX_BATCH_CHARS)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(id);
    currentChars += chars;
  }
  if (current.length) batches.push(current);
  return { batches, oversized };
}

export default router.post(
  "/",
  validateFields({
    scriptIds: z.array(z.number()),
    projectId: z.number(),
    groupSize: z.number().min(1).optional(),
  }),
  async (req, res) => {
    const { scriptIds, projectId, groupSize = 5 } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).send(error("未登录"));

    // 验证项目属于当前用户
    const project = await u.db("o_project").where("id", projectId).where("userId", userId).first();
    if (!project) return res.status(403).send(error("无权操作此项目"));

    if (!scriptIds.length) return res.status(400).send(error("请先选择剧本"));

    const scripts = await u.db("o_script").where("projectId", projectId).whereIn("id", scriptIds);
    if (scripts.length !== new Set(scriptIds).size) return res.status(400).send(error("所选剧本不存在或不属于当前项目"));

    // 构建 scriptId -> script 内容的映射
    const scriptMap = new Map(scripts.map((s: o_script) => [s.id, s]));

    // 长文本校验 + 分批（先于积分/状态写入，超长的直接拒绝）
    const { batches, oversized } = packScriptBatches(scriptIds as number[], scriptMap, groupSize);
    const errors: { scriptId: number; error: string }[] = [];
    let successCount = 0;
    for (const { scriptId, chars } of oversized) {
      errors.push({ scriptId, error: `剧本约 ${chars} 字，超过单集 12 万字上限` });
      await u.db("o_script").where("id", scriptId).where("projectId", projectId).update({
        extractState: -1,
        errorReason: `剧本约 ${chars} 字，超出单次提取上限（约 12 万字），请先拆分剧本再提取`,
      });
    }
    if (!batches.length) {
      return res.status(400).send(error(oversized.length ? "所选剧本均超出单次提取上限，请先拆分剧本再提取" : "请先选择剧本"));
    }

    // 仅把实际参与提取的剧本置为"等待提取"；超长剧本保持失败态与原因
    const batchIds = batches.flat();
    await u.db("o_script").whereIn("id", batchIds).update({
      extractState: 2,
    });

    // 检查积分（按实际批次数扣）
    const totalGroups = batches.length;
    if (userId) {
      const required = await getActionPoints("text_generate");
      const total = required * totalGroups;
      if (total > 0) {
        const balance = await getUserPoints(userId);
        if (balance < total) {
          return res.status(400).send(error(`积分不足，需要 ${total} 积分，当前余额 ${balance}`));
        }
      }
    }

    // 扣除积分（按实际批次数扣）
    let pointsDeducted = 0;
    let balance = 0;
    if (userId) {
      const required = await getActionPoints("text_generate");
      if (required > 0) {
        for (let i = 0; i < totalGroups; i++) {
          await deductPoints(userId, "text_generate", "提取素材");
        }
        pointsDeducted = required * totalGroups;
        balance = await getUserPoints(userId);
      }
    }

    // 外层分组只控制并发节奏：每 outerSize 批并行跑
    const scriptGroups: number[][][] = [];
    const outerSize = Math.max(1, groupSize);
    for (let i = 0; i < batches.length; i += outerSize) {
      scriptGroups.push(batches.slice(i, i + outerSize));
    }

    /** 一组剧本提取完成后统一入库并建立关联 */
    async function persistGroupResult(result: GroupResult) {
      if (!result) return;
      const { batchScriptIds, newAssets, existingRefs } = result;
      if (!newAssets.length && !existingRefs.length) return;
      normalizeAssetExtraction({newAssets,existingAssetRefs:existingRefs},batchScriptIds);
      await db.transaction(async (trx) => {
      await trx("o_project").where("id",projectId).forUpdate().first();

      // 查询已有资产
      const existingAssets = await trx("o_assets").where("projectId", projectId).select("id", "name");
      const existingMap = new Map(existingAssets.map((a) => [a.name!, a.id!]));

      // 插入新资产（不在已有列表中的）
      const toInsert = newAssets.filter((asset) => !existingMap.has(asset.name));
      if (toInsert.length) {
        await trx("o_assets").insert(
          toInsert.map((asset) => ({
            name: asset.name,
            type: asset.type,
            describe: asset.desc,
            projectId: projectId,
            startTime: Date.now(),
          })),
        );
      }

      // 重新查询获取完整的 name -> id 映射
      const allAssets = await trx("o_assets").where("projectId", projectId).select("id", "name");
      const nameToId = new Map(allAssets.map((a) => [a.name, a.id]));

      // 收集所有资产与剧本的关联关系
      const scriptAssetRows: { scriptId: number; assetId: number }[] = [];

      // 新资产的关联
      for (const asset of newAssets) {
        const assetId = nameToId.get(asset.name);
        if (assetId) {
          for (const sid of asset.scriptIds) {
            scriptAssetRows.push({ scriptId: sid, assetId });
          }
        }
      }

      // 已有资产的关联
      for (const ref of existingRefs) {
        const assetId = nameToId.get(ref.name);
        if (assetId) {
          for (const sid of ref.scriptIds) {
            scriptAssetRows.push({ scriptId: sid, assetId });
          }
        }
      }

      // 去重：相同 scriptId + assetId 只保留一条
      const uniqueRows = [...new Map(scriptAssetRows.map((r) => [`${r.scriptId}_${r.assetId}`, r])).values()];

      // 先删除本批 scriptId 的旧关联，再插入新的
      await trx("o_scriptAssets").whereIn("scriptId", batchScriptIds).delete();
      if (uniqueRows.length) {
        await trx("o_scriptAssets").insert(uniqueRows);
      }

      // 本批成功的剧本状态更新为 1（成功）
      await trx("o_script").whereIn("id", batchScriptIds).where("projectId", projectId).update({
        extractState: 1,
        errorReason: null,
      });
      });
    }
    res.send(success("开始提取资产"));

    function processGroup(group: number[][][]) {
      group.map(async (itemIds) => {
        const validScripts: { id: number; script: o_script }[] = [];
        for (const scriptIds of itemIds as number[][]) {
          for (const scriptId of scriptIds) {
            const script = scriptMap.get(scriptId);
            if (!script) {
              errors.push({ scriptId, error: "未找到对应剧本" });
              await u.db("o_script").where("id", scriptId).where("projectId", projectId).update({ extractState: -1, errorReason: "未找到对应剧本" });
            } else {
              // 查看状态是否为等待提取，仅对等待提取进行生成
              const item = await u.db("o_script").where("projectId", projectId).where("id", scriptId).select("extractState").first();
              if (item?.extractState == 2) {
                validScripts.push({ id: scriptId, script });
              }
            }
          }
        }
        if (!validScripts.length) return;
        const validScriptIds = validScripts.map((v) => v.id);
        // 修改状态为正在提取中
        await u.db("o_script").where("projectId", projectId).whereIn("id", validScriptIds).update({
          extractState: 0, // 正在提取
        });
        // 查询当前项目已有的资产列表，提供给 AI 参考
        const existingAssets = await u.db("o_assets").where("projectId", projectId).select("name", "type");
        const existingAssetsList = existingAssets.map((a) => `${a.name}(${a.type})`).join("、");

        // 拼接多集剧本内容，每集用分隔标记
        const scriptsContent = validScripts
          .map(({ id, script }) => `===== 【剧本ID: ${id}】${script.name || ""} =====\n${script.content}`)
          .join("\n\n");

        let collectedNew: NewAsset[] = [];
        let collectedExisting: ExistingAssetRef[] = [];
        try {
          const resultTool = tool({
            description: "返回结果时必须调用这个工具",
            inputSchema: jsonSchema<{ newAssets: NewAsset[]; existingAssetRefs: ExistingAssetRef[] }>(
              z
                .object({
                  newAssets: z
                    .array(NewAssetSchema)
                    .describe("新发现的资产列表（不在已有资产列表中的），需要完整的 prompt、name、desc、type 和使用该资产的 scriptIds"),
                  existingAssetRefs: z
                    .array(ExistingAssetRefSchema)
                    .describe("已有资产的引用列表（在已有资产列表中已存在的），只需给出资产名称和使用该资产的 scriptIds"),
                })
                .toJSONSchema(),
            ),
            execute: async (value) => {
              const cleaned = normalizeAssetExtraction(value,validScriptIds);
              if (cleaned.newAssets.length) collectedNew = cleaned.newAssets;
              if (cleaned.existingAssetRefs.length) collectedExisting = cleaned.existingAssetRefs;
              return "无需回复用户任何内容";
            },
          });
          const promptData = await u.db("o_prompt").where("type", "scriptAssetExtraction").first();
          let scriptAssetExtraction = "" as string | undefined;
          if (promptData && promptData.useData) {
            scriptAssetExtraction = promptData.useData;
          } else {
            scriptAssetExtraction = promptData?.data ?? undefined;
          }
          const existingHint = existingAssetsList
            ? `\n\n【已有资产列表】：${existingAssetsList}\n对于已有资产，如果在剧本中出现，只需在 existingAssetRefs 中给出资产名称和对应的 scriptIds 数组即可，无需重复生成 desc/type。对于新发现的资产（不在已有列表中），请在 newAssets 中给出完整信息。`
            : "";
          // 文本模型：项目配置 > 系统默认 > 账号可用 DeepSeek（universalAi 已退役）
          const savedTextModel = String((project as any).textModel || "");
          const textModel = await resolveTextModelKey({ projectId, override: savedTextModel });
          const output = await u.Ai.Text(textModel).invoke({
            messages: [
              {
                role: "system",
                content:
                  scriptAssetExtraction +
                  "\n\n提取剧本中涉及的资产（角色、场景、道具），参考技能 script_assets_extract 规范，结果必须通过 resultTool 工具返回。" +
                  "\n\n注意：本次会同时提供多集剧本，每集剧本以 ===== 【剧本ID: xxx】 ===== 分隔。你需要分析每集剧本使用了哪些资产，并在输出中用 scriptIds 数组标明每个资产在哪些剧本中出现。",
              },
              {
                role: "user",
                content: `当前已有资产列表：${existingHint}\n\n请根据以下${validScripts.length}集剧本提取对应的剧本资产（角色、场景、道具）:\n\n${scriptsContent}`,
              },
            ],
            tools: { resultTool },
          });
          await persistGroupResult({
            batchScriptIds: validScriptIds,
            newAssets: collectedNew,
            existingRefs: collectedExisting,
          });
        } catch (e) {
          console.error(`[extractAssets] group=[${validScriptIds.join(",")}] 提取失败:`, e);
          for (const { id, script } of validScripts) {
            errors.push({ scriptId: id, error: (script.name || "") + ":" + u.error(e).message });
            await u
              .db("o_script")
              .where("id", id)
              .where("projectId", projectId)
              .update({ extractState: -1, errorReason: u.error(e).message });
          }
          return;
        }
        if (!collectedNew.length && !collectedExisting.length) {
          for (const { id } of validScripts) {
            errors.push({ scriptId: id, error: "AI 未返回任何资产" });
            await u.db("o_script").where("id", id).where("projectId", projectId).update({ extractState: -1, errorReason: "AI 未返回任何资产" });
          }
          return;
        }
      });
    }
    processGroup(scriptGroups);
  },
);
