/**
 * 控制台的鉴权客户端
 * =====================================================================
 * 契约与 XOi 主站（Vue）完全一致，指向 XOI 后端自身：
 *     POST /api/login/login      { username, password }        → { token, id, name, display_id, role }
 *     POST /api/login/register   { username, password, email?, aff_code? }
 *     GET  /api/login/captcha    → { id, svg }（数字图形验证码）
 *
 * XOi 后端再往上是 new-api（见 backend/src/utils/newapi.ts）。
 * 控制台永远不直连 new-api —— 这样同源、无跨域、无 SameSite 问题。
 *
 * 【会话交接】XOI 主站的 pinia store 直接读 localStorage 的 5 个平铺键：
 *     token / role / userId / displayId / username
 * 登录成功后必须把它们写进去，主站才不会认为没登录。
 * （翻主站源码：frontend/src/stores/user.ts 与 frontend/src/utils/axios.ts）
 */

import {
    authHeaders,
    clearSessionState,
    sessionExpiresAt,
    sessionSignal,
    sessionToken,
    setSessionExpiresAt,
    setSessionToken,
    writeSessionSignal,
} from "./session";

export interface AuthState {
    accessToken: string;
    expiresAt: number;
    user: ConsoleUser;
}

/** 主站约定的 localStorage 键，改动前请同步 frontend/src/stores/user.ts */
const LS = {
    token: "token",
    role: "role",
    userId: "userId",
    displayId: "displayId",
    username: "username",
} as const;

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        /** 后端返回的「需要验证码」附载 */
        public payload?: Record<string, unknown>,
        /** 后端 HTTP 状态码（461 = 验码闸门） */
        public code?: number,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

/** 登录接口返回的原始结构（XOI 后端 success 外壳里的 data） */
interface LoginPayload {
    token: string;
    name: string;
    id: number | string;
    display_id?: string;
    role?: string;
}

/** 写会话：凭据进内存（持久那份由后端 httpOnly cookie 持有），localStorage 只写非敏感影子键 */
export function writeSession(p: LoginPayload): AuthState {
    if(!p||typeof p.token!=="string"||!p.token.trim()||!Number.isSafeInteger(Number(p.id))||Number(p.id)<1)throw new ApiError(502,"登录响应不完整，未保存登录状态，请稍后重试");
    const token = p.token.startsWith("Bearer ") ? p.token : `Bearer ${p.token}`;
    // F3：媒体授权 cookie 现在由后端在登录响应里一并下发，前端**不能**再手动清
    // xoi_media_owner —— 那会把刚下发的凭据当场删掉，私有素材全部 403。
    const expiresAt = Date.now() + 24 * 3600 * 1000;
    try {
        setSessionToken(token);
        writeSessionSignal(p.id);
        setSessionExpiresAt(expiresAt);
        localStorage.setItem(LS.role, p.role || "user");
        localStorage.setItem(LS.userId, String(p.id));
        localStorage.setItem(LS.displayId, p.display_id || "");
        localStorage.setItem(LS.username, p.name || "");
    } catch {
        // The destination app reads these keys: silently succeeding would create a login loop.
        clearSession();
        throw new ApiError(503, "浏览器无法保存登录状态，请允许本站存储后重试，或退出隐私模式");
    }
    const roleNum = p.role === "admin" ? 10 : 1;
    return {
        accessToken: token,
        expiresAt,
        user: {
            id: Number(p.id),
            username: p.name,
            display_name: p.name,
            email: "",
            quota: 0,
            used_quota: 0,
            role: roleNum,
            group: "xoi",
        },
    };
}

export function clearSession() {
    document.cookie='xoi_media_owner=; Path=/oss; SameSite=Lax; Max-Age=0';
    try {
        for (const k of Object.values(LS)) localStorage.removeItem(k);
    } catch {
        /* 忽略 */
    }
    // 会话信号 / 过期时间 / 老版本残留凭据一并清干净
    clearSessionState();
}

export function hasSession(): boolean {
    // F3：本地只剩「会话信号」，凭据在 httpOnly cookie 里。
    // 信号存在即认为有会话；记录的过期时间只用来避免明显过期的假登录态，
    // 真正的失效判定永远交给服务端 401（api() 会清会话并广播 xoi:unauthorized）。
    if (!sessionSignal()) return false;
    const expiresAt = sessionExpiresAt();
    return !expiresAt || expiresAt > Date.now();
}

