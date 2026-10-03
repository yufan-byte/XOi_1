/**
 * new-api 网关客户端（仅服务端使用）
 * =====================================================================
 * 用途：把 XOi 的账号体系从「本地 o_user + bcrypt」整体切到 new-api。
 *
 * 三条铁律（改这个文件前先读）：
 *  1. 管理接口才使用 NEWAPI_ADMIN_TOKEN；模型调用必须使用当前用户的专属令牌。
 *     用户额度只在 new-api 扣一次，XOi 不再维护第二套推理积分账本。
 *  2. XOi 与造物共用 new-api 的用户、分组、额度和日志，不伪造本地固定分组。
 *  3. 邮箱必须直连 PG 写 users.email。new-api 的管理员接口改 email 会「返回 success 但不落库」
 *     （造物线上踩过的坑），所以 HTTP 路径只能当尽力而为，真值以 PG 为准。
 *
 * 版本兼容策略：**不搞兼容，一切以造物为准**。
 *   造物线上就是 JWT 版：登录返回 `data = { access_token, access_expires_at, user }`，
 *   刷新走 `/api/user/auth/refresh`，登出走 `/api/user/auth/logout`（见造物 src/lib/api.ts）。
 *   两边用同一个网关，造物能跑这里就能跑，所以不做双分支。
 */
import axios, { type AxiosInstance } from "axios";

/* ------------------------------------------------------------------ */
/* 配置                                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_BASE = "http://127.0.0.1:3000";

function baseURL(): string {
  return (process.env.NEWAPI_BASE_URL || DEFAULT_BASE).trim().replace(/\/+$/, "");
}
function adminToken(): string {
  return (process.env.NEWAPI_ADMIN_TOKEN || "").trim();
}
/** XOi 在 new-api 里使用的用户组：所有 XOi 用户的隔离标记 */
export function syncGroup(): string {
  return (process.env.NEWAPI_SYNC_GROUP || "xoi").trim() || "xoi";
}
function timeoutMs(): number {
  const n = Number(process.env.NEWAPI_TIMEOUT_MS || 15000);
  return Number.isFinite(n) && n > 0 ? n : 15000;
}

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

export interface NewApiUser {
  id: number;
  username: string;
  display_name?: string;
  email?: string;
  quota?: number;
  used_quota?: number;
  group?: string;
  role?: number;
  status?: number;
  aff_code?: string;
  inviter_id?: number;
}

export interface NewApiAuth {
  /** 网关签发的 JWT。parseAuthData 拿不到就直接抛错，所以这里不会是 null/空串。 */
  accessToken: string;
  /** 毫秒时间戳；0 表示未知 */
  expiresAt: number;
  user: NewApiUser;
}

/** new-api 标准响应外壳 */
interface Envelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

/** 上游报错在这里统一抛出，路由层不用再判 success 字段 */
export class NewApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly upstreamMessage: string,
    /** 是否属于「凭据不符」——路由层据此决定要不要计入 failCounter */
    public readonly isCredentialFailure: boolean = false,
  ) {
    super(upstreamMessage);
    this.name = "NewApiError";
  }
}

/* ------------------------------------------------------------------ */
/* 底层 HTTP                                                           */
/* ------------------------------------------------------------------ */

function client(token?: string | null, extra?: Record<string, string>): AxiosInstance {
  return axios.create({
    baseURL: baseURL(),
    timeout: timeoutMs(),
    // 登录接口会 400/401，交给调用方判定，不让 axios 抛
    validateStatus: () => true,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
  });
}

/** 配置缺失时给一句人能看懂的话，而不是 ECONNREFUSED */
export function assertConfigured(): void {
  if (!adminToken()) {
    throw new NewApiError(503, "NEWAPI_ADMIN_TOKEN 未配置，无法连接模型网关");
  }
}

async function unwrap<T>(res: { status: number; data: unknown }, what: string): Promise<T> {
  const body = res.data as Envelope<T> | string | undefined;
  if (typeof body === "string") {
    throw new NewApiError(res.status || 502, `网关返回了非 JSON 内容（${what}）`);
  }
  const ok = res.status >= 200 && res.status < 300 && body?.success !== false;
  if (!ok) {
    const msg = body?.message || `网关请求失败（${what}，HTTP ${res.status}）`;
    // new-api 的凭据失败文案很固定，用它来区分「密码错」和「服务挂了」
    const isCredential = /incorrect|wrong password|banned|不存在|密码错误|not found/i.test(msg);
    throw new NewApiError(res.status || 502, msg, isCredential);
  }
  return body?.data as T;
}

/* ------------------------------------------------------------------ */
/* 登录 / 注册                                                          */
/* ------------------------------------------------------------------ */

