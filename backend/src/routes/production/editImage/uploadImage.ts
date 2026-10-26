import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { extFromDataUrl, MediaWriteError, saveBase64Media } from "@/utils/mediaWrite";
const router = express.Router();

// 文件上传（图片流程内使用，只收位图）
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number(),
    base64Data: z.string(),
  }),
  async (req, res) => {
    const { base64Data, projectId, scriptId } = req.body;
    const userId = Number((req as any).user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).send(error("未登录"));

    const ext = extFromDataUrl(base64Data);
    if (!["jpeg", "jpg", "png"].includes(ext)) {
      return res.status(400).send(error("不支持的文件类型"));
    }
    const savePath = `/${projectId}/imageFlow/${scriptId}/${uuid()}.${ext}`;

    try {
      // 统一收口：魔数校验 + 大小上限 + 磁盘水位 + 按项目域记账
      await saveBase64Media({ userId, scope: "project", relPath: savePath, base64: base64Data, ext });
    } catch (e) {
      if (e instanceof MediaWriteError) return res.status(e.status).send(error(e.message));
      throw e;
    }

    res.status(200).send(success(await u.oss.getSmallImageUrl(savePath)));
  },
);
