import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { saveStoryboardImageVersion } from "@/utils/storyboardImageHistory";
import { userFacingError } from "@/utils/userFacingError";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.number(),
    url: z.string(),
    flowId: z.number(),
    expectedUrl: z.string().nullable().optional(),
  }),
  async (req, res) => {
    try {
      const { id, url, flowId, expectedUrl } = req.body;
      const row = await u.db("o_storyboard").where({ id }).select("projectId", "scriptId").first();
      const flow = await u.db("o_imageFlow").where({ id: flowId }).select("flowData").first();
      if (!row || !flow) return res.status(404).send(error("镜头或画布不存在"));
      const graph = typeof flow.flowData === "string" ? JSON.parse(flow.flowData) : flow.flowData;
      const path = u.replaceUrl(url);
      if (!path.startsWith(`${Number(row.projectId)}/`)) return res.status(400).send(error("请选择当前项目中的图片"));
      const exists = Array.isArray(graph?.nodes) && graph.nodes.some((node: any) => {
        const source = node?.type === "generated" ? node?.data?.generatedImage : node?.type === "upload" ? node?.data?.image : "";
        return typeof source === "string" && source && u.replaceUrl(source) === path;
      });
      if (!path || !exists) return res.status(400).send(error("请选择画布中已保存的图片"));
      const continuity = await saveStoryboardImageVersion(u.db, Number(row.projectId), Number(row.scriptId), id, path, false, {
        expectedFilePath: expectedUrl === undefined ? undefined : expectedUrl ? u.replaceUrl(expectedUrl) : null,
        flowId,
      });
      res.status(200).send(success({ continuity, message: "已采用画面，原图保留在历史版本" }));
    } catch (e) { res.status(409).send(error(userFacingError(e, "保存画面失败，请重试"))); }
  },
);
