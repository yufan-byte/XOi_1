import { userFacingError } from "@/utils/userFacingError";
import express from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/middleware/middleware";
import { success, error } from "@/lib/responseFormat";
import { saveStoryboardImageVersion } from "@/utils/storyboardImageHistory";
const router = express.Router();
export default router.post(
  "/",
  validateFields({
    projectId: z.number().int().positive(),
    scriptId: z.number().int().positive(),
    id: z.number().int().positive(),
    filePath: z.string().max(1000),
    expectedUrl: z.string().nullable().optional(),
  }),
  async (req, res) => {
    try {
      const { projectId, scriptId, id, filePath, expectedUrl } = req.body;
      const continuity = await saveStoryboardImageVersion(
        u.db,
        projectId,
        scriptId,
        id,
        filePath,
        true,
        { expectedFilePath: expectedUrl === undefined ? undefined : expectedUrl ? u.replaceUrl(expectedUrl) : null },
      );
      res.json(
        success({ continuity, src: await u.oss.getSmallImageUrl(filePath) }),
      );
    } catch (e) {
      res.status(409).json(error(userFacingError(e, "连续性帧处理失败，请稍后重试")));
    }
  },
);
