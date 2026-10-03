import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
import { v4 as uuid } from "uuid";
const router = express.Router();

/** 单个成片上限：JSON body 全局限 25mb，base64 膨胀 ~4/3，留出富余。 */
const MAX_OUTPUT_BYTES = 18 * 1024 * 1024;

/**
 * 保存合成的成片到项目资产库（o_output + OSS）。
 *
 * 前端合成（浏览器 WebCodecs）后本地下载，同时静默调这里归档 ——
 * 这一步才让「到成片」真正成立：分镜成片页的成片节点能看到它、项目资产库能找到它、
 * 换设备登录仍在。旧行为是只下载到本地磁盘，系统里查无此物、项目永远没有终点态。
 */
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number().optional(),
    episodesId: z.number().optional(),
    base64Data: z.string(),
    name: z.string().optional(),
    duration: z.number().optional(),
    resolution: z.string().optional(),
    source: z.string().optional().default("webcodecs"),
  }),
  async (req, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).send(error("未登录"));

    const { projectId, scriptId, episodesId, base64Data, name, duration, resolution, source } = req.body;

    // 归属校验：项目必须是当前用户的，避免把成片写进别人的项目
    const project = await u.db("o_project").where("id", projectId).andWhere("userId", userId).first();
    if (!project) return res.status(403).send(error("项目不存在或无权访问"));

    const matched = base64Data.match(/base64,(.+)$/);
    if (!matched?.[1]) return res.status(400).send(error("成片内容为空"));
    const buffer = Buffer.from(matched[1], "base64");
    if (!buffer.length) return res.status(400).send(error("成片内容为空"));
    if (buffer.length > MAX_OUTPUT_BYTES) {
      return res.status(400).send(error(`成片超过 ${Math.floor(MAX_OUTPUT_BYTES / 1024 / 1024)}MB，未自动归档，可到项目素材里手动上传`));
    }

    const savePath = `/${projectId}/output/${uuid()}.mp4`;
    await u.oss.writeFile(savePath, buffer);

    const [id] = await u.db("o_output").insert({
      projectId,
      // 一集剧本就是一次成片单位：episodesId 与 scriptId 同源，两个都落便于按集/按项目查
      scriptId: scriptId ?? episodesId ?? null,
      episodesId: episodesId ?? scriptId ?? null,
      name: name || `${project.name ?? "成片"}`,
      filePath: savePath,
      duration: duration ?? null,
      size: buffer.length,
      resolution: resolution ?? null,
      source,
      createTime: Date.now(),
    });

    let url = savePath;
    try {
      url = await u.oss.getFileUrl(savePath);
    } catch {
      /* 取直链失败不影响归档结果 */
    }

    res.status(200).send(success({ id, filePath: savePath, url, size: buffer.length }));
  },
);