async function parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    let body: unknown = null;
    try {
        body = JSON.parse(text);
    } catch {
        body = text;
    }
    const b = body as { success?: boolean; message?: string; data?: T; code?: number };
    if (!res.ok || (b && typeof b === "object" && b.success === false)) {
        const data = (b?.data ?? {}) as Record<string, unknown>;
        throw new ApiError(res.status, b?.message || `HTTP ${res.status}`, data, (b?.code as number) ?? res.status);
    }
    return (b && typeof b === "object" && "data" in b ? (b.data as T) : (body as T)) as T;
}

/** 登录。返回的 user 供 zustand 保存；localStorage 已在此写好，主站可无缝接手。 */
export async function login(username: string, password: string, extra?: { captchaId?: string; captchaInput?: string }): Promise<AuthState> {
    const extraHeaders: Record<string, string> = {};
    const res = await fetch("/api/login/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders },
        credentials: "include",
        signal:AbortSignal.timeout(15000),
        body: JSON.stringify({
            username: username.trim(),
            password,
            ...(extra?.captchaId ? { captchaId: extra.captchaId, captchaInput: extra.captchaInput } : {}),
        }),
    });
    const data = await parse<LoginPayload>(res);
    return writeSession(data);
}

export interface RegisterResult extends AuthState {
    /** 邮箱是否真的绑上（false 时前端要让用户记住登录名）。
     *  字段名与后端一致，便于上游组件零改动 —— 见 components/signup/auth-stage.tsx。 */
    email_bound: boolean;
    /** 邮箱超过 20 字符时服务端生成的登录名 */
    fallbackName?: string;
}

/** 注册（注册即登录） */
export async function register(
    username: string,
    password: string,
    email?: string,
    affCode?: string,
    extra?: { captchaId?: string; captchaInput?: string },
): Promise<RegisterResult> {
    const res = await fetch("/api/login/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            username: username.trim(),
            password,
            ...(email ? { email } : {}),
            ...(affCode ? { aff_code: affCode } : {}),
            ...(extra?.captchaId ? { captchaId: extra.captchaId, captchaInput: extra.captchaInput } : {}),
        }),
    });
    const raw = (await parse<LoginPayload & { email_bound?: boolean; fallback_name?: string }>(res)) ?? ({} as LoginPayload);
    const auth = writeSession(raw);
    return { ...auth, email_bound: raw.email_bound !== false, fallbackName: raw.fallback_name };
}

/** 取一张新的数字图形验证码（未登录也能拿，「换一张」按钮用） */
export async function fetchCaptcha(): Promise<{ id: string; svg: string }> {
    const res = await fetch("/api/login/captcha", { credentials: "include", cache: "no-store" });
    return parse<{ id: string; svg: string }>(res);
}

/** 退出登录：让后端把 session_version +1（凭据立即作废）并清 cookie，再清本地 */
export async function logout(): Promise<void> {
    const signal = sessionSignal();
    try {
        // F3：不需要也不再可能自带 Authorization —— 凭据在 httpOnly cookie 里，同源请求自动携带。
        await fetch("/api/login/logout", { method: "POST", credentials: "include" });
    } catch {
        /* 网络失败也要清本地 */
    }
    // 期间若已经换了账号，就别把新会话清掉。
    if (sessionSignal() === signal) clearSession();
}

/* ==================================================================
 * 造物 reseller 兼容层
 * ==================================================================
 * 为什么需要这一层：
 *   造物的 `src/lib/api.ts` 是**直连 new-api** 的 —— AuthState 存在 localStorage
 *   的 `mc.auth`，请求打 `/api/user/*`、`/api/token/*`，用 `New-Api-User` 头。
 *   而 XOi 控制台是**打 XOi 自己的 Express** —— 会话是 localStorage 的 5 个平铺键，
 *   请求打 `/api/login/*`，用 `Authorization: <token>`。
 *
 *   从造物拷过来的 reseller 组件（27 个）依赖下面这几个同名导出：
 *       api / getPricing / loadAuth / refreshAuth
 *   （实测：只有这 4 个，见 ADMIN-PORT.md 第三节）
 *
 *   所以这里**保持签名一致、换掉实现**，让上游组件一行都不用改。
 *   真正的鉴权/额度逻辑全在 XOI 后端，控制台不直连 new-api（避免跨域与双扣）。
 * ================================================================== */

