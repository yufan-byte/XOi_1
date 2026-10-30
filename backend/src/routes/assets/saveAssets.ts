import express from "express";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { extFromDataUrl, MediaWriteError, saveBase64Media } from "@/utils/mediaWrite";
import { adoptImageCandidate } from "@/utils/assetImageCandidates";
const router = express.Router();

// 保存资产图片
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    projectId: z.number(),
    base64: z.string().optional().nullable(),
    type: z.enum(["role", "scene", "tool"]),
    prompt: z.string().optional().nullable(),
    imageId: z.number().optional().nullable(),
    expectedImageId: z.number().nullable().optional(),
  }),
  async (req, res) => {
    const { id, base64, type, prompt, projectId, imageId, expectedImageId } = req.body;
    if (base64) {
      const userId = Number((req as any).user?.id);
      if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json({ detail: "未登录" });

      try {
        // 原来这里固定写成 .png：客户端传 jpg 也会被存成 png，扩展名和内容对不上。
        // 现在以文件头为准决定扩展名，并且走统一的魔数校验 + 记账。
        const saved = await saveBase64Media({
          userId,
          scope: "project",
          autoDetect: true,
          ext: extFromDataUrl(base64),
          relPath: (ext) => `/${projectId}/${type}/${uuidv4()}.${ext}`,
          base64,
        });

        const [idData] = await u.db("o_image").insert({
          assetsId: id,
          filePath: saved.relPath,
          type: type,
          state: "已完成",
        });
        await u
          .db("o_assets")
          .where("id", id)
          .update({
            prompt: prompt ?? "",
            imageId: idData,
          });
      } catch (e) {
        if (e instanceof MediaWriteError) return res.status(e.status).json({ detail: e.message });
        throw e;
      }
    } else {
      if (expectedImageId !== undefined) {
        if (!imageId) return res.status(400).json({ message: "请选择要采用的图片" });
        const result = await adoptImageCandidate(u.db, { id, projectId, imageId, expectedImageId });
        if (result === "invalid") {
          return res.status(400).json({ message: "图片尚未生成完成，不能采用" });
        }
        if (result === "conflict") return res.status(409).json({ message: "当前图片已被其他操作更新，请重新打开后再选择。" });
      } else {
        const changes: Record<string, unknown> = {};
        if (prompt !== undefined && prompt !== null) {
          changes.prompt = prompt;
          changes.promptState = prompt.trim() ? "已完成" : "";
          changes.promptErrorReason = null;
        }
        if (imageId !== undefined) changes.imageId = imageId;
        if (Object.keys(changes).length) await u.db("o_assets").where("id", id).update(changes);
      }
    }
    res.status(200).send(success({ message: "保存资产图片成功" }));
  },
);
