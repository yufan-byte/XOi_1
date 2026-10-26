import express from "express";
import { addMember, teamOfOwner, TeamError, type Period } from "@/lib/team/store";
import { QUOTA_PER_UNIT } from "@/utils/quota";
import {newMemberInput} from "@/lib/team/inputs";
import {trackedTeamOperation} from "@/lib/team/managementRuntime";
import {TeamManagementError} from "@/lib/team/management";

const router = express.Router();

router.post("/", async (req, res) => {
  const userId = Number((req as any).user?.id || 0);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  const parsed=newMemberInput.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"成员资料或额度无效，请检查昵称、邮箱、密码、周期及权限开关"});
  const body=parsed.data;
  try {
    const team = await teamOfOwner(userId);
    if (!team) throw new TeamError("只有团队主账号可以添加成员", 403);
    const limit = Number(body.limit ?? 0);
    if (!Number.isFinite(limit) || limit < 0) throw new TeamError("消费额度需为 0 或正数");
    const details={nickname:body.nickname,limitQuota:Math.round(limit*QUOTA_PER_UNIT),period:body.period,canViewAll:body.canViewAll};
    const member = await trackedTeamOperation(userId,"member.add",undefined,details,()=>addMember(team, {
      nickname: String(body.nickname ?? ""), email: String(body.email ?? ""), password: String(body.password ?? ""),
      limitQuota: Math.round(limit * QUOTA_PER_UNIT), period: (body.period ?? "month") as Period, canViewAll: !!body.canViewAll,
    }));
    return res.json({ success: true, data: { id: member.id } });
  } catch (error) {
    if (error instanceof TeamError||error instanceof TeamManagementError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("[team/members] 操作失败",error instanceof Error?error.name:"error");
    return res.status(500).json({ success: false, message: "添加成员失败，请稍后重试" });
  }
});

export default router;
