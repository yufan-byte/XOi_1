/**
 * 会话工具（主站 Vue）—— F3：JWT 不再落 localStorage
 *
 * 改造前：登录接口回的 token 被平铺写进 localStorage.token，任何同源 XSS 都能读走并
 * 持久化复用 24h = 完整账号接管。
 * 改造后：凭据只存在于两个地方 ——
 *   1. 后端下发的 httpOnly cookie（持久，JS 读不到）；
 *   2. 本模块的内存变量（仅当前页面生命周期有效，刷新即失）。
 *
 * localStorage 里只留一个**非敏感**的「会话信号」`xoi_session`（形如 `8:kx3f9a2b`）：
 *  - 用途：判断「账号是否被切换 / 是否还登着」，给路由守卫和防串号机制当比较基准；
 *  - 它不含任何可复用的凭据，被 XSS 读到也无法拿去调接口。
 *
 * 兼容期约定：
 *  - `legacyToken()` 读老的 localStorage.token，用于把存量会话迁移成 cookie（见 sessionBootstrap）；
 *  - `authHeaders()` 有内存凭据就带 Authorization，没有就交给同源 cookie 兜底。
 */

/** 会话信号键（非敏感）。值与 `frontend/console`、`frontend/atelier` 共享。 */
export const SESSION_SIGNAL_KEY = "xoi_session";
/** 历史遗留的凭据键，仅用于迁移与清理。 */
const LEGACY_TOKEN_KEY = "token";

/** 内存里的凭据原文。页面刷新后为空 —— 此时一律靠 cookie。 */
let memoryToken = "";

/** 当前页面的内存凭据（可能为空；空不代表未登录，cookie 仍然有效）。 */
export function sessionToken(): string {
  return memoryToken;
}

/** 登录 / 注册成功后把凭据放进内存。**不要**再写 localStorage。 */
export function setSessionToken(token: string): void {
  memoryToken = String(token || "");
}

/** 非敏感会话信号。空串 = 本地认为未登录。 */
export function sessionSignal(): string {
  try {
    return localStorage.getItem(SESSION_SIGNAL_KEY) || "";
  } catch {
    return "";
  }
}

/** 从会话信号里取 uid（信号形如 `8:nonce`）。 */
export function sessionUserId(): string {
  const id = (sessionSignal().split(":")[0] || "").trim();
  return /^[1-9]\d*$/.test(id) ? id : "";
}

/** 登录成功后写信号：uid + 一次性随机数，保证「同一账号重新登录」也会被识别成换号。 */
export function writeSessionSignal(id: string | number): string {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const signal = `${id}:${nonce}`;
  try {
    localStorage.setItem(SESSION_SIGNAL_KEY, signal);
  } catch {
    /* 隐私模式等存储不可用场景：降级为纯内存态，cookie 仍能维持登录 */
  }
  return signal;
}

/** 老版本的持久化凭据（含 "Bearer " 前缀）。迁移完成后会被删掉。 */
export function legacyToken(): string {
  try {
    return localStorage.getItem(LEGACY_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

/** 清空本机会话状态（内存凭据 + 会话信号 + 残留的老凭据）。cookie 由后端负责清除。 */
export function clearSession(): void {
  memoryToken = "";
  try {
    localStorage.removeItem(SESSION_SIGNAL_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* 忽略存储不可用 */
  }
}

/**
 * 手工拼 fetch/Request 时用。有内存凭据就带 Authorization（兼容老后端/跨域场景），
 * 没有就返回空对象 —— 同源请求会自动带上 httpOnly cookie，无需再拼 header。
 */
export function authHeaders(): Record<string, string> {
  return memoryToken ? { Authorization: memoryToken } : {};
}
