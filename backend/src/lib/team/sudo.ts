/**
 * 团队敏感操作的「密码二次确认」（sudo）令牌。
 *
 * 需求：团队管理员做批量建号、重置成员密码、导出账号密码这类高风险动作前，
 * 必须重新输入一次自己的登录密码；验证通过后 10 分钟内免重复。
 *
 * 实现要点：
 *  · 无状态 HMAC 令牌，服务端不存会话，重启不丢；
 *  · 载荷里带 session_version —— 改密 / 强制下线会让所有旧令牌立即失效；
 *  · 密码校验走本地 argon2id 比对（不调网关登录接口，避免顺手产生一个登录会话）；
 *  · 失败按 uid 计数+锁定，防止把二次确认当成密码爆破入口。
 */
import crypto from "node:crypto";
import knex from "@/utils/db";
import { readPasswordHash, verifyPassword } from "./credentials";
import { consumeRecoveryCode, mfaStatus, verifyMfaCode } from "./mfa";

const TTL_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;

let secretCache: string | null = null;
async function secret(): Promise<string> {
  if (secretCache) return secretCache;
  const env = String(process.env.XOI_SUDO_SECRET || "").trim();
  if (env.length >= 32) return (secretCache = env);
  const row = await knex("o_setting").where("key", "tokenKey").first();
  const tokenKey = String(row?.value || "");
  if (!tokenKey) throw new Error("服务器未初始化签名密钥");
  // 由主密钥派生，避免两套密钥同时泄漏互相牵连
  secretCache = crypto.createHmac("sha256", tokenKey).update("xoi-team-sudo-v1").digest("hex");
  return secretCache;
}

const b64 = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export interface SudoState { token: string; expiresAt: number }

/** 10 分钟有效、绑定 uid + 会话版本的幂等令牌。 */
export async function issueSudoToken(userId: number): Promise<SudoState> {
  const row = await knex("o_user").where("id", userId).first();
  const sessionVersion = Number(row?.session_version ?? 0);
  const expiresAt = Date.now() + TTL_MS;
  const payload = b64(JSON.stringify({ u: userId, v: sessionVersion, exp: expiresAt }));
  const signature = crypto.createHmac("sha256", await secret()).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt };
}

export async function verifySudoToken(token: unknown, userId: number): Promise<boolean> {
  const raw = String(token || "").trim();
  if (!raw.includes(".")) return false;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", await secret()).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  let parsed: { u?: number; v?: number; exp?: number };
  try { parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return false; }
  if (Number(parsed.u) !== userId) return false;
  if (!Number.isFinite(parsed.exp) || Number(parsed.exp) < Date.now()) return false;
  const row = await knex("o_user").where("id", userId).first();
  return Number(row?.session_version ?? 0) === Number(parsed.v ?? 0);
}

interface Attempt { failures: number; lockedUntil: number }
const attempts = new Map<number, Attempt>();

export class SudoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** 校验管理员本人的登录密码，成功则签发令牌。 */
export async function confirmPassword(userId: number, password: string): Promise<SudoState> {
  const state = attempts.get(userId);
  if (state && state.lockedUntil > Date.now()) {
    const wait = Math.ceil((state.lockedUntil - Date.now()) / 60000);
    throw new SudoError(`密码错误次数过多，请 ${wait} 分钟后再试`, 429);
  }
  const hash = await readPasswordHash(userId);
  if (!hash) throw new SudoError("账号不存在，请重新登录", 401);
  const ok = await verifyPassword(String(password || ""), hash);
  if (!ok) {
    const next = { failures: (state?.failures ?? 0) + 1, lockedUntil: 0 };
    if (next.failures >= MAX_FAILURES) {
      next.failures = 0;
      next.lockedUntil = Date.now() + LOCK_MS;
    }
    attempts.set(userId, next);
    throw new SudoError("登录密码不正确", 401);
  }
  attempts.delete(userId);
  return issueSudoToken(userId);
}

/**
 * 敏感操作前的身份复核。
 *
 * 未开启动态口令 → 验证登录密码（同 confirmPassword）；
 * 已开启 MFA     → 只认动态口令 / 救援码（密码不再单独够用，防止密码泄漏直接拿走权限）。
 */
export async function confirmIdentity(userId: number, options: { password?: string; code?: string }): Promise<SudoState> {
  const { enabled } = await mfaStatus(userId);
  if (!enabled) {
    if (!options.password) throw new SudoError("请输入登录密码");
    return confirmPassword(userId, options.password);
  }
  const code = String(options.code || "").trim();
  if (!code) throw new SudoError("请输入验证器上的 6 位动态口令");
  const result = await verifyMfaCode(userId, code);
  if (result.ok) {
    attempts.delete(userId);
    return issueSudoToken(userId);
  }
  // 救援码兜底：手机丢了还能救回来，用过一次即作废
  if (await consumeRecoveryCode(userId, code)) {
    attempts.delete(userId);
    return issueSudoToken(userId);
  }
  const state = attempts.get(userId);
  const next = { failures: (state?.failures ?? 0) + 1, lockedUntil: 0 };
  if (next.failures >= MAX_FAILURES) {
    next.failures = 0;
    next.lockedUntil = Date.now() + LOCK_MS;
  }
  attempts.set(userId, next);
  throw new SudoError(result.message || "动态口令不正确", 401);
}

/** 敏感接口统一入口：要求带有效的 sudo 令牌。 */
export async function requireSudo(headerValue: unknown, userId: number): Promise<void> {
  if (!(await verifySudoToken(headerValue, userId))) {
    throw new SudoError("该操作需要先完成安全验证（10 分钟内有效）", 428);
  }
}
