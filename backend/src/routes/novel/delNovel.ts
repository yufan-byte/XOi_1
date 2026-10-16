import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { CreativeDeleteError, deleteOwnedNovels } from "@/utils/creativeDeletion";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
  async (req, res) => {
    const userId = Number((req as any).user?.id);
    if (!userId) return res.status(401).send(error("未登录"));
    try {
      await deleteOwnedNovels(u.db, userId, [req.body.id]);
      return res.status(200).send(success({ message: "删除原文成功" }));
    } catch (cause) {
      if (cause instanceof CreativeDeleteError) return res.status(cause.status).send(error(cause.message));
      throw cause;
    }
  },
);
