/**
 * 灵感广场 · 作品列表 / 发布 / 删除 —— 挂载 /api/works（core.ts 白名单 "works" 自动挂）。
 *
 * 鉴权：全局 XOi JWT 中间件（core.ts 自动挂载链）已写 req.user。
 * mc_works.user_id 是 new-api 的 int id（造物口径），而全站铁律是 `o_user.id === new-api users.id`
 * （见 lib/userMirror.ts 文件头），所以直接取 req.user.id 即可 —— 但必须先 o_user JOIN 已完成，
 * 绝不能拿 o_user.id 之外的口径去 JOIN new-api 的 users，否则作者名会全空。
 */
import express from "express";
import { WORK_TYPES, myWorks, feedWorks, publishWork, deleteWork, workFail, WorkError } from "@/lib/market/work-store";

const router = express.Router();

/**
 * 当前用户的 new-api int id（未登录 null）。
 * resolveIdentity() 只回 { id, name, role, status }，**没有** newapi_uid
 * （取 newapi_uid 会恒为 undefined → 所有 interaction 端点误判未登录）。
 */
function uid(req: express.Request): number | null {
  const u = (req as any).user;
  const n = Number(u?.newapi_uid ?? u?.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

router.get("/", async (req, res) => {
  const me = uid(req);
  const type = String(req.query.type || "canvas");
  if (!WORK_TYPES.includes(type as any)) return res.status(400).json({ success: false, message: "未知作品类型" });
  try {
    const items = req.query.scope === "mine"
      ? (me ? await myWorks(me) : [])
      : await feedWorks(type as any, me);
    res.json({ success: true, data: { items } });
  } catch (e) { workFail(res, e); }
});

/** POST {workType,title,description?,category?,coverUrl?,coverKind?,payload?} */
router.post("/", async (req, res) => {
  const me = uid(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  try {
    const row = await publishWork(me, (req.body ?? {}) as any);
    res.json({ success: true, data: row });
  } catch (e) { workFail(res, e); }
});

/** DELETE ?id= （仅本人） */
router.delete("/", async (req, res) => {
  const me = uid(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  const id = String(req.query.id || "");
  if (!id) throw new WorkError("缺少作品 id");
  try {
    const ok = await deleteWork(me, id);
    if (!ok) return res.status(404).json({ success: false, message: "作品不存在或不是你的" });
    res.json({ success: true, data: {} });
  } catch (e) { workFail(res, e); }
});

export default router;
