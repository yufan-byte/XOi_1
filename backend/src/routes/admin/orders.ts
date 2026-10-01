import express from "express";
import { boundedInteger, queryText } from "@/utils/adminQuery";
import { requireAdmin } from "@/middleware/requireAdmin";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";

const router = express.Router();
router.use(requireAdmin);

function adminOnly(req: express.Request, res: express.Response): boolean {
  const user = (req as any).user;
  if (!user?.id) {
    res.status(401).send(error("未登录"));
    return false;
  }
  if (user.role !== "admin") {
    res.status(403).send(error("无权限"));
    return false;
  }
  return true;
}

/** 管理员订单列表、汇总和分页。 */
router.get("/", async (req, res) => {
  if (!adminOnly(req, res)) return;

  try {
    const page = boundedInteger(req.query.page, 1, 10000);
    const limit = boundedInteger(req.query.limit, 20, 100);
    const status = queryText(req.query.status);
    const search = queryText(req.query.search);

    const base = u.db("o_order")
      .leftJoin("o_user", "o_order.user_id", "o_user.id")
      .leftJoin("o_points_package", "o_order.package_id", "o_points_package.id");

    const applyFilters = (query: any) => {
      if (status) query.andWhere("o_order.status", status);
      if (search) {
        query.andWhere((builder: any) => {
          builder
            .where("o_order.out_trade_no", "like", `%${search}%`)
            .orWhere("o_user.name", "like", `%${search}%`)
            .orWhere("o_order.channel_trade_no", "like", `%${search}%`);
        });
      }
      return query;
    };

    const rows = await applyFilters(base.clone())
      .select(
        "o_order.id", "o_order.user_id", "o_order.out_trade_no", "o_order.channel_trade_no",
        "o_order.amount", "o_order.status", "o_order.channel", "o_order.created_at", "o_order.paid_at",
        "o_user.name as user_name",
        "o_points_package.name as package_name",
      )
      .orderBy("o_order.created_at", "desc")
      .limit(limit)
      .offset((page - 1) * limit);

    const totalRow = await applyFilters(base.clone()).count("o_order.id as count").first();
    const total = Number((totalRow as any)?.count || 0);

    const [paidRow, pendingRow, revenueRow] = await Promise.all([
      u.db("o_order").where("status", "paid").count("id as count").first(),
      u.db("o_order").where("status", "pending").count("id as count").first(),
      u.db("o_order").where("status", "paid").sum("amount as total").first(),
    ]);

    res.send(success({
      orders: rows,
      pagination: { page, limit, total },
      stats: {
        paid: Number((paidRow as any)?.count || 0),
        pending: Number((pendingRow as any)?.count || 0),
        revenue: Number((revenueRow as any)?.total || 0),
      },
    }));
  } catch (e: any) {
    console.error("[admin/orders]", e);
    res.status(500).send(error("订单列表加载失败"));
  }
});

export default router;
