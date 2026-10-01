import express from "express";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";

const u = database;
const router = express.Router();

// 获取积分定价列表
router.get("/", async (req, res) => {
  try {
    const prices = await u.db("o_points_price").select("*");
    res.send(success(prices));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 管理员更新积分定价
router.put("/:id", async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  const priceId = parseInt(req.params.id);
  if (isNaN(priceId) || priceId <= 0) return res.status(400).send(error("无效的定价ID"));

  const { points, description } = req.body;
  if (points !== undefined && (!Number.isInteger(points) || points < 0)) {
    return res.status(400).send(error("积分数必须为非负整数"));
  }
  if (description !== undefined && typeof description !== "string") {
    return res.status(400).send(error("描述必须为字符串"));
  }

  try {
    const updateData: any = {};
    if (points !== undefined) updateData.points = points;
    if (description !== undefined) updateData.description = description.trim();
    if (Object.keys(updateData).length === 0) {
      return res.status(400).send(error("未提供更新字段"));
    }

    await u.db("o_points_price").where("id", priceId).update(updateData);
    res.send(success({ message: "更新成功" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 管理员软删除积分记录（标记删除而非物理删除，保留审计痕迹）
router.delete("/log/:id", async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  const logId = parseInt(req.params.id);
  if (isNaN(logId) || logId <= 0) return res.status(400).send(error("无效的记录ID"));

  try {
    // 检查是否已有 deleted_at 字段，如果没有则添加
    const hasDeletedAt = await u.db.schema.hasColumn("o_points_log", "deleted_at");
    if (!hasDeletedAt) {
      await u.db.schema.alterTable("o_points_log", (table) => {
        table.text("deleted_at");
      });
    }

    // 软删除：标记删除时间而非物理删除
    await (u.db("o_points_log") as any).where("id", logId).update({
      deleted_at: new Date().toISOString()
    });
    res.send(success({ message: "删除成功" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

export default router;