/**
 * 解析登录返回。
 *
 * **完全按造物来，只认一种结构**（造物 src/lib/api.ts 的 loginOnce）：
 *     data = { access_token, access_expires_at, user }
 * 不做「经典版 data 即用户」的兼容分支 —— 两边用的是同一个网关，造物能跑，这里就能跑。
 */
export function parseAuthData(raw: unknown): NewApiAuth {
  const d = (raw ?? {}) as Record<string, unknown>;
  const token = typeof d.access_token === "string" && d.access_token ? d.access_token : null;
  if (!token) throw new NewApiError(502, "网关登录返回里没有 access_token");
  const userField = d.user as NewApiUser | undefined;
  if (!userField || typeof userField.id !== "number") {
    throw new NewApiError(502, "网关登录返回里没有可识别的用户");
  }
  const expires = Number(d.access_expires_at || 0);
  return { accessToken: token, expiresAt: expires > 0 ? expires * 1000 : 0, user: userField };
}

/**
 * 登录。用户名可以是邮箱（造物把邮箱写进 username，登录查 username OR email）。
 *
 * 大小写策略沿用造物线上验证过的做法：
 *   先原样试 → 失败且是邮箱 → 再全小写试一次。
 * 原因：写库时邮箱被小写化，而 new-api 登录是区分大小写的精确匹配；
 * 手机键盘首字母自动大写会把一批人挡在门外。
 */
export async function newApiLogin(username: string, password: string): Promise<NewApiAuth> {
  assertConfigured();
  const attempt = async (name: string) => {
    const res = await client(null).post("/api/user/login", { username: name, password });
    return parseAuthData(await unwrap<unknown>(res, "user/login"));
  };
  try {
    return await attempt(username);
  } catch (e) {
    const trimmed = username.trim();
    const lower = trimmed.toLowerCase();
    const isEmail = trimmed.includes("@");
    if (!(e instanceof NewApiError) || !e.isCredentialFailure || !isEmail || lower === trimmed) throw e;
    return attempt(lower);
  }
}

/**
 * 注册。返回新用户 id（拿不到时返回 null，由调用方回落到登录接口取）。
 *
 * 注意：new-api 的 username 被 Go binding 硬校验在 20 字符以内（编译进二进制，后台无开关），
 * 所以「邮箱当用户名」时若邮箱超过 20 字符，必须由调用方先生成一个短用户名。
 */
export async function newApiRegister(
  username: string,
  password: string,
  opts: { email?: string; affCode?: string } = {},
): Promise<{ userId: number | null; raw: unknown }> {
  assertConfigured();
  const body: Record<string, unknown> = { username, password };
  // 没开邮箱验证时 new-api 会直接丢弃这个字段，所以补写要另走 bindEmail()
  if (opts.email) body.email = opts.email;
  if (opts.affCode) body.aff_code = opts.affCode;
  const res = await client(null, { "X-Forwarded-For": "127.0.0.1" }).post("/api/user/register", body);
  const data = await unwrap<unknown>(res, "user/register");
  const d = (data ?? {}) as Record<string, unknown>;
  const id = typeof d.id === "number" ? d.id : typeof (d.user as NewApiUser | undefined)?.id === "number" ? (d.user as NewApiUser).id : null;
  return { userId: id, raw: data };
}

/* ------------------------------------------------------------------ */
/* 自助查询                                                            */
/* ------------------------------------------------------------------ */

/** 反查当前登录者（XOi 服务端拿到的是自己的 JWT，见 §C1：o_user.id == newapi uid） */
export async function newApiSelfByAdmin(uid: number): Promise<NewApiUser> {
  assertConfigured();
  const res = await client(adminToken(), { "New-Api-User": String(uid) }).get("/api/user/self");
  return await unwrap<NewApiUser>(res, "user/self");
}

/* ------------------------------------------------------------------ */
/* 用户管理（管理员令牌）                                                */
/* ------------------------------------------------------------------ */

/** 分页拉用户列表；group 为空时不加过滤（仅用于运维巡检，业务路径务必传 group） */
export async function adminListUsers(params: { page?: number; pageSize?: number; group?: string; keyword?: string } = {}): Promise<{ items: NewApiUser[]; total: number }> {
  assertConfigured();
  const res = await client(adminToken()).get("/api/user/", {
    params: {
      p: params.page ?? 1,
      page_size: params.pageSize ?? 100,
      ...(params.group ? { group: params.group } : {}),
      ...(params.keyword ? { keyword: params.keyword } : {}),
    },
  });
  type Page = { items?: NewApiUser[]; total?: number; data?: NewApiUser[] };
  const d = await unwrap<Page | NewApiUser[]>(res, "user/list");
  if (Array.isArray(d)) return { items: d, total: d.length };
  return { items: d?.items ?? d?.data ?? [], total: d?.total ?? 0 };
}

