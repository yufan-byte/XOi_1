/**
 * GET  /api/team/mfa            —— 当前账号的动态口令状态
 * POST /api/team/mfa            —— enroll（拿二维码）/ confirm（验码开启）/ disable（验密码关闭）
 *
 * 为什么绑 IAM 到团队模块：所有需要它兜底的高风险动作（批量建号、重置成员
 * 密码、导出账号密码）都在团队管理台里，放在同一处才不会漏验证。
 */
import express, { type Response } from "express";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";
import knex from "@/utils/db";
import { confirmPassword, SudoError } from "@/lib/team/sudo";
import { setSessionCookie, setMediaCookies } from "@/utils/sessionCookie";
import { mfaConfirmInput, mfaDisableInput, mfaEnrollInput } from "@/lib/team/inputs";
import {
  MfaError, confirmMfa, disableMfa, enrollMfa, ensureMfaTables, mfaStatus, MFA_DIGITS, MFA_PERIOD_SECONDS,
} from "@/lib/team/mfa";
import { db } from "@/lib/agent/db";

const router = express.Router();
const uid = (req: express.Request) => Number((req as express.Request & { user?: { id?: number } }).user?.id || 0);

function fail(res: Response, error: unknown) {
  if (error instanceof MfaError) return res.status(error.status).json({ success: false, message: error.message });
  if (error instanceof SudoError) return res.status(error.status).json({ success: false, message: error.message });
  // 参数校验失败要说人话，别让用户对着「请稍后重试」干瞪眼
  if (error instanceof ZodError) return res.status(400).json({ success: false, message: error.issues[0]?.message || "参数格式不对" });
  console.error("[team/mfa]", error);
  return res.status(500).json({ success: false, message: "动态口令操作失败，请稍后重试" });
}

async function accountLabel(userId: number): Promise<string> {
  const pool = db();
  const result = await pool?.query<{ username: string }>("SELECT username FROM users WHERE id = $1", [userId]).catch(() => null);
  return result?.rows[0]?.username || `user${userId}`;
}

router.get("/", async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  res.setHeader("Cache-Control", "no-store");
  try {
    await ensureMfaTables();
    return res.json({ success: true, data: { ...(await mfaStatus(userId)), digits: MFA_DIGITS, period: MFA_PERIOD_SECONDS } });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/", async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    // 1) 开始绑定：返回密钥与 otpauth 链接，前端拿去画二维码。
    if (body.action === "mfaEnroll") {
      mfaEnrollInput.parse(body);
      const enrollment = await enrollMfa(userId, await accountLabel(userId));
      return res.json({ success: true, data: enrollment });
    }

    // 2) 确认绑定：验一次动态口令才算真的开启，避免扫了码却没配上。
    if (body.action === "mfaConfirm") {
      const parsed = mfaConfirmInput.parse(body);
      const recoveryCodes = await confirmMfa(userId, parsed.code);
      // 救援码只此一次可见，库中只存哈希
      return res.json({ success: true, data: { enabled: true, recoveryCodes } });
    }

    // 3) 关闭：必须是本人输入登录密码（不能只靠旧的 sudo 令牌）。
    //    disableMfa 会 bump session_version 让所有旧 sudo 令牌失效，
    //    所以这里要像改密一样给当前设备重签会话，否则用户会被自己踢下线。
    if (body.action === "mfaDisable") {
      const parsed = mfaDisableInput.parse(body);
      await confirmPassword(userId, parsed.password);
      await disableMfa(userId);
      const row = await knex("o_user").where("id", userId).first();
      const keyRow = await knex("o_setting").where("key", "tokenKey").first();
      const tokenKey = String(keyRow?.value || "");
      if (row && tokenKey) {
        const token = jwt.sign({ id: userId, session_version: Number(row.session_version ?? 0) }, tokenKey, { expiresIn: "24h" });
        setSessionCookie(req, res, token);
        setMediaCookies(req, res, userId, token);
      }
      return res.json({ success: true, data: { enabled: false } });
    }

    return res.status(400).json({ success: false, message: "未知操作" });
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
