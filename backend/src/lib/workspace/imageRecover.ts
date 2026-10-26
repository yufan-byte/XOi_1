/**
 * 生图"迟到结果"反查（对标造物 genImage 超时后的 recoverImageCall）。
 *
 * 我们的生图上游就是造物（zwyq.ccdan.live）。造物在 /v1 代理里把每次出图记进
 * mc_draw_logs，并暴露 /api/draw-logs 给本人查询。当我们这边 300 秒超时放弃时，
 * 上游很可能已经出图并计费 —— 拿造物账号的 JWT 来反查，就能把图找回来。
 *
 * 凭证放环境变量（backend/.env，0600 权限），绝不进数据库/管理界面：
 *   ZAOWU_SITE          造物站点，默认 https://zwyq.ccdan.live
 *   ZAOWU_LOGIN_USER    造物登录账号
 *   ZAOWU_LOGIN_PASSWORD 造物登录密码（换取 15 分钟 JWT；系统访问令牌被 SECURITY_PROOF 拦住，账密登录是最可行路径）
 *   ZAOWU_ADMIN_UID     该账号的 new-api 用户 id（830）
 * 没配就静默跳过，不影响主流程。
 *
 * ⚠️ 登录必须复用：上游签发的 JWT 有效期 15 分钟，而我们每次超时都反查一次。
 * 原来每次反查都 `POST /api/user/login`，高峰期几十个任务同时超时就是几十次登录 ——
 * new-api 有并发会话上限（50），超了直接回 Conflict，反查全废。
 * 现在按 13 分钟缓存 JWT，并用同一个 in-flight promise 合并并发登录。
 */
import axios from "axios";
import u from "@/utils";
import { exactRecoveredImage, MediaRequestLinks } from "./mediaRequestLinks";

/** JWT 缓存：13 分钟（上游有效期 15 分钟，留 2 分钟余量） */
const JWT_TTL_MS = 13 * 60_000;
let jwtCache: { token: string; at: number } | null = null;
let jwtInflight: Promise<string | null> | null = null;

function zaowuCredentials(): { site: string; user: string; password: string; uid: string } | null {
  const user = (process.env.ZAOWU_LOGIN_USER || "").trim();
  const password = (process.env.ZAOWU_LOGIN_PASSWORD || "").trim();
  if (!user || !password) return null;
  return {
    site: (process.env.ZAOWU_SITE || "https://zwyq.ccdan.live").replace(/\/$/, ""),
    user,
    password,
    uid: (process.env.ZAOWU_ADMIN_UID || "830").trim(),
  };
}

/** 取一把可用的 JWT：缓存命中直接用，未命中则合并成一个登录请求。 */
async function zaowuJwt(cred: { site: string; user: string; password: string }): Promise<string | null> {
  if (jwtCache && Date.now() - jwtCache.at < JWT_TTL_MS) return jwtCache.token;
  if (jwtInflight) return jwtInflight;
  jwtInflight = (async () => {
    try {
      const login = await axios.post(
        `${cred.site}/api/user/login`,
        { username: cred.user, password: cred.password },
        { timeout: 15_000 },
      );
      const token = login.data?.data?.access_token;
      if (!token) return null;
      jwtCache = { token, at: Date.now() };
      return token as string;
    } catch (e) {
      // 登录失败不缓存：下一次还有机会；但不能因此抛出打断主流程
      jwtCache = null;
      console.warn("[image-recover] 上游登录失败：", (e as Error).message);
      return null;
    } finally {
      jwtInflight = null;
    }
  })();
  return jwtInflight;
}

/** Only exact task-owned request IDs may recover from a shared upstream account. */
export async function recoverLateImage(opts: { model: string; userId: number; taskId: string; since: number }): Promise<string | null> {
  const cred = await zaowuCredentials();
  if (!cred) return null;
  const requestIds = await new MediaRequestLinks(u.db).list(opts.userId, "image", opts.taskId);
  if (!requestIds.length) return null;
  // 复用缓存的 JWT（见文件头注释：原来每个任务超时都登录一次，会撞上游会话上限）
  const jwt = await zaowuJwt(cred);
  if (!jwt) return null;
  const res = await axios.get(`${cred.site}/api/draw-logs`, {
    headers: { Authorization: jwt, "New-Api-User": cred.uid },
    params: {
      start_timestamp: Math.floor((opts.since - 120_000) / 1000),
      end_timestamp: Math.floor(Date.now() / 1000) + 120,
      page_size: 50,
    },
    timeout: 15_000,
  });
  const items: any[] = res.data?.data?.items ?? [];
  const image = exactRecoveredImage(items, requestIds, opts.model);
  if (!image) return null;
  const url = new URL(image, cred.site);
  return ["http:", "https:"].includes(url.protocol) ? url.href : null;
}