/** 造物侧的用户形状。reseller 组件按名字取用，字段名与造物保持一致。 */
/**
 * 与造物 src/lib/api.ts 的 NewApiUser 对齐：关键字段必填（quota/role 等直接参与
 * reseller 后台的算账与鉴权分支，可选会让整条链路布满 undefined 守卫）。
 * XOi 侧构造点（writeSession / loadAuth）对缺失字段填安全默认值。
 */
export interface NewApiUser {
    id: number;
    username: string;
    display_name: string;
    email: string;
    quota: number;
    used_quota: number;
    group: string;
    role: number;
    /** XOi: 造物 reseller 组件会读这些推广/展示字段 */
    avatar?: string;
    aff_code?: string;
    aff_count?: number;
    aff_quota?: number;
    aff_history_quota?: number;
    inviter_id?: number;
}

/** XOi: 旧名兼容（登录链路里的用户形状现在与造物一致） */
export type ConsoleUser = NewApiUser;

/**
 * 读会话。
 *
 * ⚠️ 与造物的差异：**不做客户端过期判断**。
 *   造物那边 `expiresAt` 来自 JWT 的 `access_expires_at`，外壳组件会据此提前刷新；
 *   XOI 的 JWT 是由 Express 自己签的、且**服务端有 `session_version` 兜底**
 *   （踢下线是 +1，旧 token 立刻失效），客户端猜过期时间没有意义还会误判。
 *   所以这里给一个极大的 expiresAt，让上游的「快过期就刷新」分支永不触发；
 *   真正失效时由下面的 `api()` 收到 401 → 清会话 + 广播 `xoi:unauthorized`。
 */
export function loadAuth(): AuthState | null {
    // F3：本地凭据已不存在，登录态的唯一本地依据是「会话信号」。
    if (!sessionSignal()) return null;
    let role = "user";
    let userId = 0;
    let username = "";
    let displayId = "";
    try {
        role = localStorage.getItem(LS.role) || "user";
        userId = Number(localStorage.getItem(LS.userId) || 0);
        username = localStorage.getItem(LS.username) || "";
        displayId = localStorage.getItem(LS.displayId) || "";
    } catch {
        /* 隐私模式：能拿到信号就继续，其余用默认值 */
    }
    const expiresAt = sessionExpiresAt();
    return {
        // 刷新后内存凭据为空：此时请求靠同源 cookie 认证（见 authHeaders()）。
        accessToken: sessionToken(),
        expiresAt: expiresAt || Number.MAX_SAFE_INTEGER,
        user: {
            id: userId,
            username: username || String(displayId || userId),
            display_name: username,
            email: "",
            quota: 0,
            used_quota: 0,
            role: role === "admin" ? 10 : 1,
            group: "xoi",
        },
    };
}

/** 写会话。字段与 `writeSession` 一致，供上游组件在本地更新用户信息后回写。 */
export function saveAuth(a: AuthState | null): void {
    if (!a) {
        clearSession();
        return;
    }
    try {
        // F3：只有「本次页面内真的拿到了凭据」才更新内存；持久化交给 cookie。
        if (a.accessToken) setSessionToken(a.accessToken);
        localStorage.setItem(LS.role, a.user.role && a.user.role >= 10 ? "admin" : "user");
        localStorage.setItem(LS.userId, String(a.user.id));
        localStorage.setItem(LS.username, a.user.username || "");
    } catch {
        /* 忽略 */
    }
}

/**
 * 刷新会话。
 *
 * XOI 后端**没有 refresh 端点**（不需要：token 24 小时有效，失效靠 session_version）。
 * 所以这里退化成「拉一次 self 验证会话还有效」：
 *   · 有效 → 把服务端返回的最新信息回写，返回 AuthState
 *   · 失效/网络错误 → 返回 null（上游据此跳登录页）
 */
export async function refreshAuth(): Promise<AuthState | null> {
    const current = loadAuth();
    if (!current) return null;
    const signal = sessionSignal();
    try {
        const me = await getSelf();
        if(sessionSignal()!==signal)return null;
        const next: AuthState = {
            ...current,
            user: { ...current.user, ...me, id: me.id ?? current.user.id },
        };
        saveAuth(next);
        return next;
    } catch {
        return null;
    }
}

