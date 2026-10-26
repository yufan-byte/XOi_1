import express from "express";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { getUserCatalog, publicModel } from "@/lib/model-catalog";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    type: z.enum(["text", "image", "video", "audio", "all"]),
  }),
  async (req, res) => {
    const { type } = req.body;
    try {
      const catalog = await getUserCatalog(Number((req as any).user.id));
      return res.json(success(catalog.models.filter(m => m.selectable && (type === "all" || m.type === type)).map(m => ({
        ...publicModel(m, catalog.factor), id: "newapi", vendorId: "newapi", label: m.name, value: m.modelName,
      }))));
    } catch (e) {
      console.error("[model-list]", (e as Error).message);
      return res.status(502).json({ message: "模型目录暂时不可用，请稍后重试" });
    }
  },
);
