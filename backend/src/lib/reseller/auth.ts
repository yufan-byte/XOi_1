/**
 * reseller 鉴权（XOi 版）。
 *
 * 与造物的差异（关键）：造物的登录态就是 new-api JWT，直接透传给网关即可；
 * XOi 的登录态是 **XOi 自己签发的 JWT**（tokenKey，payload = { id, session_version }），
 * new-api 不认识它。所以这里的链路是：
 *
 *   1. resolveIdentity() 验 XOi JWT（含 session_version 踢下线检查）→ 得 uid；
 *   2. 用 NEWAPI_ADMIN_TOKEN + New-Api-User: <uid> 调 new-api /api/user/self → 得完整用户（role/quota）。
 *
 * 这与 XOi 的「站点级单一令牌」铁律一致：服务端 → new-api 永远用管理员令牌，
 * 绝不把 new-api 子令牌发给任何客户端。管理判定口径与造物一致：new-api role ≥ 10 = 管理员。
 */
import type { Request } from "express";
import axios from "axios";
import u from "@/utils";
import { resolveIdentity } from "@/utils/authIdentity";
import { newApiSelfByAdmin, assertConfigured, type NewApiUser } from "@/utils/newapi";

const baseURL = () => (process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000").trim().replace(/\/+$/, "");
const adminToken = () => (process.env.NEWAPI_ADMIN_TOKEN || "").trim();
const timeoutMs = () => {
  const n = Number(process.env.NEWAPI_TIMEOUT_MS || 15000);
  return Number.isFinite(n) && n > 0 ? n : 15000;
};

/** 从请求头解析并验证 XOi 登录态，返回 uid；每个请求只解析一次 */
async function currentUid(req: Request): Promise<number | null> {
  const memo = (req as Request & { _resellerUid?: number | null })._resellerUid;
  if (memo !== undefined) return memo;
  let uid: number | null = null;
  try {
    const rawToken = req.headers.authorization || "";
    if (rawToken) {
      const tokenKey = (await u.db("o_setting").where("key", "tokenKey").select("value").first())?.value as string | undefined;
      if (tokenKey) {
        const identity = await resolveIdentity(rawToken, tokenKey, (id) => u.db("o_user").where("id", id).first());
        uid = identity.id ?? null;
      }
    }
  } catch { /* 无效 / 过期 / 已踢下线 → null */ }
  (req as Request & { _resellerUid?: number | null })._resellerUid = uid;
  return uid;
}

/** 透传登录态到 new-api，取当前用户（经管理员令牌反查）；代理商中心 = 站点管理员（role ≥ 10） */
export async function currentUser(req: Request): Promise<NewApiUser | null> {
  const uid = await currentUid(req);
  if (!uid) return null;
  return await newApiSelfByAdmin(uid).catch(() => null);
}

export async function requireAdmin(req: Request): Promise<NewApiUser | null> {
  const u2 = await currentUser(req); return u2 && (u2.role ?? 0) >= 10 ? u2 : null;
}

/** 服务端代表当前管理员调用 new-api 管理接口（站点级管理员令牌）。失败抛错，由路由层转 failed()。 */
export async function backend<T>(req: Request, p: string, init: { method?: "GET" | "PUT" | "POST" | "DELETE"; body?: string } = {}): Promise<T> {
  assertConfigured();
  const uid = await currentUid(req);
  const r = await axios.request({
    url: `${baseURL()}${p}`,
    method: init.method ?? "GET",
    timeout: timeoutMs(),
    validateStatus: () => true,
    headers: {
      "Content-Type": "application/json",
      ...(adminToken() ? { Authorization: `Bearer ${adminToken()}` } : {}),
      ...(uid ? { "New-Api-User": String(uid) } : {}),
    },
    data: init.body,
  });
  const body = r.data as { success?: boolean; message?: string; data?: T } | undefined;
  if (r.status < 200 || r.status >= 300 || body?.success === false) {
    throw new Error(body?.message || `new-api ${r.status}`);
  }
  return body?.data as T;
}

/** 只信代理层注入的 X-Forwarded-For 链首（与 XOi 的 trust proxy 配置一致） */
export function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.ip || "—";
}

/**
 * 原样透传版（用于充值这类**响应形状不能改**的网关端点）。
 *
 * 为什么不用上面的 backend()：它只回 `body.data`，而 new-api 的 `POST /api/user/pay`
 * 把收银台地址放在**响应顶层**（`{ message, data: 表单参数, url }`），前端要读 `url`；
 * 控制台的 topup-dialog 甚至为此绕开 api() 直接读整段响应体（见其注释）。
 * 所以这里把网关的**状态码 + 整段 JSON 原封不动**回给浏览器，形状与造物直连网关时完全一致。
 */
export async function backendRaw(
  req: Request,
  p: string,
  init: { method?: "GET" | "PUT" | "POST" | "DELETE"; body?: string } = {},
): Promise<{ status: number; body: unknown }> {
  assertConfigured();
  const uid = await currentUid(req);
  const r = await axios.request({
    url: `${baseURL()}${p}`,
    method: init.method ?? "GET",
    timeout: timeoutMs(),
    validateStatus: () => true,
    headers: {
      "Content-Type": "application/json",
      ...(adminToken() ? { Authorization: `Bearer ${adminToken()}` } : {}),
      ...(uid ? { "New-Api-User": String(uid) } : {}),
    },
    data: init.body,
  });
  return { status: r.status, body: r.data };
}