/** 取单个用户（管理视角，能拿到 quota / group / status） */
export async function adminFindUserByName(username: string): Promise<NewApiUser | null> {
  const { items } = await adminListUsers({ keyword: username, pageSize: 50 });
  const hit = items.find((x) => x.username?.toLowerCase() === username.trim().toLowerCase());
  return hit ?? items[0] ?? null;
}

/**
 * 调整额度。delta 以 quota 计（500000 quota = ¥1）。
 * 正数入账、负数扣减。返回调整后的余额（拿不到时 null）。
 */
/**
 * 管理员加减用户额度。
 *
 * ⚠️ 契约（2026-10-03 实测校正）：new-api 的 `/api/user/manage` 要的是
 *   `{ id, action: "add_quota", mode: "add" | "subtract" | "override", value: 正整数 }`
 * —— **action 是字符串动词**（同族还有 enable/disable/promote/demote/delete），
 * 不是数字。这里长期写的是 `action: 1`，网关一律回 `{"message":"Invalid parameters","success":false}`
 * （HTTP 200 但业务失败），于是**全站的额度到账路径其实一直是坏的**：
 * 充值回调、新用户赠送、签到、返还……都拿不到钱。
 * 之所以没人早发现：在线充值未开（payment_compliance_confirmed=false）、签到未开、
 * 本地也几乎没人注册，所以这条路径一直没被真正走到过。
 *
 * 报错形状也要注意：网关业务失败时 HTTP 仍是 200，必须看 body 的 success/message，
 * unwrap 已经处理了这一点。
 */
export async function adjustQuota(uid: number, delta: number): Promise<number | null> {
  assertConfigured();
  const current = await newApiSelfByAdmin(uid).catch(() => null);
  const from = typeof current?.quota === "number" ? current.quota : null;
  const res = await client(adminToken()).post("/api/user/manage", {
    id: uid,
    action: "add_quota",
    mode: delta >= 0 ? "add" : "subtract",
    value: Math.abs(Math.trunc(delta)),
  });
  await unwrap<unknown>(res, "user/manage");
  return from === null ? null : from + delta;
}

/** 封禁 / 解封。与 adjustQuota 同属 `/api/user/manage`：action 是**字符串动词**（enable / disable），
 *  不是数字 + status 字段 —— 旧写法同样会拿到 Invalid parameters。 */
export async function adminSetUserStatus(uid: number, enabled: boolean): Promise<void> {
  assertConfigured();
  const res = await client(adminToken()).post("/api/user/manage", { id: uid, action: enabled ? "enable" : "disable" });
  await unwrap<unknown>(res, "user/manage(status)");
}

/** 团队模式：以站长身份创建一个真实 NewAPI 成员账号。 */
export async function adminCreateUser(username: string, password: string, displayName: string): Promise<void> {
  assertConfigured();
  const res = await client(adminToken()).post("/api/user/", {
    username,
    password,
    display_name: displayName.trim().slice(0, 20),
  });
  await unwrap<unknown>(res, "user/create");
}

/** 团队模式：管理员修改成员密码。NewAPI PUT 要求携带原用户字段，所以先读后改。 */
export async function adminUpdateUser(uid: number, patch: { password?: string; display_name?: string; group?: string }): Promise<void> {
  assertConfigured();
  const current = await unwrap<Record<string, unknown>>(await client(adminToken()).get(`/api/user/${uid}`), "user/get");
  const res = await client(adminToken()).put("/api/user/", {
    ...current,
    id: uid,
    password: patch.password ?? "",
    ...(patch.display_name ? { display_name: patch.display_name } : {}),
    ...(patch.group ? { group: patch.group } : {}),
  });
  await unwrap<unknown>(res, "user/update");
}

/** 团队模式：删除真实 NewAPI 成员账号。 */
export async function adminDeleteUser(uid: number): Promise<void> {
  assertConfigured();
  const res = await client(adminToken()).post("/api/user/manage", { id: uid, action: "delete" });
  await unwrap<unknown>(res, "user/manage(delete)");
}

/**
 * 把 new-api 的 user 映射成 XOi 本地角色。
 * 约定：网关 role >= 10 视为管理员（与造物 reseller 的判定口径一致）。
 */
export function roleFromNewApi(u: NewApiUser): "admin" | "user" {
  return (u.role ?? 0) >= 10 ? "admin" : "user";
}

/* ------------------------------------------------------------------ */
/* 邮箱直连 PG 补写                                                     */
/* ------------------------------------------------------------------ */

