/**
 * GET /api/auth/me —— 当前登录者身份（统一身份端点）
 *
 * 为什么需要它：
 *   无限画布（frontend/atelier）在启动时调此端点解析 owner，用于 localStorage / IndexedDB
 *   按用户分桶（见 frontend/atelier/src/xoi/owner.ts）。此前后端没有该端点，请求 404，
 *   画布只能落 anon 桶 —— 同一浏览器多账号会串数据。
 *
 * 为什么不套 success()/error() 包装（项目里其他路由都套）：
 *   画布是裸 fetch，直接读 `data.user.id`，不认 { code, data, message } 外壳。
 *   这里返回**扁平** body；身份与额度字段口径与 /api/login/self 保持一致。
 *
 * 鉴权：由 app.ts 的全局 JWT 中间件负责（未登录进不来），因此无 token 不会走到这里。
 */
import express from "express";
import u from "@/utils";
import { getQuota, quotaToYuan } from "@/utils/quota";

const router = express.Router();

export default router.get("/", async (req, res) => {
  const identity = (req as unknown as { user?: { id?: number; role?: string } }).user;
  if (!identity?.id) return res.status(401).json({ message: "未登录" });

  const mirror = await u.db("o_user").where("id", identity.id).first();
  if (!mirror) return res.status(401).json({ message: "账号不存在，请重新登录" });

  let quota: number | null = null;
  let balance: number | null = null;
  try {
    quota = await getQuota(identity.id, { fresh: false });
    balance = quotaToYuan(quota);
  } catch (e) {
    // 取不到额度不该让画布拿不到身份 —— 身份是分桶的依据，额度只是附带信息
    console.error("[auth/me] 额度读取失败:", e instanceof Error ? e.message : e);
  }

  return res.status(200).json({
    // 顶层同时铺一份上游画布 AuthUser 形状的字段：
    // infinite-canvas 的 fetchCurrentUser 直接把响应体当 AuthUser 用（读顶层 id/role/…），
    // 而 atelier owner.ts 读 data.user.id —— 两类消费方共用此端点，两种形状都要满足。
    id: String(mirror.id),
    username: mirror.name,
    displayName: mirror.name,
    avatarUrl: "",
    role: mirror.role === "admin" ? ("admin" as const) : ("user" as const),
    credits: balance,
    createdAt: mirror.created_at ?? "",
    updatedAt: mirror.last_login_at ?? "",
    user: {
      id: mirror.id,
      username: mirror.name,
      display_id: mirror.display_id ?? null,
      role: mirror.role || "user",
      email: mirror.email ?? null,
      quota,
      balance,
    },
  });
});
