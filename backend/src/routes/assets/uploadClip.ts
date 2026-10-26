import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { assertScriptInProject, linkAssetToScript } from "@/utils/assetScope";
import { extFromDataUrl, MediaWriteError, saveBase64Media } from "@/utils/mediaWrite";
const router = express.Router();

// 文件上传（支持图片、音频、视频）
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    base64Data: z.string(),
    type: z.string().optional().default("clip"),
    name: z.string(),
    scriptId: z.number().optional().nullable(),
  }),
  async (req, res) => {
    const { base64Data, projectId, type = "clip", name, scriptId } = req.body;
    const userId = Number((req as any).user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).send(success({ message: "未登录" }));
    await assertScriptInProject(projectId, scriptId);

    const declaredExt = extFromDataUrl(base64Data);
    if (!declaredExt) return res.status(400).json({ detail: "不支持的文件类型" });

    try {
      // 统一收口：原来这里把 base64 直接解出来就写盘，不校验文件头、不限大小、不记账。
      // autoDetect：浏览器给的 mime 未必准，以文件头为准决定扩展名。
      const saved = await saveBase64Media({
        userId,
        scope: "project",
        autoDetect: true,
        ext: declaredExt,
        relPath: (ext) => `/${projectId}/assets/${uuid()}.${ext}`,
        base64: base64Data,
      });

      const [id] = await u.db("o_assets").insert({
        type: type,
        projectId: projectId,
        name,
        startTime: Date.now(),
      });
      const [imageId] = await u.db("o_image").insert({
        filePath: saved.relPath,
        type,
        assetsId: id,
        state: "已完成",
      });
      await u.db("o_assets").where("id", id).update({
        imageId: imageId,
      });
      await linkAssetToScript(id, scriptId);
    } catch (e) {
      if (e instanceof MediaWriteError) return res.status(e.status).json({ detail: e.message });
      throw e;
    }

    res.status(200).send(success("上传成功"));
  },
);
