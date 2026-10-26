/**
 * XOi 宿主身份适配：解析登录用户并给本地存储按用户分桶。
 *
 * 本应用整体跑在宿主(Vue)项目的同源 iframe 里：
 * - JWT 存于共享 localStorage 的 `token` 键（宿主约定：值已含 "Bearer " 前缀）
 * - main.tsx 在挂载前 await initOwner()，此后所有 store 模块才被加载，
 *   因此各存储 key 常量在求值时即可拿到正确的 owner 分桶后缀。
 */

let ownerTag = "";
let verifiedToken = "";
let initPromise: Promise<string> | null = null;

export function getOwnerTag(): string {
    if (!ownerTag) throw new Error("画布尚未验证登录身份");
    return ownerTag;
}

export function getVerifiedToken(): string {
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

/** 宿主共享 JWT（已含 Bearer 前缀，直接放入 Authorization 头即可） */
export function getAuthToken(): string {
    try {
        return window.localStorage.getItem("token") || "";
    } catch {
        return "";
    }
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
        const token = getAuthToken();
        if (!token) throw new Error("请先登录后使用无限画布");
        const resp = await fetchWithTimeout("/api/auth/me", { headers: { Authorization: token } }, timeoutMs);
        if (!resp.ok) throw new Error("登录身份验证失败，请重新登录");
        const data = await resp.json();
        const userId = Number(data?.user?.id);
        if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("登录身份无效，无法加载画布");
        if (getAuthToken() !== token) throw new Error("登录账号已切换，请刷新画布");
        ownerTag = `u${userId}`;
        verifiedToken = token.replace(/^(Bearer\s+)+/i, "").trim();
        return ownerTag;
    })().catch((error) => {
        initPromise = null;
        throw error;
    });
    return initPromise;
}
