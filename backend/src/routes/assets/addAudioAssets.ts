import express from "express";
import u from "@/utils";
import { z } from "zod";
import { assertScriptInProject, linkAssetToScript } from "@/utils/assetScope";
import { extFromDataUrl, MediaWriteError, saveBase64Media } from "@/utils/mediaWrite";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 新增资产
export default router.post(
  "/",
  validateFields({
    name: z.string(),
    describe: z.string(),
    projectId: z.number(),
    assetsItem: z.array(
      z.object({
        base64: z.string(),
        prompt: z.string(),
        describe: z.string(),
        name: z.string(),
      }),
    ),
    scriptId: z.number().optional().nullable(),
  }),
  async (req, res) => {
    const { name, describe, projectId, assetsItem, scriptId } = req.body;
    const userId = Number((req as any).user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json({ detail: "未登录" });
    await assertScriptInProject(projectId, scriptId);
    try {
      await Promise.all(
        assetsItem.map(async (i: { src?: string; base64: string; prompt: string }) => {
          if (!i.base64) return;
          // 原来这里按 data URL 的 mime 猜扩展名后直接写盘，不校验文件头也不记账。
          // 现在以文件头为准（aiff / flac / m4a 的魔数已在 mediaSecurity 里补齐）。
          const saved = await saveBase64Media({
            userId,
            scope: "project",
            autoDetect: true,
            ext: extFromDataUrl(i.base64) || "mp3",
            relPath: (ext) => `/${projectId}/assets/audio/${u.uuid()}.${ext}`,
            base64: i.base64,
          });
          i.src = saved.relPath;
        }),
      );
    } catch (e) {
      if (e instanceof MediaWriteError) return res.status(e.status).json({ detail: e.message });
      throw e;
    }

    const [id] = await u.db("o_assets").insert({
      name,
      describe,
      type: "audio",
      projectId,
      startTime: Date.now(),
    });
    await linkAssetToScript(id, scriptId);
    for (const item of assetsItem) {
      const [assetsId] = await u.db("o_assets").insert({
        prompt: item.prompt,
        assetsId: id,
        type: "audio",
        describe: item.describe,
        name: item.name,
        projectId,
        startTime: Date.now(),
      });
      const [imageId] = await u.db("o_image").insert({
        filePath: item.src,
        type: "audio",
        assetsId,
        state: "已完成",
      });
      await u.db("o_assets").where("id", assetsId).update({
        imageId,
      });
    }

    res.status(200).send(success({ message: "新增资产成功" }));
  },
);
