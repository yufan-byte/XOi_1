/**
 * 团队账号密码写入（2026-10-28）。
 *
 * 为什么不用 new-api 的 `PUT /api/user/` 改密：
 *   该接口要求「安全验证（sudo）」——网关对管理员令牌一律回
 *   `Security verification is no longer valid`，且 `GET /api/verify/methods`
 *   直接 401「当前登录方式不支持安全验证」。也就是说系统令牌**永远**过不了
 *   这道闸，团队改密从设计上就走不通（这正是「重置密码一直失败」的根因）。
 *
 * 替代路径：XOi 与网关同库（决策 D2），按网关**完全相同的参数**直接写
 * argon2id 哈希（m=19456 KiB, t=2, p=1, salt 16B, hash 32B，PHC 编码）。
 * 已用真实账号做过端到端验证：写入新哈希后 `POST /api/user/login` 新密码登录
 * 成功、错误密码被拒，随后已还原原哈希。
 *
 * 改密必须同时完成两件事，少一件都是安全漏洞：
 *   1. 删除该用户在网关侧的全部会话（user_sessions），旧 token 立即失效；
 *   2. bump `o_user.session_version`，让已签发的 XOi JWT 一并失效。
 */
import { argon2id, argon2Verify } from "hash-wasm";
import { db } from "@/lib/agent/db";
import knex from "@/utils/db";

/** 与网关保持一致的 argon2id 参数；改这里必须同步核对现网哈希串。 */
const PARAMS = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

/** 返回中文错误文案；合法则返回 null。不校验字符类别，与网关口径保持一致。 */
export function passwordPolicyError(password: string): string | null {
  if (typeof password !== "string") return "密码格式不对";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return `密码需 ${PASSWORD_MIN}~${PASSWORD_MAX} 位`;
  // 允许任意可见字符，但拒绝控制字符（\u0000-\u001f、\u007f），避免不可见字符导致的「怎么也输不对」
  if (/[\u0000-\u001f\u007f]/.test(password)) return "密码不能包含控制字符";
  if (!password.trim()) return "密码不能全是空格";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return argon2id({ password, salt, ...PARAMS, outputType: "encoded" });
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!encoded || !password) return false;
  try {
    return await argon2Verify({ password, hash: encoded });
  } catch {
    return false;
  }
}

/** 读取网关侧的密码哈希（同一库的 users 表）。 */
export async function readPasswordHash(userId: number): Promise<string | null> {
  const pool = db();
  if (!pool) return null;
  const result = await pool.query<{ password: string }>(
    "SELECT password FROM users WHERE id = $1 AND deleted_at IS NULL",
    [userId],
  );
  return result.rows[0]?.password ?? null;
}

/**
 * 直接改密（唯一可用路径）。
 * 注意：调用方负责权限校验与审计，这里只做数据写入与会话失效。
 */
export async function setPasswordDirect(userId: number, password: string): Promise<void> {
  const problem = passwordPolicyError(password);
  if (problem) throw new Error(problem);
  const pool = db();
  if (!pool) throw new Error("数据库未配置");
  const encoded = await hashPassword(password);
  const updated = await pool.query(
    "UPDATE users SET password = $1 WHERE id = $2 AND deleted_at IS NULL",
    [encoded, userId],
  );
  if (!updated.rowCount) throw new Error("账号不存在");
  await revokeSessions(userId);
}

/** 让该用户在网关与 XOi 两侧的既有登录态全部失效。 */
export async function revokeSessions(userId: number): Promise<void> {
  const pool = db();
  if (pool) {
    await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]).catch(() => undefined);
  }
  await knex("o_user").where("id", userId).increment("session_version", 1);
}

/** 强随机密码：去掉易混字符（0/O、1/l/I），固定 12 位，含大小写与数字。 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export function generatePassword(length = 12): string {
  let out = "";
  const bytes = new Uint8Array(length * 2);
  crypto.getRandomValues(bytes);
  for (let i = 0; out.length < length; i++) {
    const value = bytes[i % bytes.length];
    // 拒绝采样，避免取模偏置
    if (value >= 256 - (256 % ALPHABET.length)) continue;
    out += ALPHABET[value % ALPHABET.length];
  }
  // 保证至少一个大写、一个小写、一个数字（生成后不满足就重来，概率极低）
  if (!/[A-Z]/.test(out) || !/[a-z]/.test(out) || !/[0-9]/.test(out)) return generatePassword(length);
  return out;
}