let pgPool: unknown = null;

/**
 * 直连 new-api 的 PostgreSQL 写 users.email。
 *
 * 为什么不用管理员接口：造物线上的教训——传 email 会返回 success 但库里不改（假成功）。
 * 要启用本函数，需要：
 *   1. `yarn add pg`
 *   2. 配置 NEWAPI_PG_URL（如 postgres://user:pwd@127.0.0.1:5432/new-api）
 * 未配置时返回 false，不抛错——注册流程不该因为邮箱绑不上而失败。
 */
export async function bindEmail(uid: number, email: string): Promise<boolean> {
  const url = (process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL || "").trim();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (!url) {
    console.warn("[newapi] 未配置 NEWAPI_PG_URL，跳过邮箱补写（邮箱将仅作为注册字段，无法用于登录）");
    return false;
  }
  try {
    if (!pgPool) {
      // 动态加载：没装 pg 的项目也能编译通过
      const mod = (await import(/* webpackIgnore: true */ "pg")) as unknown as { Pool: new (c: { connectionString: string }) => { query: (q: string, v: unknown[]) => Promise<unknown> } };
      pgPool = new mod.Pool({ connectionString: url });
    }
    const pool = pgPool as { query: (q: string, v: unknown[]) => Promise<unknown> };
    await pool.query("UPDATE users SET email = $1 WHERE id = $2", [normalized, uid]);
    return true;
  } catch (e) {
    console.error("[newapi] 邮箱补写失败:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** 校验邮箱是否已被占用（同样需要 NEWAPI_PG_URL；未配置时返回 false=不阻断） */
export async function emailTaken(email: string): Promise<boolean> {
  const url = (process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL || "").trim();
  const normalized = email.trim().toLowerCase();
  if (!url || !normalized) return false;
  try {
    if (!pgPool) {
      const mod = (await import(/* webpackIgnore: true */ "pg")) as unknown as { Pool: new (c: { connectionString: string }) => { query: (q: string, v: unknown[]) => Promise<{ rows: unknown[] }> } };
      pgPool = new mod.Pool({ connectionString: url });
    }
    const pool = pgPool as { query: (q: string, v: unknown[]) => Promise<{ rows: unknown[] }> };
    const r = await pool.query("SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1", [normalized]);
    return r.rows.length > 0;
  } catch (e) {
    console.error("[newapi] 邮箱查重失败:", e instanceof Error ? e.message : e);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 契约探测（不花钱、不写数据）                                          */
/* ------------------------------------------------------------------ */

export interface ContractReport {
  reachable: boolean;
  baseURL: string;
  status?: { version?: string; data?: unknown };
  loginShape?: string;
  notes: string[];
}

/**
 * 探测线上 new-api 是否可达、配置是否齐全。
 *
 * 只打 /api/status（公开只读）和一个「必然失败」的登录请求，
 * **不产生任何额度消耗，也不会创建账号** —— 满足「不花钱测试连通」的要求。
 *
 * 注意：这里不再探测「登录返回结构有哪些版本」。以造物为准，就一种结构：
 * `data = { access_token, access_expires_at, user }`。
 */
export async function probeContract(): Promise<ContractReport> {
  const notes: string[] = [];
  const report: ContractReport = { reachable: false, baseURL: baseURL(), notes };
  try {
    const s = await client(null).get("/api/status");
    report.reachable = s.status < 500;
    report.status = { data: s.data };
    notes.push(`/api/status → HTTP ${s.status}`);
  } catch (e) {
    notes.push(`/api/status 不可达：${e instanceof Error ? e.message : String(e)}`);
    return report;
  }

  // 故意用不存在的用户名探测（不会创建用户、不计费），只确认错误信封可解析。
  // 失败登录本来就不会返回 access_token，不能据此误报“登录结构不兼容”。
  try {
    const r = await client(null).post("/api/user/login", { username: "__xoi_probe__", password: "__xoi_probe__" });
    const body = r.data as Envelope<unknown> | undefined;
    report.loginShape = "成功登录时由 parseAuthData 严格校验 JWT 结构";
    notes.push(`失败登录信封 → HTTP ${r.status}${body?.message ? `，message=${body.message}` : ""}`);
  } catch (e) {
    notes.push(`登录探测失败：${e instanceof Error ? e.message : String(e)}`);
  }

  if (!adminToken()) notes.push("NEWAPI_ADMIN_TOKEN 未配置：注册 / 额度调整将不可用");
  if (!process.env.NEWAPI_DATABASE_URL && !process.env.NEWAPI_PG_URL) notes.push("NEWAPI_DATABASE_URL / NEWAPI_PG_URL 未配置：邮箱补写不可用");
  return report;
}
