/**
 * XOi 宿主身份适配：解析登录用户并给本地存储按用户分桶。
 *
 * 本应用整体跑在宿主(Vue)项目的同源 iframe 里：
 * - **凭据**在后端下发的 httpOnly `xoi_session` cookie 里（同源请求自动携带，JS 读不到）；
 * - 本地只留非敏感的**会话信号** `xoi_session`（`uid:nonce`），用于「换号/登出」检测；
 * - main.tsx 在挂载前 await initOwner()，此后所有 store 模块才被加载，
 *   因此各存储 key 常量在求值时即可拿到正确的 owner 分桶后缀。
 */

/** 与主站 frontend/src/utils/session.ts 共用同一个键（同源共享 localStorage）。 */
const SESSION_SIGNAL_KEY = "xoi_session";

let ownerTag = "";
let verifiedToken = "";
let initPromise: Promise<string> | null = null;

function readSessionSignal(): string {
    try {
        return window.localStorage.getItem(SESSION_SIGNAL_KEY) || "";
    } catch {
        return "";
    }
}

/** 本地信号缺失（清过缓存/直接落到画布）时就地补回，避免整页被判定成未登录。 */
function writeSessionSignal(userId: number): string {
    const signal = `${userId}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    try {
        window.localStorage.setItem(SESSION_SIGNAL_KEY, signal);
    } catch {
        /* 存储不可用：仍返回内存值，本次页面可用 */
    }
    return signal;
}

export function getOwnerTag(): string {
    if (!ownerTag) throw new Error("画布尚未验证登录身份");
    return ownerTag;
}

export function getVerifiedToken(): string {
    return verifiedToken;
}
export function assertCanvasAccount() {
    if (!verifiedToken || readSessionSignal() !== verifiedToken) throw new Error("账号已切换，请重新打开画布");
    return verifiedToken;
}

/** localStorage 数据键：按用户分桶（画布/配置/素材等数据类存储用） */
export function ownerKey(base: string): string {
    return `${base}:u${getOwnerTag()}`;
}

/** IndexedDB 库名：按用户分库，防多账号同浏览器串数据 */
export function ownerDbName(base: string): string {
    return `xoi-atelier-${getOwnerTag()}:${base}`;
}

/**
 * 宿主共享的**非敏感**会话信号（`uid:nonce`）。
 *
 * ⚠️ 它**不是凭据**：F3 之后 JWT 只在 httpOnly cookie 里。这里保留这个函数是因为
 * 上游画布拿它当「账号是否切换」的比较基准（token 字段名沿用，语义已变）。
 */
export function getAuthToken(): string {
    return readSessionSignal();
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** 只有服务端确认身份后才允许加载任何画布 store；绝不回退到共享匿名桶。 */
export function initOwner(timeoutMs = 4000): Promise<string> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        // F3：凭据在 httpOnly cookie 里（同源 iframe 自动携带），不再拼 Authorization 头。
        const resp = await fetchWithTimeout("/api/auth/me", { credentials: "same-origin", cache: "no-store" }, timeoutMs);
        if (resp.status === 401 || resp.status === 403) throw new Error("请先登录后使用无限画布");
        if (!resp.ok) throw new Error("登录身份验证失败，请重新登录");
        const data = await resp.json();
        const userId = Number(data?.user?.id ?? data?.id);
        if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("登录身份无效，无法加载画布");
        const current = readSessionSignal();
        if (current && current.split(":")[0] !== String(userId)) throw new Error("登录账号已切换，请刷新画布");
        ownerTag = `u${userId}`;
        // 没有信号就补一个；有信号则沿用（后续比较都以它为准）。
        verifiedToken = current || writeSessionSignal(userId);
        return ownerTag;
    })().catch((error) => {
        initPromise = null;
        throw error;
    });
    return initPromise;
}
