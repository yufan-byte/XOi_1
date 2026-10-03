/**
 * 作品审核 —— 移植自造物引擎 src/app/api/works/review/route.ts。
 *
 * 用途：用户把画布工作流 / 图片 / 视频发布到灵感广场后，站长在代理商中心「内容审核」里
 * 通过 / 驳回 / 下架，通过后所有人可见（其他人可「复刻同款」）。
 *
 * 鉴权、角色口径、挂载位置与 src/routes/skills/review.ts 完全一致：
 *   GET  role ≥ 10，POST role ≥ 100。
 *   ⚠️ 实际挂在**全局 XOi JWT 之后**（core.ts 扫描生成），详见 skills/review.ts 文件头的说明。
 *
 * 挂载路径：/api/works/review
 */
import express, { type Response } from "express";
import { currentUser } from "@/lib/reseller/auth";
import { pendingWorks, reviewWork, workFail, WorkError } from "@/lib/market/work-store";

const router = express.Router();

const role = (u: { role?: number } | null) => u?.role ?? 0;
const forbidden = (res: Response) => res.status(403).json({ success: false, message: "forbidden" });

router.get("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me || role(me) < 10) return forbidden(res);
  try {
    res.json({ success: true, data: { items: await pendingWorks(), canManage: role(me) >= 100 } });
  } catch (e) { workFail(res, e); }
});

/** POST {id, action: approve|reject|unlist, note?} */
router.post("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me || role(me) < 100) return res.status(403).json({ success: false, message: "只有站长可以审核作品" });
  const b = (req.body ?? {}) as { id?: unknown; action?: unknown; note?: unknown };
  try {
    if (!b.id) throw new WorkError("缺少作品");
    if (!["approve", "reject", "unlist"].includes(String(b.action))) throw new WorkError("未知操作");
    res.json({ success: true, data: await reviewWork(String(b.id), b.action as "approve", String(b.note ?? "")) });
  } catch (e) { workFail(res, e); }
});

export default router;
