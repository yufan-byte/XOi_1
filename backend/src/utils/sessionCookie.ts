/**
 * 会话 Cookie（F3：把 JWT 从前端 localStorage 迁到 httpOnly cookie）
 *
 * 为什么要做：localStorage 里的 JWT 任何同源 XSS 都能读走并持久化复用（24h 账号接管）。
 * httpOnly cookie 让 JS 根本读不到凭据，把「持久化窃取」这条攻击面直接删掉。
 *
 * 设计约束（别改错）：
 *  1. **header 优先、cookie 兜底**。老客户端 / 未迁移的调用方继续用 Authorization 也能用，
 *     所以这次改造可以灰度、可以随时回滚前端，不会把已登录用户踢下线。
 *  2. **跨站请求不接受 cookie 认证**（cookieAuthAllowed）。sameSite=lax 本身已挡掉跨站
 *     POST/子资源携带，这里再用 Sec-Fetch-Site / Origin 二次确认：只要浏览器明确告诉
 *     「这是跨站请求」，就只认 Authorization header，不认 cookie。
 *     这样即使未来某处改成 sameSite=none，也不会凭空多出 CSRF 面。
 *  3. **cookie 必须 httpOnly + sameSite=lax + host-only（不设 Domain）**。
 *     Secure 由 secureForRequest 判定（https 才加），避免纯 HTTP 部署下 cookie 被浏览器丢弃
 *     导致「登录成功但不持久」这种最坏体验。
 *  4. cookie 里存**裸 token**（不带 "Bearer " 前缀）；resolveIdentity 会统一剥前缀，两种都能收。
 */
import type { Request, Response } from "express";
import { createHash } from "node:crypto";

/** 会话 cookie 名。与媒体授权用的 xoi_media_session_* / xoi_media_owner 互不干扰。 */
export const SESSION_COOKIE = "xoi_session";
/** 与 JWT 的 24h 有效期保持一致；cookie 先到期只会让前端跳一次登录页，不会留半失效态。 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** 从 Cookie 请求头里取一个值（同名多个时取第一个）。 */
export function readCookie(header: string | undefined, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return "";
}

/** 取会话 cookie 里的裸 token（已剥掉可能存在的 Bearer 前缀）。 */
export function readSessionToken(req: Request): string {
  return readCookie(req.headers.cookie, SESSION_COOKIE).replace(/^(Bearer\s+)+/i, "");
}

/**
 * 是否允许用 cookie 认证。
 * 浏览器明确声明跨站（Sec-Fetch-Site: cross-site）或 Origin 与 Host 不一致时一律拒绝，
 * 让请求退回「必须带 Authorization header」的老路 —— 这是 CSRF 的最后一道兜底，
 * 不依赖 sameSite 的实现细节。
 */
export function cookieAuthAllowed(req: Request): boolean {
  const site = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (site === "cross-site") return false;
  const origin = String(req.headers.origin || "");
  if (!origin) return true; // 同源导航 / 非浏览器客户端 / 老 Safari 同源 POST 不带 Origin
  const host = String(req.headers.host || "");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** https 才加 Secure；纯 HTTP 部署（内网、反代未透传 proto）下不能加，否则 cookie 直接被丢弃。 */
export function secureForRequest(req: Request): boolean {
  const override = String(process.env.XOI_SESSION_COOKIE_SECURE || "").toLowerCase();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  if ((req as unknown as { secure?: boolean }).secure === true) return true;
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return proto === "https";
}

/** 登录 / 注册 / 会话迁移成功后下发。 */
export function setSessionCookie(req: Request, res: Response, token: string): void {
  const value = String(token || "").replace(/^(Bearer\s+)+/i, "");
  if (!value) return;
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureForRequest(req),
    path: "/",
    maxAge: MAX_AGE_MS,
  });
}

/** 登出 / 改密 / 主动失效时清除。属性必须与下发时一致，否则浏览器不认这条删除。 */
export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureForRequest(req),
    path: "/",
  });
}

/** 媒体（/oss 下的图片视频）授权 cookie 的有效期，与改造前 prepareMediaSession 一致。 */
const MEDIA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * 一并下发媒体授权 cookie（F3 顺带简化）。
 *
 * 改造前这套 cookie 由前端算：JS 从 localStorage 读 JWT → sha256 出 hint → 写
 * `xoi_media_owner`，再 POST /api/login/media-session 换 httpOnly 的 `xoi_media_session_<id>`。
 * 迁移后 JS 拿不到凭据原文，这套流程走不通 —— 干脆由服务端在签发会话时一次办好：
 *  · `xoi_media_session_<id>`：httpOnly，path=/oss，真正的媒体凭据；
 *  · `xoi_media_owner`：非 httpOnly（privateMedia 需要靠它挑上面那个 cookie），值为 `<id>:<sha256(token)>`。
 * 用按用户区分的 cookie 名，避免「A 标签页的迟到响应覆盖 B 的凭据」。
 */
export function setMediaCookies(req: Request, res: Response, userId: number, token: string): void {
  const raw = String(token || "").replace(/^(Bearer\s+)+/i, "");
  if (!raw || !Number.isSafeInteger(userId) || userId < 1) return;
  const hint = createHash("sha256").update(raw).digest("hex");
  const base = { sameSite: "lax" as const, secure: secureForRequest(req), path: "/oss", maxAge: MEDIA_MAX_AGE_MS };
  res.cookie(`xoi_media_session_${userId}`, raw, { ...base, httpOnly: true });
  res.cookie("xoi_media_owner", `${userId}:${hint}`, base);
}

/** 登出时把媒体 cookie 一起清掉（名字按当前用户算）。 */
export function clearMediaCookies(req: Request, res: Response, userId: number): void {
  if (!Number.isSafeInteger(userId) || userId < 1) return;
  const base = { sameSite: "lax" as const, secure: secureForRequest(req), path: "/oss" };
  res.clearCookie(`xoi_media_session_${userId}`, { ...base, httpOnly: true });
  res.clearCookie("xoi_media_owner", base);
}

/**
 * Socket.IO 握手专用：从原始 headers 判断同源 + 取 cookie。
 * 握手是独立的 HTTP 请求，Express 中间件管不到，必须单独实现一份。
 */
export function sessionTokenFromHandshake(headers: {
  cookie?: string | string[];
  origin?: string | string[];
  host?: string | string[];
}): string {
  const origin = Array.isArray(headers.origin) ? headers.origin[0] : String(headers.origin || "");
  const host = Array.isArray(headers.host) ? headers.host[0] : String(headers.host || "");
  const cookie = Array.isArray(headers.cookie) ? headers.cookie.join(";") : headers.cookie;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return "";
    } catch {
      return "";
    }
  }
  return readCookie(cookie, SESSION_COOKIE).replace(/^(Bearer\s+)+/i, "");
}
