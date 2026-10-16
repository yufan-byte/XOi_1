import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { CreativeDeleteError, deleteOwnedProject } from "@/utils/creativeDeletion";
const router = express.Router();

export default router.post(
  "/",
  validateFields({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
  async (req, res) => {
    const { id } = req.body;
    const userId = Number((req as any).user?.id);
    if (!userId) return res.status(401).send(error("未登录"));
    try {
      await deleteOwnedProject(u.db, userId, id);
    } catch (cause) {
      if (cause instanceof CreativeDeleteError) return res.status(cause.status).send(error(cause.message));
      throw cause;
    }

    // Files cannot participate in the DB transaction. Clean them only after metadata commits.
    let cleanupPending = false;
    try {
      await u.oss.deleteDirectory(`${id}/`);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
        cleanupPending = true;
        console.warn(`[project-delete] 项目 ${id} 的元数据已删除，媒体目录清理失败，请运维重试`);
      }
    }
    return res.status(200).send(success({ message: "删除项目成功", cleanupPending }));
  },
);
