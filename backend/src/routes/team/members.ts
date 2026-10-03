import express from "express";
import { addMember, teamOfOwner, TeamError, type Period } from "@/lib/team/store";
import { QUOTA_PER_UNIT } from "@/utils/quota";

const router = express.Router();

router.post("/", async (req, res) => {
  const userId = Number((req as any).user?.id || 0);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  const body = (req.body ?? {}) as { nickname?: string; email?: string; password?: string; limit?: number; period?: string; canViewAll?: boolean };
  try {
    const team = await teamOfOwner(userId);
    if (!team) throw new TeamError("只有团队主账号可以添加成员", 403);
    const limit = Number(body.limit ?? 0);
    if (!Number.isFinite(limit) || limit < 0) throw new TeamError("消费额度需为 0 或正数");
    const member = await addMember(team, {
      nickname: String(body.nickname ?? ""), email: String(body.email ?? ""), password: String(body.password ?? ""),
      limitQuota: Math.round(limit * QUOTA_PER_UNIT), period: (body.period ?? "month") as Period, canViewAll: !!body.canViewAll,
    });
    return res.json({ success: true, data: { id: member.id } });
  } catch (error) {
    if (error instanceof TeamError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("[team/members]", error);
    return res.status(500).json({ success: false, message: "添加成员失败，请稍后重试" });
  }
});

export default router;
