import crypto from "node:crypto";
import { db } from "@/utils/db";

const DEFAULT_BASE = "http://127.0.0.1:3000";
const TOKEN_NAME_PREFIX = "XOi Studio";

export interface UserGatewayCredentials {
  baseUrl: string;
  apiKey: string;
  group: string;
}

export function newApiV1BaseUrl(): string {
  const raw = (process.env.NEWAPI_BASE_URL || DEFAULT_BASE).trim().replace(/\/+$/, "");
  return /\/v\d+$/.test(raw) ? raw : `${raw}/v1`;
}

/** 生产环境默认强制 NewAPI；开发环境可用 XOI_NEWAPI_ONLY=1 提前验证。 */
export function isNewApiOnly(): boolean {
  if (["prod", "production"].includes((process.env.NODE_ENV || "").trim().toLowerCase())) return true;
  const configured = (process.env.XOI_NEWAPI_ONLY || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(configured)) return true;
  if (["0", "false", "no", "off"].includes(configured)) return false;
  return ["prod", "production"].includes((process.env.NODE_ENV || "").trim().toLowerCase());
}

export function assertAllowedVendor(vendorId: string): void {
  if (isNewApiOnly() && vendorId !== "newapi") {
    throw new Error(`生产环境只允许通过 NewAPI 调用模型，已拒绝供应商 ${vendorId}`);
  }
}
export function assertProductionModel(model: string): void {
  // Kept for adapter compatibility. Model visibility is role-based and enforced
  // by assertUserModelAccess immediately before every gateway POST.
  if (!String(model || "").trim()) throw new Error("模型不能为空");
}

function tokenName(group: string): string {
  return `${TOKEN_NAME_PREFIX} · ${group}`;
}

function presentToken(rawKey: string): string {
  return rawKey.startsWith("sk-") ? rawKey : `sk-${rawKey}`;
}

function createTokenKey(): string {
  // NewAPI 的 token 查找只接受其原生 62 字符字母表；base64url 中的 -/_ 会被判为不存在。
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 48 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join("");
}

/**
 * 为当前 new-api 用户取得一枚专用无限额令牌。
 *
 * 无限额仅表示“令牌本身不再设二级额度”；实际扣费仍由 new-api 从 users.quota 扣除。
 * 令牌只留在服务端，浏览器永远拿不到。事务级 advisory lock 防止并发首请求生成重复令牌。
 */
export async function ensureUserGatewayToken(userId: number): Promise<{ apiKey: string; group: string }> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("无效的 NewAPI 用户 ID");

  return db.transaction(async (trx) => {
    await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [`xoi:user-token:${userId}`]);

    const user = await trx("users").where("id", userId).select("id", "group", "status").first();
    if (!user) throw new Error("NewAPI 中不存在当前用户");
    if (Number(user.status) !== 1) throw new Error("当前 NewAPI 用户已被禁用");

    const group = String(user.group || "default").trim() || "default";
    const existing = await trx("tokens")
      .where({ user_id: userId, name: tokenName(group), status: 1 })
      .whereNull("deleted_at")
      .select("key")
      .orderBy("id", "desc")
      .first();
    if (existing?.key && /^[A-Za-z0-9]{48}$/.test(String(existing.key))) {
      return { apiKey: presentToken(String(existing.key)), group };
    }
    if (existing?.key) await trx("tokens").where({ user_id: userId, key: existing.key }).update({ status: 2 });

    const key = createTokenKey();
    await trx("tokens").insert({
      user_id: userId,
      key,
      status: 1,
      name: tokenName(group),
      created_time: Math.floor(Date.now() / 1000),
      accessed_time: 0,
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      used_quota: 0,
      group,
      cross_group_retry: false,
    });
    return { apiKey: presentToken(key), group };
  });
}

export async function getUserGatewayCredentials(userId: number): Promise<UserGatewayCredentials> {
  const token = await ensureUserGatewayToken(userId);
  return { baseUrl: newApiV1BaseUrl(), ...token };
}
