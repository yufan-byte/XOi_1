import express from "express";
import { memberAction, teamOfOwner, TeamError, type MemberAction, type Period } from "@/lib/team/store";
import { QUOTA_PER_UNIT } from "@/utils/quota";

const router = express.Router({ mergeParams: true });

router.patch("/", async (req, res) => {
  const userId = Number((req as any).user?.id || 0);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  const memberId = Number((req.params as Record<string, string | undefined>).id);
  const body = (req.body ?? {}) as { action?: string; password?: string; nickname?: string; limit?: number; period?: string; canViewAll?: boolean };
  try {
    const team = await teamOfOwner(userId);
    if (!team) throw new TeamError("改密、停用和额度设置仅主账号可操作", 403);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) throw new TeamError("成员不存在", 404);
    let action: MemberAction;
    switch (body.action) {
      case "password": action = { action: "password", password: String(body.password ?? "") }; break;
      case "disable": case "enable": case "delete": action = { action: body.action }; break;
      case "update":
        action = {
          action: "update", nickname: body.nickname,
          limitQuota: body.limit === undefined ? undefined : Math.round(Number(body.limit) * QUOTA_PER_UNIT),
          period: body.period as Period | undefined, canViewAll: body.canViewAll,
        };
        break;
      default: throw new TeamError("未知操作");
    }
    await memberAction(team, memberId, action);
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof TeamError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("[team/member]", error);
    return res.status(500).json({ success: false, message: "成员操作失败，请稍后重试" });
  }
});

export default router;
