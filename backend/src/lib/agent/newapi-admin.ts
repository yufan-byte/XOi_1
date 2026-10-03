/**
 * 以站长身份调用 new-api 管理接口（仅服务端）。
 *
 * 移植自造物引擎 src/lib/newapi-admin.ts。代理体系要替普通用户做管理员才能做的事：
 * 生成兑换码（卡密）、读写「分组专属倍率」GroupGroupRatio。
 * 凭证来自环境变量 NEWAPI_ADMIN_TOKEN / NEWAPI_ADMIN_USER（默认 1 = 首位管理员），
 * 与 XOi 其它服务端调用用的是同一个站长令牌，绝不下发浏览器。
 *
 * 与 XOi `@/utils/newapi` 的差异：那个走 axios 客户端 + 自己那套 unwrap，
 * 这里保持造物的极简形态（一个 adminApi + 三个薄封装），方便与 agent-store 逐行对照。
 */
import axios from "axios";

export class AdminApiError extends Error {}

function baseURL(): string {
  return (process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000").trim().replace(/\/+$/, "");
}
function adminToken(): string {
  return (process.env.NEWAPI_ADMIN_TOKEN || "").trim();
}
function adminUser(): string {
  return (process.env.NEWAPI_ADMIN_USER || "1").trim() || "1";
}

export async function adminApi<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  if (!adminToken()) throw new AdminApiError("服务未配置管理凭证");
  const r = await axios.request({
    url: `${baseURL()}${path}`,
    method: init.method ?? "GET",
    timeout: init.timeoutMs ?? 20_000,
    validateStatus: () => true,
    headers: {
      Authorization: `Bearer ${adminToken()}`,
      "New-Api-User": adminUser(),
      "Content-Type": "application/json",
    },
    data: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const j = (r.data ?? {}) as { success?: boolean; message?: string; data?: T };
  if (r.status < 200 || r.status >= 300 || j.success === false) {
    throw new AdminApiError(j.message || `new-api ${r.status}`);
  }
  return j.data as T;
}

/** 读全部选项（GroupRatio / GroupGroupRatio 都在里面） */
export async function getOptions(): Promise<Record<string, string>> {
  const list = await adminApi<{ key: string; value: string }[]>("/api/option/");
  return Object.fromEntries((list ?? []).map((o) => [o.key, o.value]));
}

export async function putOption(key: string, value: string): Promise<void> {
  await adminApi("/api/option/", { method: "PUT", body: { key, value } });
}

/** 生成兑换码，返回明文 key 列表 */
export async function createRedemptions(name: string, quota: number, count: number, expiredTime = 0): Promise<string[]> {
  return adminApi<string[]>("/api/redemption/", { method: "POST", body: { name: name.slice(0, 20), quota, count, expired_time: expiredTime } });
}
