/**
 * 团队管理员的动态口令（TOTP / MFA）——零第三方依赖实现（2026-10-28）。
 *
 * 为什么自己实现：仓库 node_modules 当前被并发会话占用，npm install 会
 * ENOTEMPTY 失败；而 TOTP 本身只有 RFC 6238 三步（base32 解码 → HMAC-SHA1
 * → 动态截断），Node 内置 crypto 足够，也不引入额外依赖风险。
 * 已对齐标准实现：兼容 Google Authenticator / Microsoft Authenticator /
 * 微信小程序「MFA 口令」等所有基于 otpauth:// 的验证器。
 *
 * 安全约定：
 *  · 密钥在系统内**加密存储**（AES-256-GCM，密钥由主密钥派生），数据库泄漏不等于 MFA 被绕过；
 *  · 校验用恒定时间比较，且做 ±1 个时间窗容错（手机时钟略偏也能用）；
 *  · 已用过的口令同一窗口内不能重放（防肩窥后被立即复用）；
 *  · 开启时下发 10 个一次性救援码（只显示一次，库中存哈希），手机丢了也能自救；
 *  · 关闭 MFA 必须验证登录密码，且会一次性作废全部救援码。
 */
import crypto from "node:crypto";
import knex from "@/utils/db";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW_TOLERANCE = 1; // 前后各容 1 个窗口（±30 秒）
const RECOVERY_COUNT = 10;

export class MfaError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/* ---------------------------------- base32 --------------------------------- */

function randomSecret(bytes = 20): string {
  const raw = crypto.randomBytes(bytes);
  let bits = "";
  let out = "";
  for (const byte of raw) {
    bits += byte.toString(2).padStart(8, "0");
    while (bits.length >= 5) {
      out += ALPHABET[Number.parseInt(bits.slice(0, 5), 2)];
      bits = bits.slice(5);
    }
  }
  return out;
}

/** 宽松解码：忽略大小写、空格与填充位（用户手写粘贴时很常见）。 */
function base32Decode(input: string): Buffer | null {
  const clean = String(input || "").toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) return null;
  let bits = "";
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) return null;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/* ----------------------------------- TOTP ---------------------------------- */

function hotp(secret: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  buffer.writeUInt32BE(counter % 0x1_0000_0000, 4);
  const digest = crypto.createHmac("sha1", secret).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | (digest[offset + 3] & 0xff);
  return String(value % 10 ** DIGITS).padStart(DIGITS, "0");
}

function totpMatches(secretB32: string, code: string): number | null {
  const secret = base32Decode(secretB32);
  if (!secret) return null;
  const input = String(code || "").replace(/\D/g, "");
  if (input.length !== DIGITS) return null;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let drift = -WINDOW_TOLERANCE; drift <= WINDOW_TOLERANCE; drift += 1) {
    if (timingEqual(hotp(secret, counter + drift), input)) return counter + drift;
  }
  return null;
}

function timingEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/* --------------------------------- 密钥加密 -------------------------------- */

let keyCache: Buffer | null = null;
async function mfaKey(): Promise<Buffer> {
  if (keyCache) return keyCache;
  const env = String(process.env.XOI_MFA_KEY || "").trim();
  if (env.length >= 32) return (keyCache = crypto.createHash("sha256").update(env).digest());
  const row = await knex("o_setting").where("key", "tokenKey").first();
  const tokenKey = String(row?.value || "");
  if (!tokenKey) throw new MfaError("服务器未初始化签名密钥", 500);
  keyCache = crypto.createHmac("sha256", tokenKey).update("xoi-mfa-secret-v1").digest();
  return keyCache;
}

async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", await mfaKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

