import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import getPath from "@/utils/getPath";
import { resolveOutputAsset } from "@/utils/outputArchive";
import { isAllowedMedia } from "@/utils/mediaSecurity";
import { LEGACY_OUTPUT_JSON_BYTES } from "../../../../../shared/outputArchivePolicy";
const router = express.Router();

/** 单个成片上限：JSON body 全局限 25mb，base64 膨胀 ~4/3，留出富余。 */
const MAX_OUTPUT_BYTES = LEGACY_OUTPUT_JSON_BYTES;

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
    projectId: z.number().int().positive(),
    scriptId: z.number().int().positive().optional(),
    episodesId: z.number().int().positive().optional(),
    base64Data: z.string().optional(),
    assetUrl: z.string().max(180).optional(),
    name: z.string().optional(),
    // The persisted field is whole seconds. Media metadata commonly contains fractions.
    duration: z.number().min(0).max(86400).transform(value => Math.round(value)).optional(),
    resolution: z.string().optional(),
    source: z.string().optional().default("webcodecs"),
  }),
  async (req, res) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).send(error("未登录"));

    const { projectId, scriptId, episodesId, base64Data, assetUrl, name, duration, resolution, source } = req.body;

    // 归属校验：项目必须是当前用户的，避免把成片写进别人的项目
    const project = await u.db("o_project").where("id", projectId).andWhere("userId", userId).first();
    if (!project) return res.status(403).send(error("项目不存在或无权访问"));

    if (!!assetUrl === !!base64Data) return res.status(400).send(error("请提交已上传成片地址或成片内容，二者只能选一项"));
    let savePath: string;
    let size: number;
    if (assetUrl) {
      try {
        const file = await resolveOutputAsset(getPath("oss"), Number(userId), assetUrl);
        savePath = file.filePath;
        size = file.size;
      } catch {
        return res.status(400).send(error("成片不存在、不属于当前账号或不是有效的 MP4，请重新上传"));
      }
    } else {
      const matched = base64Data?.match(/^data:video\/mp4;base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!matched?.[1]) return res.status(400).send(error("成片内容为空或格式不正确"));
      const buffer = Buffer.from(matched[1], "base64");
      if (!isAllowedMedia(buffer, "mp4")) return res.status(400).send(error("成片内容不是 MP4 视频"));
      if (buffer.length > MAX_OUTPUT_BYTES) return res.status(413).send(error("成片超过旧版 JSON 归档上限，请更新页面后使用二进制上传"));
      savePath = `/${projectId}/output/${uuid()}.mp4`;
      await u.oss.writeFile(savePath, buffer);
      size = buffer.length;
    }

    const [id] = await u.db("o_output").insert({
      projectId,
      // 一集剧本就是一次成片单位：episodesId 与 scriptId 同源，两个都落便于按集/按项目查
      scriptId: scriptId ?? episodesId ?? null,
      episodesId: episodesId ?? scriptId ?? null,
      name: name || `${project.name ?? "成片"}`,
      filePath: savePath,
      duration: duration ?? null,
      size,
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

    res.status(200).send(success({ id, filePath: savePath, url, size }));
  },
);