/**
 * 带鉴权的二进制下载（团队账号清单 Excel）。
 *
 * 不能直接用 `<a href>`：导出要求 `X-Xoi-Sudo` 请求头，浏览器导航加不上自定义头。
 * 所以这里 fetch 成 Blob 再落盘 —— 全程同源 + `credentials:"include"`，
 * 会话凭据仍走 httpOnly cookie，明文不经过 localStorage。
 */
export async function authedDownload(path: string, sudoToken?: string): Promise<Blob> {
    const headers: Record<string, string> = { ...authHeaders() };
    if (sudoToken) headers["X-Xoi-Sudo"] = sudoToken;
    const res = await fetch(path, { headers, credentials: "include", cache: "no-store" });
    if (!res.ok) {
        let message = `下载失败（${res.status}）`;
        try {
            const body = (await res.json()) as { message?: string };
            if (body?.message) message = body.message;
        } catch { /* 非 JSON 响应就用默认文案 */ }
        throw new Error(message);
    }
    return res.blob();
}

/**
 * 管理面 API（对 XOI Express）。
 *
 * 与造物同名函数的区别只有两点：请求头用 XOI 的 `Authorization: <token>`（token 里
 * 已经带 `Bearer ` 前缀，由 writeSession 保证），以及 401 时的处理。
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    // F3：凭据从内存取（刷新后为空 → 交给同源 httpOnly cookie）；换号检测改看会话信号。
    const signal = sessionSignal();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    const res = await fetch(path, { ...init, headers, credentials: "include" });
    if(sessionSignal()!==signal)throw new DOMException('账号已切换，已忽略旧请求','AbortError');
    if (res.status === 401) {
        // 会话没了就把本地清干净并广播：否则界面仍显示已登录，
        // 而后续请求会一路 401（与造物 `mc:unauthorized` 的做法一致）。
        clearSession();
        try {
            window.dispatchEvent(new CustomEvent("xoi:unauthorized"));
        } catch {
            /* SSR / 隐私模式 */
        }
        throw new ApiError(401, "登录已过期，请重新登录");
    }
    const value=await parse<T>(res);
    if(sessionSignal()!==signal)throw new DOMException('账号已切换，已忽略旧请求','AbortError');
    return value;
}

/** 当前登录者 + 实时余额（XOI 形状：`role` 是 "user"/"admin" 字符串，quota 为 new-api 原始单位） */
export const getSelf = () => api<NewApiUser & { display_id?: string; balance?: number | null; points?: number | null; user_group?: string | null; balance_unavailable?: boolean }>("/api/login/self");

/**
 * 价格表。
 *
 * 后端 `routes/pricing.ts` 已挂 `/api/pricing`（公开只读，代取网关定价），无需鉴权 —— 与下面实现一致。
 */
export interface PricingResponse {
    // XOi: 对齐造物 —— data 是 PricingRow[]（lib/models.ts），models-center 的 buildCatalog 依赖它
    data: import("./models").PricingRow[];
    group_ratio: Record<string, number>;
    usable_group: Record<string, string>;
    success: boolean;
}
export async function getPricing(): Promise<PricingResponse> {
    const res = await fetch("/api/pricing", { cache: "no-store" });
    return (await res.json()) as PricingResponse;
}

/**
 * 生成令牌缓存清理。
 *
 * 造物会给每个用户签发 new-api 子令牌并缓存在 localStorage 的 `mc.sk.*`。
 * **XOI 不签发子令牌**（计费铁律：只用一个站点级令牌，绝不给用户发子令牌 —— 那会双扣），
 * 所以这里是有意的空实现，只为让上游的「登出时清理」调用点不用改。
 */
export function clearSkCache(): void {
    /* 有意为空：XOI 不签发用户级 sk- 令牌 */
}

/** 清掉本机留下的 XOI 本地缓存（退出登录时调用） */
export function clearLocalWorks(): void {
    try {
        const dead: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith("xoi.canvas.") || k.startsWith("xoi.profile."))) dead.push(k);
        }
        dead.forEach((k) => localStorage.removeItem(k));
    } catch {
        /* 隐私模式 */
    }
}
