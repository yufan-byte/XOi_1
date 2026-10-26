/**
 * 当前登录者信息 + 实时余额（v3.0 P1 新增）
 *
 * 与造物的 `/api/user/self` 对齐语义，但返回的是 XOi 的形状：
 *   · 本地镜像信息（id / name / role / display_id / email）—— 来自 o_user
 *   · 实时额度（quota + 折算成元的余额）—— 来自 new-api，**不读本地缓存表**
 *
 * 前端余额展示直接换成这里，不要再读 o_points_* 相关的旧接口。
 */
import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { getQuota, quotaToYuan } from "@/utils/quota";
import { quotaToPoints, POINTS_PER_YUAN } from "@/utils/creditUnits";

const router = express.Router();

export default router.get("/", async (req, res) => {
  const userId = (req as unknown as { user?: { id?: number } }).user?.id;
  if (!userId) return res.status(401).send(error("未登录"));

  const mirror = await u.db("o_user").where("id", userId).first();
  if (!mirror) return res.status(401).send(error("账号不存在，请重新登录"));

  // 余额取不到时不要 500 —— 前端拿一个 null 也比整页报错好
  let quota: number | null = null;
  let balance: number | null = null;
  try {
    quota = await getQuota(userId, { fresh: true });
    balance = quotaToYuan(quota);
  } catch (e) {
    console.error("[login/self] 余额读取失败:", e instanceof Error ? e.message : e);
  }

  return res.status(200).send(
    success({
      id: mirror.id,
      name: mirror.name,
      display_id: mirror.display_id,
      role: mirror.role || "user",
      email: mirror.email ?? null,
      user_group: mirror.user_group ?? null,
      /** new-api 的原始额度单位（500000 = ¥1） */
      quota,
      /** 折算成元的可用余额 */
      balance,
      /** 与模型报价一致的展示积分；不先将人民币舍入到分再换算 */
      points: quota === null ? null : quotaToPoints(quota),
      pointsPerYuan: POINTS_PER_YUAN,
      /** 余额读取失败时为 true，前端应提示「暂时无法获取余额」而不是显示 0 */
      balance_unavailable: quota === null,
    }),
  );
});
