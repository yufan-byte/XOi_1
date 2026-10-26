import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { directorVideoProgress } from "@/utils/directorVideoProgress";
import { readStoryboards } from "@/utils/storyboardStore";
const router = express.Router();
import { FlowData } from "@/agents/productionAgent/tools";

/**
 * 当前集已归档的成片（前端浏览器合成后回传 saveOutput 写入 o_output）。
 * 挂在 flowData.output 上，供「成片」节点与进度带的第五段使用。
 * 不写进 FlowData 的 zod schema —— 那是 Agent 的工具契约，多一个 key 会污染提示词与工具枚举。
 */
async function loadOutputs(projectId: number, episodesId: number) {
  const rows = await u.db("o_output").where("projectId", projectId).andWhere("episodesId", episodesId).orderBy("createTime", "desc");
  return Promise.all(
    rows.map(async (o: any) => {
      let fileUrl = "";
      if (o.filePath) {
        try {
          fileUrl = await u.oss.getFileUrl(o.filePath);
        } catch {
          fileUrl = "";
        }
      }
      return {
        id: o.id,
        name: o.name ?? "",
        url: fileUrl,
        duration: o.duration ?? 0,
        size: o.size ?? 0,
        resolution: o.resolution ?? "",
        createTime: o.createTime ?? 0,
      };
    }),
  );
}

async function attachProgress(flowData: any, projectId: number, episodesId: number) {
  const { readDirectorReview } = await import('@/utils/directorStageReview');
  flowData.reviewState = (await readDirectorReview(u.db, projectId, episodesId)).state;
  const [outputs, tracks] = await Promise.all([
    loadOutputs(projectId, episodesId),
    u.db("o_videoTrack").where({ projectId, scriptId: episodesId }).select("id"),
  ]);
  const videos = tracks.length
    ? await u.db("o_video").whereIn("videoTrackId", tracks.map(track => track.id!)).select("videoTrackId", "state", "filePath")
    : [];
  const progress = directorVideoProgress(tracks as { id: number }[], videos);
  flowData.output = outputs;
  flowData.videoProgress = progress;
  for (const frame of flowData.storyboard ?? []) {
    frame.videoState = progress.trackStates[frame.trackId] ?? "未生成";
  }
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    episodesId: z.number(),
  }),
  async (req, res) => {
    const { projectId, episodesId }: { projectId: number; episodesId: number } = req.body;
    const sqlData = await u
      .db("o_agentWorkData")
      .where("projectId", String(projectId))
      .where("key", "productionAgent")
      .andWhere("episodesId", String(episodesId))
      .select("data")
      .first();

    const scriptData = await u.db("o_script").where("projectId", projectId).where("id", episodesId).first();
    const scriptAssets = await u.db("o_scriptAssets").where("scriptId", episodesId);
    const assetIds = scriptAssets.map((i) => i.assetId);
    const assetsData = await u
      .db("o_assets")
      .leftJoin("o_image", "o_assets.imageId", "o_image.id")
      .select("o_assets.*", "o_image.filePath", "o_image.state", "o_image.errorReason")
      // @ts-ignore
      .where("o_assets.id", "in", assetIds)
      .andWhere("o_assets.assetsId", null)
      .where("o_assets.projectId", projectId);

    let childAssetsData = await u
      .db("o_assets")
      .leftJoin("o_image", "o_assets.imageId", "o_image.id")
      .select("o_assets.*", "o_image.filePath", "o_image.state", "o_image.errorReason")
      .where("o_assets.projectId", projectId)
      // @ts-ignore
      .where("o_assets.assetsId", "in", assetIds)
      .whereNotNull("o_assets.assetsId");

    if (!sqlData) {
      const flowData: FlowData = {
        script: scriptData?.content ?? "",
        scriptPlan: "",
        assets: await Promise.all(
          assetsData.map(async (item) => ({
            id: item.id,
            name: item.name ?? "",
            type: item.type ?? "",
            prompt: item.prompt ?? "",
            desc: item.describe ?? "",
            src: item.filePath && (await u.oss.getSmallImageUrl(item.filePath!)),
            state: item.state ?? "未生成",
            derive: await Promise.all(
              childAssetsData
                .filter((child) => child.assetsId === item.id)
                .map(async (child) => ({
                  id: child.id,
                  assetsId: item.id,
                  name: child.name ?? "",
                  type: child.type,
                  prompt: child.prompt,
                  desc: child.describe ?? "",
                  src: child.filePath && (await u.oss.getSmallImageUrl(child.filePath!)),
                  state: child.state ?? "未生成", //todo：矫正状态值
                })),
            ),
          })),
        ),
        storyboardTable: "",
        storyboard: await readStoryboards(u.db, projectId, episodesId, file=>u.oss.getSmallImageUrl(file)),
        //todo：矫正workbench数据
        //@ts-ignore
        workbench: {
          videoList: [],
        },
        // //todo：矫正封面数据
        // poster: {
        //   items: [],
        // },
      };
      await attachProgress(flowData, projectId, episodesId);
      return res.status(200).send(success(flowData));
    } else {
      try {
        const flowData = JSON.parse(sqlData!.data ?? "{}");
        flowData.assets = await Promise.all(
          assetsData.map(async (item) => ({
            id: item.id,
            name: item.name ?? "",
            type: item.type ?? "",
            prompt: item.prompt ?? "",
            desc: item.describe ?? "",
            src: item.filePath && (await u.oss.getSmallImageUrl(item.filePath!)),
            state: item.state ?? "未生成",
            flowId: item.flowId,
            derive: await Promise.all(
              childAssetsData
                .filter((child) => child.assetsId === item.id)
                .map(async (child) => ({
                  id: child.id,
                  assetsId: item.id,
                  name: child.name ?? "",
                  prompt: child.prompt,
                  type: child.type,
                  desc: child.describe ?? "",
                  src: child.filePath && (await u.oss.getSmallImageUrl(child.filePath!)),
                  state: child.state ?? "未生成",
                  errorReason: child?.errorReason ?? "",
                  flowId: child.flowId,
                })),
            ),
          })),
        );
        flowData.storyboard = await readStoryboards(u.db, projectId, episodesId, file=>u.oss.getSmallImageUrl(file));
        flowData.script = scriptData?.content ?? "";
        await attachProgress(flowData, projectId, episodesId);
        res.status(200).send(success(flowData));
      } catch (err) {
        res.status(400).send(error());
      }
    }
  },
);
