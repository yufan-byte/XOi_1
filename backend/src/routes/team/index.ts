import express, { type Response } from "express";
import {
  createTeam,
  dashboard,
  teamSummary,
  membershipOf,
  movePool,
  teamOfOwner,
  TeamError,
} from "@/lib/team/store";
import { QUOTA_PER_UNIT } from "@/utils/quota";

const router = express.Router();
const uid = (req: express.Request) => Number((req as express.Request & { user?: { id?: number } }).user?.id || 0);
function fail(res: Response, error: unknown) {
  if (error instanceof TeamError) return res.status(error.status).json({ success: false, message: error.message });
  console.error("[team]", error);
  return res.status(500).json({ success: false, message: "团队操作失败，请稍后重试" });
}

router.get("/", async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  try {
    const own = await teamOfOwner(userId);
    if (own) return res.json({ success: true, data: { role: "owner", ...(req.query.summary === "1" ? await teamSummary(own) : await dashboard(own, String(req.query.month || ""))) } });
    const membership = await membershipOf(userId);
    if (!membership) return res.json({ success: true, data: { role: "none" } });
    const base = {
      role: "member",
      canViewAll: membership.member.can_view_all,
      me: {
        nickname: membership.member.nickname,
        limitQuota: membership.member.limit_quota,
        period: membership.member.period,
        status: membership.member.status,
      },
    };
    if (req.query.summary === "1") {
      return res.json({ success: true, data: { ...base, ...(membership.member.can_view_all ? await teamSummary(membership.team) : { team: { name: membership.team.name } }) } });
    }
    const data = await dashboard(membership.team, String(req.query.month || ""), membership.member.can_view_all ? undefined : userId);
    if (membership.member.can_view_all) return res.json({ success: true, data: { ...base, ...data } });
    const mine = data.members.find((member) => member.userId === userId);
    return res.json({ success: true, data: { ...base, team: { name: membership.team.name }, mine } });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/", async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  const body = (req.body ?? {}) as { action?: string; name?: string; dir?: string; amount?: number; on?: boolean };
  try {
    if (body.action === "create") return res.json({ success: true, data: await createTeam(userId, String(body.name ?? "")) });
    const team = await teamOfOwner(userId);
    if (!team) throw new TeamError("只有团队主账号可以操作", 403);
    if (body.action === "pool") {
      if (body.dir !== "in" && body.dir !== "out") throw new TeamError("划拨方向不对");
      const quota = Math.round(Number(body.amount) * QUOTA_PER_UNIT);
      return res.json({ success: true, data: await movePool(team, body.dir, quota) });
    }
    if (body.action === "isolate") {
      throw new TeamError("项目级共享尚未开放，当前保持既有资源权限",409);
    }
    throw new TeamError("未知操作");
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