async function decryptSecret(packed: string): Promise<string | null> {
  const [ivB64, tagB64, bodyB64] = String(packed || "").split(".");
  if (!ivB64 || !tagB64 || !bodyB64) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", await mfaKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(bodyB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/* ---------------------------------- 数据表 --------------------------------- */

let ready: Promise<void> | null = null;
export async function ensureMfaTables(): Promise<void> {
  ready ??= knex
    .schema
    .hasTable("mc_team_mfa")
    .then(async (exists) => {
      if (!exists) {
        await knex.schema.createTable("mc_team_mfa", (table) => {
          table.increments("id");
          table.integer("user_id").notNullable().unique();
          table.text("secret_cipher").notNullable();
          table.boolean("enabled").notNullable().defaultTo(false);
          table.bigInteger("last_counter").nullable();
          table.bigInteger("enrolled_at").notNullable();
          table.bigInteger("confirmed_at").nullable();
        });
      }
      const hasRecovery = await knex.schema.hasTable("mc_team_mfa_recovery");
      if (!hasRecovery) {
        await knex.schema.createTable("mc_team_mfa_recovery", (table) => {
          table.increments("id");
          table.integer("user_id").notNullable();
          table.text("code_hash").notNullable();
          table.bigInteger("used_at").nullable();
        });
      }
    })
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

export interface MfaStatus {
  enabled: boolean; enrolledAt: number | null; confirmedAt: number | null; recoveryRemaining: number;
}

export async function mfaStatus(userId: number): Promise<MfaStatus> {
  await ensureMfaTables();
  const row = await knex("mc_team_mfa").where("user_id", userId).first();
  const remaining = await knex("mc_team_mfa_recovery").where({ user_id: userId }).whereNull("used_at").count<{ count: string }>("id as count").first();
  return {
    enabled: !!row?.enabled,
    enrolledAt: row?.enrolled_at ? Number(row.enrolled_at) : null,
    confirmedAt: row?.confirmed_at ? Number(row.confirmed_at) : null,
    recoveryRemaining: Number(remaining?.count ?? 0),
  };
}

async function readSecret(userId: number): Promise<string | null> {
  const row = await knex("mc_team_mfa").where("user_id", userId).first();
  if (!row?.secret_cipher) return null;
  return decryptSecret(String(row.secret_cipher));
}

/* ---------------------------------- 对外能力 -------------------------------- */

export interface Enrollment { secret: string; otpauthUrl: string; }

/** 开始绑定：生成密钥（同一账号重复调用会换密钥，旧绑定随即作废）。 */
export async function enrollMfa(userId: number, accountLabel: string, issuer = "XOI STUDIO"): Promise<Enrollment> {
  await ensureMfaTables();
  const secret = randomSecret();
  const issuerPart = encodeURIComponent(issuer);
  const label = encodeURIComponent(accountLabel);
  const otpauthUrl = `otpauth://totp/${issuerPart}:${label}?secret=${secret}&issuer=${issuerPart}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  await knex("mc_team_mfa")
    .insert({ user_id: userId, secret_cipher: await encryptSecret(secret), enabled: false, last_counter: null, enrolled_at: Date.now(), confirmed_at: null })
    .onConflict("user_id")
    .merge({ secret_cipher: await encryptSecret(secret), enabled: false, last_counter: null, enrolled_at: Date.now(), confirmed_at: null });
  return { secret, otpauthUrl };
}

function generateRecoveryCode(): string {
  const bytes = crypto.randomBytes(5);
  // 10 位大写字母数字，去掉易混字符
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length] + alphabet[(byte >> 3) % alphabet.length];
  return out.slice(0, 10);
}

const sha256 = (input: string) => crypto.createHash("sha256").update(input).digest("hex");

/** 用验证器上的 6 位码确认绑定；成功返回一次性救援码（仅此一次可见）。 */
export async function confirmMfa(userId: number, code: string): Promise<string[]> {
  await ensureMfaTables();
  const secret = await readSecret(userId);
  if (!secret) throw new MfaError("请重新获取绑定二维码", 409);
  if (totpMatches(secret, code) === null) throw new MfaError("动态口令不正确，请查看验证器上的当前代码", 401);

  const codes = Array.from({ length: RECOVERY_COUNT }, () => generateRecoveryCode());
  await knex.transaction(async (trx) => {
    await trx("mc_team_mfa").where("user_id", userId).update({ enabled: true, confirmed_at: Date.now() });
    await trx("mc_team_mfa_recovery").where("user_id", userId).delete();
    await trx("mc_team_mfa_recovery").insert(codes.map((plain) => ({ user_id: userId, code_hash: sha256(plain), used_at: null })));
  });
  return codes;
}

/**
 * 校验动态口令。成功返回 null，失败返回 False，抛错表示状态不对。
 * 做了窗口串防爆：同一时间窗内的口令用过一次就不能再用。
 */
export type MfaCheck = { ok: true } | { ok: false; message: string; status?: number };

export async function verifyMfaCode(userId: number, code: string): Promise<MfaCheck> {
  await ensureMfaTables();
  const row = await knex("mc_team_mfa").where("user_id", userId).first();
  if (!row?.enabled) return { ok: false, message: "该账号未开启动态口令" };
  const secret = await readSecret(userId);
  if (!secret) return { ok: false, message: "动态口令配置损坏，请重新绑定", status: 500 };

  const counter = totpMatches(secret, code);
  if (counter === null) return { ok: false, message: "动态口令不正确或已过期", status: 401 };
  const previous = Number(row.last_counter ?? 0);
  if (previous && counter <= previous) return { ok: false, message: "该动态口令刚刚用过，请等验证器跳到下一个", status: 401 };
  await knex("mc_team_mfa").where("user_id", userId).update({ last_counter: counter });
  return { ok: true };
}

/** 救援码兜底：一次性，用完即焚。 */
export async function consumeRecoveryCode(userId: number, code: string): Promise<boolean> {
  await ensureMfaTables();
  const plain = String(code || "").trim().toUpperCase().replace(/[\s-]/g, "");
  if (!plain) return false;
  const hash = sha256(plain);
  const row = await knex("mc_team_mfa_recovery").where({ user_id: userId, code_hash: hash }).whereNull("used_at").first();
  if (!row) return false;
  await knex("mc_team_mfa_recovery").where("id", row.id).update({ used_at: Date.now() });
  return true;
}

/**
 * 关闭 MFA：必须已验证登录密码（由调用方保证），并清空救援码与密钥。
 * 同时 bump session_version，让所有 sudo 令牌立即失效。
 */
export async function disableMfa(userId: number): Promise<void> {
  await ensureMfaTables();
  await knex.transaction(async (trx) => {
    await trx("mc_team_mfa").where("user_id", userId).delete();
    await trx("mc_team_mfa_recovery").where("user_id", userId).delete();
    await trx("o_user").where("id", userId).increment("session_version", 1);
  });
}

export const MFA_PERIOD_SECONDS = STEP_SECONDS;
export const MFA_DIGITS = DIGITS;
