import express from "express";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";
import { rechargePoints } from "@/utils/points";

const u = database;
const router = express.Router();

// 购买积分套餐 — 创建待支付订单（需要接入支付网关后完善）
router.post("/purchase", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).send(error("未登录"));

  const { package_id } = req.body;
  if (!package_id) return res.status(400).send(error("请选择套餐"));
  const pkgId = parseInt(package_id);
  if (isNaN(pkgId) || pkgId <= 0) return res.status(400).send(error("无效的套餐ID"));

  try {
    const pkg = await u.db("o_points_package").where("id", pkgId).first();
    if (!pkg) return res.status(404).send(error("套餐不存在"));

    // TODO: 接入支付网关（支付宝/微信/Stripe），此处仅创建待支付订单
    // 支付成功后由支付回调接口调用 rechargePoints 发放积分
    // 当前直接返回错误，防止绕过支付
    return res.status(400).send(error("支付功能尚未接入，请联系管理员"));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 管理员手动给用户充值积分（管理员专用，替代无支付验证的购买接口）
router.post("/adminRecharge", async (req, res) => {
  const adminId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!adminId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  const { user_id, package_id } = req.body;
  if (!user_id) return res.status(400).send(error("请指定用户"));
  if (!package_id) return res.status(400).send(error("请选择套餐"));
  const pkgId = parseInt(package_id);
  const targetUserId = parseInt(user_id);
  if (isNaN(pkgId) || pkgId <= 0 || isNaN(targetUserId) || targetUserId <= 0) {
    return res.status(400).send(error("参数格式错误"));
  }

  try {
    const pkg = await u.db("o_points_package").where("id", pkgId).first();
    if (!pkg) return res.status(404).send(error("套餐不存在"));

    const targetUser = await u.db("o_user").where("id", targetUserId).first();
    if (!targetUser) return res.status(404).send(error("用户不存在"));

    const totalPoints = pkg.points + (pkg.bonus || 0);
    await rechargePoints(targetUserId, totalPoints, pkgId, adminId);

    res.send(success({
      message: `已为用户 ${targetUser.name} 充值 ${totalPoints} 积分`,
      points: totalPoints
    }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 获取积分套餐列表
router.get("/packages", async (req, res) => {
  try {
    const packages = await u.db("o_points_package").orderBy("sort_order", "asc");
    res.send(success(packages));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 管理员新增积分/会员套餐
router.post("/package", async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  const { name, price, points, bonus = 0, sort_order = 0, description = "", grant_level = null, grant_vip_days = 0 } = req.body || {};
  if (typeof name !== "string" || !name.trim()) return res.status(400).send(error("套餐名称不能为空"));
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 1000000) return res.status(400).send(error("价格必须大于 0 且不超过 1000000"));
  if (!Number.isInteger(points) || points <= 0) return res.status(400).send(error("积分数必须为正整数"));
  if (!Number.isInteger(bonus) || bonus < 0) return res.status(400).send(error("赠送积分必须为非负整数"));
  if (!Number.isInteger(sort_order) || sort_order < 0) return res.status(400).send(error("排序值必须为非负整数"));
  if (grant_level !== null && !["standard", "premium"].includes(grant_level)) return res.status(400).send(error("会员等级仅支持 standard / premium"));
  if (!Number.isInteger(grant_vip_days) || grant_vip_days < 0) return res.status(400).send(error("会员天数必须为非负整数"));

  try {
    const [id] = await u.db("o_points_package").insert({
      name: name.trim(), price, points, bonus, sort_order,
      description: typeof description === "string" ? description.trim() : String(description),
      grant_level, grant_vip_days,
    });
    res.send(success({ id, message: "套餐已创建" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 管理员更新套餐
router.put("/package/:id", async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));

  const packageId = parseInt(req.params.id);
  if (isNaN(packageId) || packageId <= 0) return res.status(400).send(error("无效的套餐ID"));

  const { name, price, points, bonus, sort_order, description, grant_level, grant_vip_days } = req.body;

  // 参数验证
  if (name !== undefined && (!name || typeof name !== "string" || name.trim().length === 0)) {
    return res.status(400).send(error("套餐名称不能为空"));
  }
  if (price !== undefined && (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 1000000)) {
    return res.status(400).send(error("价格必须大于 0 且不超过 1000000"));
  }
  if (points !== undefined && (!Number.isInteger(points) || points <= 0)) {
    return res.status(400).send(error("积分数必须为正整数"));
  }
  if (bonus !== undefined && (!Number.isInteger(bonus) || bonus < 0)) {
    return res.status(400).send(error("赠送积分必须为非负整数"));
  }
  if (sort_order !== undefined && (!Number.isInteger(sort_order) || sort_order < 0)) {
    return res.status(400).send(error("排序值必须为非负整数"));
  }
  // 付费闭环：grant_level 仅允许 standard/premium 或显式清空(NULL→退化为纯积分包)
  const VALID_LEVELS = ["standard", "premium"];
  let normalizedLevel: string | null | undefined = undefined; // undefined 表示本次不动该列
  if (grant_level !== undefined) {
    if (grant_level === null || grant_level === "") {
      normalizedLevel = null as unknown as string;
    } else if (typeof grant_level === "string" && VALID_LEVELS.includes(grant_level)) {
      normalizedLevel = grant_level;
    } else {
      return res.status(400).send(error("会员等级仅支持 standard / premium"));
    }
  }
  if (grant_vip_days !== undefined && (!Number.isInteger(grant_vip_days) || grant_vip_days < 0)) {
    return res.status(400).send(error("授予天数必须为非负整数"));
  }

  try {
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (price !== undefined) updateData.price = price;
    if (points !== undefined) updateData.points = points;
    if (bonus !== undefined) updateData.bonus = bonus;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (description !== undefined) updateData.description = typeof description === "string" ? description : String(description);
    if (normalizedLevel !== undefined) updateData.grant_level = normalizedLevel;
    if (grant_vip_days !== undefined) updateData.grant_vip_days = grant_vip_days;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).send(error("未提供更新字段"));
    }

    await u.db("o_points_package").where("id", packageId).update(updateData);
    res.send(success({ message: "更新成功" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

export default router;
