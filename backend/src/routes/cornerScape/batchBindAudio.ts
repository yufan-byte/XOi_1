import express from "express";
import { resolveTextModelKey } from "@/utils/textModel";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { tool, jsonSchema } from "ai";
const router = express.Router();

// 获取资产
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    assetsIds: z.array(z.number()),
    concurrentCount: z.number().int().min(1).max(10).optional(),
  }),
  async (req, res) => {
    const { projectId, assetsIds, concurrentCount } = req.body;
    const audioData = await u
      .db("o_assets")
      .where("type", "audio")
      .whereNull("assetsId")
      .andWhere("projectId", projectId)
      .select("id", "name", "describe");

    const { assetsData, queuedIds, skippedBoundIds, skippedNonRoleIds, skippedBusyIds } = await u.db.transaction(async trx => {
      const selectedAssets = await trx("o_assets").whereIn("id", assetsIds).andWhere("projectId", projectId).orderBy("id").forUpdate().select("id", "name", "describe", "type", "audioBindState");
      const existing = await trx("o_assetsRole2Audio").whereIn("assetsRoleId", selectedAssets.map(a => a.id)).select("assetsRoleId");
      const boundIds = new Set(existing.map(row => Number(row.assetsRoleId)));
      const assetsData = selectedAssets.filter(a => a.type === "role" && !boundIds.has(Number(a.id)) && a.audioBindState !== "生成中");
      const skippedBoundIds = selectedAssets.filter(a => a.type === "role" && boundIds.has(Number(a.id))).map(a => Number(a.id));
      const skippedNonRoleIds = selectedAssets.filter(a => a.type !== "role").map(a => Number(a.id));
      const skippedBusyIds = selectedAssets.filter(a => a.type === "role" && !boundIds.has(Number(a.id)) && a.audioBindState === "生成中").map(a => Number(a.id));
      const queuedIds = assetsData.map(a => Number(a.id));
      if (queuedIds.length && audioData.length) await trx("o_assets").whereIn("id", queuedIds).update("audioBindState", "生成中");
      return { assetsData, queuedIds, skippedBoundIds, skippedNonRoleIds, skippedBusyIds };
    });
    if (!queuedIds.length) return res.status(200).send(success({ queuedIds, skippedBoundIds, skippedNonRoleIds, skippedBusyIds }));
    if (!audioData.length) return res.status(400).send(error("暂无设置音频，请先前往资产中心上传音频"));

    const batchSize = concurrentCount ?? 1;

    async function processAsset(asset: (typeof assetsData)[number]) {
      let submitted = false;
      try {
        const resultTool = tool({
          description: "匹配完成后必须调用此工具提交结果",
          inputSchema: jsonSchema<{ id: number; audioId: number }>(
            z
              .object({
                audioId: z.number().nullable().optional().describe("合适的音频 ID；无合适音频时返回 null"),
              })
              .toJSONSchema(),
          ),
          execute: async (result) => {
            if (submitted) return "已经提交结果";
            submitted = true;
            // 人工选择和批量匹配共享同一资产行锁，等待期间用户的新选择始终优先。
            await u.db.transaction(async trx => {
              const current = await trx("o_assets").where({ id: asset.id, projectId, type: "role" }).forUpdate().first("id", "audioBindState");
              if (!current || current.audioBindState !== "生成中") return;
              const existingBinding = await trx("o_assetsRole2Audio").where("assetsRoleId", asset.id).first("assetsAudioId");
              const audioId = Number(result?.audioId);
              if (!existingBinding && audioData.some(audio => Number(audio.id) === audioId)) {
                await trx("o_assetsRole2Audio").insert({ assetsRoleId: asset.id, assetsAudioId: audioId });
              }
              await trx("o_assets").where("id", asset.id).update("audioBindState", existingBinding || audioData.some(audio => Number(audio.id) === audioId) ? "已完成" : "生成失败");
            });
            return "无需回复用户任何内容";
          },
        });

        const audioList = audioData.map((i) => `- ID:${i.id} | 名称:${i.name} | 描述:${i.describe ?? "无"}`).join("\n");
        const promptData = await u.db("o_prompt").where("type", "audioBindPrompt").first();
        let audioBindPrompt = "" as string | undefined;
        if (promptData && promptData.useData) {
          audioBindPrompt = promptData.useData;
        } else {
          audioBindPrompt = promptData?.data ?? undefined;
        }
        await u.Ai.Text(await resolveTextModelKey({ projectId })).invoke({
          messages: [
            {
              role: "system",
              content: `
              ${audioBindPrompt}
              `,
            },
            {
              role: "user",
              content: `
                ## 候选音频列表
                ${audioList}
                ## 待匹配资产
                - ID:${asset.id} | 名称:${asset.name} | 描述:${asset.describe ?? "无"} | 类型：${asset.type}
                请从候选音频列表中为该资产选出来一个最符合该角色设定的音色，并调用 resultTool 提交结果。
           `,
            },
          ],
          tools: { resultTool },
        });
        if (!submitted) await u.db("o_assets").where({ id: asset.id, audioBindState: "生成中" }).update("audioBindState", "生成失败");
      } catch (e) {
        await u.db("o_assets").where({ id: asset.id, audioBindState: "生成中" }).update("audioBindState", "生成失败");
        console.error(`[bindAudio] 资产 ${asset.id} 处理失败:`, e);
      }
    }

    async function runWithConcurrency() {
      for (let i = 0; i < assetsData.length; i += batchSize) {
        const batch = assetsData.slice(i, i + batchSize);

        await Promise.all(batch.map((asset) => processAsset(asset)));
      }
    }
    void runWithConcurrency().catch(e => console.error("[bindAudio] 批量匹配异常:", e));
    res.status(200).send(success({ queuedIds, skippedBoundIds, skippedNonRoleIds, skippedBusyIds }));
  },
);
