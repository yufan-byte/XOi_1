import express from "express";
import { addMember, teamForOwner, teamOfOwner, TeamError, type Period } from "@/lib/team/store";
import { QUOTA_PER_UNIT } from "@/utils/quota";
import { newMemberInput } from "@/lib/team/inputs";
import { trackedTeamOperation } from "@/lib/team/managementRuntime";
import { TeamManagementError } from "@/lib/team/management";

const router = express.Router();

router.post("/", async (req, res) => {
  const userId = Number((req as any).user?.id || 0);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  // teamId 走独立字段，先剥掉再校验成员字段（schema 是 strict 的）
  const raw = { ...((req.body ?? {}) as Record<string, unknown>) };
  const requested = Number(req.query.teamId ?? raw.teamId);
  delete raw.teamId;
  const parsed = newMemberInput.safeParse(raw);
  if (!parsed.success) return res.status(400).json({ success: false, message: "成员资料或额度无效，请检查昵称、邮箱、密码、周期及权限开关" });
  const body = parsed.data;
  try {
    // 多团队：优先用 teamId 精确定位，未传则退回该账号的第一个团队（旧客户端兼容）。
    const team = Number.isSafeInteger(requested) && requested > 0 ? await teamForOwner(requested, userId) : await teamOfOwner(userId);
    if (!team) throw new TeamError("只有团队主账号可以添加成员", 403);
    const limit = Number(body.limit ?? 0);
    if (!Number.isFinite(limit) || limit < 0) throw new TeamError("消费额度需为 0 或正数");
    const details = { nickname: body.nickname, limitQuota: Math.round(limit * QUOTA_PER_UNIT), period: body.period, canViewAll: body.canViewAll };
    const member = await trackedTeamOperation(userId, "member.add", undefined, details, () => addMember(team, {
      nickname: String(body.nickname ?? ""), email: String(body.email ?? ""), password: String(body.password ?? ""),
      limitQuota: Math.round(limit * QUOTA_PER_UNIT), period: (body.period ?? "month") as Period, canViewAll: !!body.canViewAll,
    }), team.id);
    return res.json({ success: true, data: { id: member.id, username: member.username, mustChangePassword: member.must_change_password } });
  } catch (error) {
    if (error instanceof TeamError || error instanceof TeamManagementError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("[team/members] 操作失败", error instanceof Error ? error.name : "error");
    return res.status(500).json({ success: false, message: "添加成员失败，请稍后重试" });
  }
});

export default router;
