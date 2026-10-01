import express from "express";
import { boundedInteger, queryText } from "@/utils/adminQuery";
import { requireAdmin } from "@/middleware/requireAdmin";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";
import { releasePoints } from "@/utils/billing";

const router = express.Router();
router.use(requireAdmin);

/** 统一计费审计：管理员查看预扣、结算、释放记录。 */
router.get("/", async (req, res) => {
  try {
    const page = boundedInteger(req.query.page, 1, 10000);
    const limit = boundedInteger(req.query.limit, 20, 100);
    const status = queryText(req.query.status);
    const scene = queryText(req.query.scene);
    const search = queryText(req.query.search);

    const applyFilters = (query: any) => {
      if (status) query.where("o_points_reservation.status", status);
      if (scene) query.where("o_points_reservation.scene", scene);
      if (search) {
        query.where((builder: any) => {
          builder
            .where("o_points_reservation.request_id", "like", `%${search}%`)
            .orWhere("o_points_reservation.reference_id", "like", `%${search}%`)
            .orWhere("o_user.name", "like", `%${search}%`);
        });
      }
      return query;
    };

    const base = u.db("o_points_reservation").leftJoin("o_user", "o_points_reservation.user_id", "o_user.id");
    const reservations = await applyFilters(base.clone())
      .select("o_points_reservation.*", "o_user.name as user_name")
      .orderBy("o_points_reservation.created_at", "desc")
      .limit(limit)
      .offset((page - 1) * limit);
    const totalRow = await applyFilters(base.clone()).count("o_points_reservation.id as count").first();
    const statusStats = await u.db("o_points_reservation").select("status").sum("points as points").count("id as count").groupBy("status");

    res.send(success({
      reservations,
      pagination: { page, limit, total: Number((totalRow as any)?.count || 0) },
      statusStats,
    }));
  } catch (e: any) {
    console.error("[admin/billing]", e);
    res.status(500).send(error("计费流水加载失败"));
  }
});

/** 允许管理员处理异常挂起的预扣，释放接口具备幂等保护。 */
router.post("/:id/release", async (req, res) => {
  if (req.body?.confirm !== req.params.id || typeof req.body?.description !== "string" ||
      req.body.description.trim().length < 5 || req.body.description.length > 500) {
    return res.status(400).send(error("请输入预扣编号确认，并填写 5–500 字的释放原因"));
  }
  try {
    const released = await releasePoints(
      { reservationId: req.params.id, bypassed: false },
      String(req.body?.description || "管理员手动释放预扣"),
      (req as any).user.id,
    );
    if (!released) return res.status(404).send(error("预扣记录不存在或已结算"));
    res.send(success({ released: true }));
  } catch (e: any) {
    console.error("[admin/billing/release]", e);
    res.status(500).send(error(e.message || "释放预扣失败"));
  }
});

export default router;
