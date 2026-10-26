import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();
import { saveDirectorDocument } from "@/utils/directorDocument";
import { error } from "@/lib/responseFormat";
import { flowDataSchema } from "@/agents/productionAgent/tools";

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    episodesId: z.number(),
    data: z.any(),
    documentEdit: z.object({ stage: z.enum(["scriptPlan", "storyboardTable"]), content: z.string().max(1000000), expectedContent: z.string(), expectedPlan: z.string(), expectedScript: z.string() }).optional(),
  }),
  async (req, res) => {
    const {
      data,
      projectId,
      episodesId,
    }: {
      data: z.infer<typeof flowDataSchema>;
      projectId: number;
      episodesId: number;
    } = req.body;
    if (req.body.documentEdit) {
      const result = await saveDirectorDocument(u.db, Number((req as any).user.id), projectId, episodesId, req.body.documentEdit);
      if (result.message) return res.status(409).send(error(result.message));
      return res.json(success(result.state));
    }
    await u.db.transaction(async trx => {
    const project = await trx('o_project').where({ id: projectId, userId: Number((req as any).user.id) }).forUpdate().first();
    if (!project || !await trx('o_script').where({ id: episodesId, projectId }).first()) throw new Error('无权保存此剧集');
    const sqlData = await trx("o_agentWorkData").where("projectId", String(projectId)).where('key', 'productionAgent').andWhere("episodesId", String(episodesId)).first();
    // Approval records can only be created by the explicit review endpoint.
    const stored = sqlData?.data ? JSON.parse(sqlData.data) : {};
    delete (data as any).reviewState;
    (data as any).stageReviews = stored.stageReviews || {};
    // Plans are assistant-authored, human-reviewed. Never trust client XML or stale layout snapshots as their source.
    data.scriptPlan = stored.scriptPlan || '';
    data.storyboardTable = stored.storyboardTable || '';
    (data as any).assistantDraft = stored.assistantDraft;
    if (data.storyboard && data.storyboard.length) {
      const filterDatas = data?.storyboard.filter((i) => !i.id);
      if (!filterDatas.length) {
        try {
          await Promise.all(
            data.storyboard
              .filter((i) => i.id)
              .map(async (i, index) => {
                await trx("o_storyboard").where("id", i.id).where({ projectId, scriptId: episodesId }).update({
                  index: index,
                });
              }),
          );
        } catch (error) {
          console.error("更新分镜排序失败", error);
        }
      }
    }

    if (!sqlData) {
      await trx("o_agentWorkData").insert({
        projectId,
        episodesId,
        key: "productionAgent",
        data: JSON.stringify(data),
      });
    } else {
      await trx("o_agentWorkData")
        .where("projectId", String(projectId))
        .where("key", "productionAgent")
        .andWhere("episodesId", String(episodesId))
        .update({
          data: JSON.stringify(data),
        });
    }
    });
    return res.status(200).send(success());
  },
);
