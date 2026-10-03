/**
 * 灵感广场 · 作品详情与互动 —— core.ts 把本文件挂载在 `/api/works/:id`。
 *
 * ⚠️ 挂载点已消费掉 `:id`，所以路由**不能再写 `/:id`**（写了两层会 404）：
 *    router.get("/")  → GET  /api/works/<id>
 *    router.post("/") → POST /api/works/<id>
 *
 * GET    详情（含 payload；待审核仅本人可见）
 * POST   {action: like|unlike|view|replicate} 计数互动（like 需登录）
 */
import express from "express";
import { getWork, setLike, bump, workFail, WorkError } from "@/lib/market/work-store";

// mergeParams: 挂载点是 /api/works/:id，默认的子 Router 不继承父级参数，
// req.params.id 会是空的 —— 必须显式打开。
const router = express.Router({ mergeParams: true });

/** req.user 只有 { id, name, role, status }，且 o_user.id === new-api users.id，故取 id */
const uid = (req: express.Request): number | null => {
  const u = (req as any).user;
  const n = Number(u?.newapi_uid ?? u?.id);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * 保留字：`review`（审核路由）与 `history`（我的作品生成历史）都是 core.ts 单独挂的子路径，
 * 但生成顺序是 `:id` 在前，所以必须 `next()` 放行而不是当成作品 id，
 * 否则控制台的 GET/POST /api/works/review、主站的 GET /api/works/history 会被这里吃掉。
 */
const RESERVED = new Set(["review", "history"]);

router.get<{ id: string }>("/", async (req, res, next) => {
  if (RESERVED.has(String(req.params.id))) return next();
  try {
    const row = await getWork(String(req.params.id), uid(req));
    if (!row) return res.status(404).json({ success: false, message: "作品不存在" });
    res.json({ success: true, data: row });
  } catch (e) { workFail(res, e); }
});

router.post<{ id: string }>("/", async (req, res, next) => {
  const id = String(req.params.id);
  if (RESERVED.has(id)) return next();
  const me = uid(req);
  const action = String((req.body as any)?.action || "");
  try {
    if (action === "like" || action === "unlike") {
      if (!me) return res.status(401).json({ success: false, message: "请先登录" });
      return res.json({ success: true, data: { likes: await setLike(me, id, action === "like") } });
    }
    if (action === "view" || action === "replicate") {
      await bump(id, action === "view" ? "views" : "replicas", me);
      return res.json({ success: true, data: {} });
    }
    throw new WorkError("未知操作");
  } catch (e) { workFail(res, e); }
});

export default router;
