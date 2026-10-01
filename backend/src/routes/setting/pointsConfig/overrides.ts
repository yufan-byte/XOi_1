import express from "express";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";

/**
 * 差异化计费覆写规则 CRUD(P2B-8)
 * 数据模型见 utils/points.ts:PricingCtx 与 lib/initDB.ts:o_points_price_override。
 * 解析序 getActionPoints(action,{vid,name}):精确命中 > supplier 通配(NULL model)> o_points_price.action 基础价 ×1.0
 *
 * 安全：每个 handler 内联角色守卫(role==='admin')作防御兜底，
 *       外层另经 app.ts requireAdmin 前缀挂号；双重保护不依赖单一环节。
 */
const u = database;
const router = express.Router();

function isAdminReq(req: any): boolean {
  return (req as any)?.user?.role === "admin";
}

// 列表(管理员可见)：联出基础价便于运营对照倍率效果
router.get("/", async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).send(error("无权限"));
  try {
    const rows = await u.db("o_points_price_override")
      .select(
        "o_points_price_override.*",
        "p.points as base_points",
        "p.description as base_description",
      )
      .leftJoin("o_points_price as p", "p.action", "o_points_price_override.base_action")
      .orderBy([
        { column: "vendor_id" },
        { column: "base_action" },
        { column: "model_name", nulls: "first" },
      ]);
    res.send(success(rows));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 新增：组合唯一性靠应用层把关(SQLite UNIQUE 对 NULL 宽松不可依赖 DB)
router.post("/", async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).send(error("无权限"));

  const { base_action, vendor_id, model_name, multiplier, description } = req.body || {};
  if (!base_action || typeof base_action !== "string") {
    return res.status(400).send(error("base_action 不能为空"));
  }
  if (!vendor_id || typeof vendor_id !== "string") {
    return res.status(400).send(error("vendor_id 不能为空"));
  }
  const m = Number(multiplier ?? 1.0);
  if (!Number.isFinite(m) || m <= 0 || m > 1000) {
    return res.status(400).send(error("multiplier 必须为大于 0 的数值"));
  }

  // 归一化 model_name：空串/null/undefined ⇒ null 表示供应商通配(wildcard)
  const mn =
    model_name === undefined || model_name === null || String(model_name).trim() === ""
      ? null
      : String(model_name).trim();

  try {
    // 校验引用的基础动作真实存在于定价表中，防误配幽灵 key
    const baseRow = await u.db("o_points_price").where("action", base_action).first();
    if (!baseRow) return res.status(400).send(error(`未知操作动作 ${base_action}，请先在「计费中心」维护其基础价`));

    // 校验目标供应商启用中(允许指向任意已记录 vendor 即便禁用也可保留规则待启用后生效)
    const dupQ = u.db("o_points_price_override").where({ base_action, vendor_id });
    const dup =
      mn == null
        ? await (dupQ as any).clone().whereNull("model_name").first()
        : await (dupQ as any).clone().where({ model_name: mn }).first();
    if (dup) {
      return res.status(409).send(error(`规则已存在：${base_action}/${vendor_id}/${mn ?? "*"}`));
    }

    await u.db("o_points_price_override").insert({
      base_action,
      vendor_id,
      model_name: mn,
      multiplier: m,
      description: description != null ? String(description) : null,
    });
    res.send(success({ message: "创建成功" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 单点更新子集字段
router.patch("/:id", async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).send(error("无权限"));

  const id = parseInt(req.params.id);
  if (isNaN(id) || id <= 0) return res.status(400).send(error("无效的规则 ID"));

  const { multiplier, description } = req.body || {};
  const patch: Record<string, unknown> = {};
  if (multiplier !== undefined) {
    const m = Number(multiplier);
    if (!Number.isFinite(m) || m <= 0 || m > 1000) return res.status(400).send(error("倍率必须在 0–1000 之间且大于 0"));
    patch.multiplier = m;
  }
  if (description !== undefined) {
    patch.description = description === null ? null : String(description);
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).send(error("未提供更新字段"));
  }

  try {
    const affected = await u.db("o_points_price_override").where("id", id).update(patch);
    if (!affected) return res.status(404).send(error("规则不存在"));
    res.send(success({ message: "更新成功" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 物理删除(规则体量小审计价值低，无需软删留痕)
router.delete("/:id", async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).send(error("无权限"));

  const id = parseInt(req.params.id);
  if (isNaN(id) || id <= 0) return res.status(400).send(error("无效的规则 ID"));

  try {
    const affected = await u.db("o_points_price_override").where("id", id).delete();
    if (!affected) return res.status(404).send(error("规则不存在"));
    res.send(success({ message: "删除成功" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

export default router;
