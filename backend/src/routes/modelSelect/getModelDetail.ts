import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { inferKind, publicModel, resolveUserCatalogModel } from "@/lib/model-catalog";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    modelId: z.string(),
  }),
  async (req, res) => {
    const { modelId } = req.body;
    const [id, name] = modelId.split(/:(.+)/);
    if (id === "newapi") {
      try {
        const { model, catalog } = await resolveUserCatalogModel(Number((req as any).user.id), name, inferKind(name));
        return res.json(success(publicModel(model, catalog.factor)));
      } catch { return res.status(502).json({ message: "模型目录读取失败" }); }
    }
    const models = await u.vendor.getModelList(id);
    const findData = models.find((i: any) => i.modelName == name);
    res.status(200).send(success(findData));
  },
);
