/**
 * 内容审核 —— 移植自造物引擎 src/app/api/skills/review/route.ts。
 *
 * 用途：用户把自己做的 Skill 提交上架后，站长在代理商中心「内容审核」里通过 / 驳回 / 下架。
 * 鉴权与 /api/reseller/* 同一套（lib/reseller/auth：XOi JWT → 管理员令牌反查 new-api），
 * 并按角色的两档口径放行：
 *   · GET  ：role ≥ 10（管理员）可看审核列表，canManage = role ≥ 100（站长）决定按钮是否可点
 *   · POST ：role ≥ 100 才能真改状态（与造物逐字一致）
 *
 * ⚠️ 挂载位置的**事实**（2026-10-03 核对）：本文件由 core.ts 扫描生成，
 *    实际挂在**全局 XOi JWT 中间件之后**（router.ts 里的 routeNNN），并非「之前」。
 *    当前可用是因为控制台发的是 XOi JWT，全局中间件与本路由的 currentUser() 用的是同一份凭据；
 *    若哪天要以 new-api 令牌调用，会被全局中间件先拦成 401 —— 那时才需要挪到 app.ts 前置挂载。
 *    另注：`works/[id].ts` 与 `skills/[id].ts` 的 RESERVED 集合要放行 `review`，
 *    否则 `:id` 会先吃掉这个子路径（core.ts 按文件名排序，`[id]` 排在 `review` 前面）。
 *
 * 挂载路径：/api/skills/review（由 src/core.ts 扫描 routes/skills/review.ts 生成）
 */
import express, { type Response } from "express";
import { currentUser } from "@/lib/reseller/auth";
import { pendingSkills, reviewSkill, skillFail, SkillError } from "@/lib/market/skill-store";

const router = express.Router();

const role = (u: { role?: number } | null) => u?.role ?? 0;
const forbidden = (res: Response) => res.status(403).json({ success: false, message: "forbidden" });

router.get("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me || role(me) < 10) return forbidden(res);
  try {
    res.json({ success: true, data: { items: await pendingSkills(), canManage: role(me) >= 100 } });
  } catch (e) { skillFail(res, e); }
});

/** POST {id, action: approve|reject|unlist, note?} */
router.post("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me || role(me) < 100) return res.status(403).json({ success: false, message: "只有站长可以审核 Skill" });
  const b = (req.body ?? {}) as { id?: unknown; action?: unknown; note?: unknown };
  try {
    if (!b.id) throw new SkillError("缺少 Skill");
    if (!["approve", "reject", "unlist"].includes(String(b.action))) throw new SkillError("未知操作");
    res.json({ success: true, data: await reviewSkill(String(b.id), b.action as "approve", String(b.note ?? "")) });
  } catch (e) { skillFail(res, e); }
});

export default router;
