import express from "express";
import { getUserCatalog, publicModel, quoteModel } from "@/lib/model-catalog";
const router = express.Router();
router.get("/", async (req, res) => {
  try {
    const catalog = await getUserCatalog(Number((req as any).user.id));
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: catalog.models.filter(m => m.selectable && (!req.query.type || m.type === req.query.type)).map(m => publicModel(m, catalog.factor)), pointsPerYuan: 10 });
  } catch (e) { console.error("[catalog]", (e as Error).message); res.status(502).json({ message: "模型目录暂时不可用" }); }
});
router.post("/quote", async (req, res) => {
  try {
    if (typeof req.body?.model !== "string" || !req.body.model.trim()) return res.status(400).json({ message: "请选择模型" });
    const name = req.body.model.replace(/^newapi:/, "");
    const catalog = await getUserCatalog(Number((req as any).user.id)).catch(() => null);
    if (!catalog) return res.status(502).json({ message: "模型价格服务暂时不可用，请重试" });
    const model = catalog.models.find(m => m.modelName === name && m.selectable);
    if (!model) return res.status(404).json({ message: "该模型当前不可用" });
    if (req.body.params && (typeof req.body.params !== "object" || Array.isArray(req.body.params))) return res.status(400).json({ message: "报价参数无效" });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: quoteModel(model, req.body.params || {}, catalog.factor) });
  } catch (e) { console.error("[quote]", (e as Error).message); res.status(422).json({ message: "当前参数暂无可靠预估，最终按实际用量结算" }); }
});
export default router;
