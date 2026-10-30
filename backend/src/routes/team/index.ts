import express, { type Response } from "express";
import {
  batchCreateMembers,
  createTeam,
  dashboard,
  teamSummary,
  membershipOf,
  movePool,
  teamForOwner,
  teamOfOwner,
  TeamError,
} from "@/lib/team/store";
import { batchMembersInput, sudoInput } from "@/lib/team/inputs";
import { confirmIdentity, requireSudo, SudoError } from "@/lib/team/sudo";
import { trackedTeamOperation } from "@/lib/team/managementRuntime";
import { TeamManagementError } from "@/lib/team/management";
import { QUOTA_PER_UNIT } from "@/utils/quota";
import { stashBatchCredentials } from "@/lib/team/batchStore";
import { ensureMfaTables, mfaStatus } from "@/lib/team/mfa";

const router = express.Router();
const uid = (req: express.Request) => Number((req as express.Request & { user?: { id?: number } }).user?.id || 0);
function fail(res: Response, error: unknown) {
  if (error instanceof TeamError || error instanceof SudoError) return res.status(error.status).json({ success: false, message: error.message });
  if (error instanceof TeamManagementError) return res.status(error.status).json({ success: false, message: error.message });
  console.error("[team]", error);
  return res.status(500).json({ success: false, message: "团队操作失败，请稍后重试" });
}

router.get("/", async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  try {
    // 多团队：带 teamId 就只取那个团队（按 id + owner 校验），否则退回「我的第一个团队」。
    const requested = Number(req.query.teamId);
    await ensureMfaTables().catch(() => undefined);
    const guard = { mfaEnabled: (await mfaStatus(userId).catch(() => ({ enabled: false }))).enabled };
    if (Number.isSafeInteger(requested) && requested > 0) {
      const team = await teamForOwner(requested, userId);
      if (req.query.summary === "1") return res.json({ success: true, data: { role: "owner", ...guard, ...(await teamSummary(team)) } });
      return res.json({ success: true, data: { role: "owner", ...guard, ...(await dashboard(team, String(req.query.month || ""))) } });
    }
    const own = await teamOfOwner(userId);
    if (own) return res.json({ success: true, data: { role: "owner", ...guard, ...(req.query.summary === "1" ? await teamSummary(own) : await dashboard(own, String(req.query.month || ""))) } });
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
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    if (body.action === "create") return res.json({ success: true, data: await createTeam(userId, String(body.name ?? "")) });

    // 安全复核：验证登录密码（未开 MFA）或动态口令/救援码（已开 MFA），通过后签发 10 分钟有效令牌。
    if (body.action === "sudo") {
      const parsed = sudoInput.safeParse(body);
      if (!parsed.success) throw new SudoError(parsed.error.issues[0]?.message || "验证参数无效");
      return res.json({ success: true, data: await confirmIdentity(userId, parsed.data) });
    }

    // 批量下发团队账号（高风险动作：必须已通过 sudo）。
    if (body.action === "batchMembers") {
      const parsed = batchMembersInput.safeParse(body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new TeamError(first?.message || "批量创建参数无效");
      }
      const input = parsed.data;
      await requireSudo(req.headers["x-xoi-sudo"], userId);
      const team = await teamForOwner(input.teamId, userId);
      const result = await trackedTeamOperation(
        userId, "member.add", undefined,
        { nickname: `${input.prefix} × ${input.count}`, limitQuota: Math.round(input.limit * QUOTA_PER_UNIT), period: input.period, canViewAll: input.canViewAll },
        () => batchCreateMembers(team, {
          count: input.count, prefix: input.prefix, nicknameBase: input.nicknameBase || input.prefix,
          limitQuota: Math.round(input.limit * QUOTA_PER_UNIT), period: input.period, canViewAll: input.canViewAll,
        }),
        team.id,
      );
      // 明文密码**不回前端**：加密暂存到服务端，凭批次号 + 二次验证才能导出。
      const stash = await stashBatchCredentials(team.id, userId, result.created.map((row) => ({
        username: row.username, nickname: row.nickname, password: row.password, limitQuota: row.limitQuota, period: row.period,
      })));
      return res.json({
        success: true,
        data: {
          teamId: team.id,
          batchId: stash.batchId,
          expiresAt: stash.expiresAt,
          // 账号名不是秘密，可以正常展示；这里只发元数据，方便前端做结果预览
          users: result.created.map((row) => ({ id: row.id, userId: row.userId, username: row.username, nickname: row.nickname, limitQuota: row.limitQuota, period: row.period })),
          createdCount: result.created.length,
          failed: result.failed,
          requiredQuota: result.requiredQuota,
        },
      });
    }

    const requested = Number(body.teamId);
    const team = Number.isSafeInteger(requested) && requested > 0 ? await teamForOwner(requested, userId) : await teamOfOwner(userId);
    if (!team) throw new TeamError("只有团队主账号可以操作", 403);
    if (body.action === "pool") {
      if (body.dir !== "in" && body.dir !== "out") throw new TeamError("划拨方向不对");
      // 划拨会动真金白银（个人余额 ↔ 团队池），和改密同一档：必须已通过安全验证。
      await requireSudo(req.headers["x-xoi-sudo"], userId);
      const quota = Math.round(Number(body.amount) * QUOTA_PER_UNIT);
      return res.json({ success: true, data: await movePool(team, body.dir, quota) });
    }
    if (body.action === "isolate") {
      throw new TeamError("项目级共享尚未开放，当前保持既有资源权限", 409);
    }
    throw new TeamError("未知操作");
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
