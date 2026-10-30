import { userFacingError } from "@/utils/userFacingError";
import express from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/middleware/middleware";
import { success, error } from "@/lib/responseFormat";
import { continuitySchema } from "@/utils/directorContinuity";
import { saveStoryboardContinuity } from "@/utils/saveStoryboardContinuity";

const router = express.Router();
export default router.post("/", validateFields({
  projectId: z.number().int().positive(), scriptId: z.number().int().positive(), id: z.number().int().positive(),
  continuity: continuitySchema, expectedContinuity: continuitySchema.nullable(), applySceneLayout: z.boolean().optional(),
}), async (req, res) => {
  try { res.json(success(await saveStoryboardContinuity(u.db, req.body))); }
  catch (e) { res.status(409).json(error(userFacingError(e, "保存连续性设置失败，请稍后重试"))); }
});
