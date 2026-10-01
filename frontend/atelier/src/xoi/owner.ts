/**
 * XOi 宿主身份适配：解析登录用户并给本地存储按用户分桶。
 *
 * 本应用整体跑在宿主(Vue)项目的同源 iframe 里：
 * - JWT 存于共享 localStorage 的 `token` 键（宿主约定：值已含 "Bearer " 前缀）
 * - main.tsx 在挂载前 await initOwner()，此后所有 store 模块才被加载，
 *   因此各存储 key 常量在求值时即可拿到正确的 owner 分桶后缀。
 */

const ANON_TAG = "anon";

let ownerTag = ANON_TAG;
let initPromise: Promise<string> | null = null;

export function getOwnerTag(): string {
    return ownerTag;
}

/** localStorage 数据键：按用户分桶（画布/配置/素材等数据类存储用） */
export function ownerKey(base: string): string {
    return `${base}:u${ownerTag}`;
}

/** IndexedDB 库名：按用户分库，防多账号同浏览器串数据 */
export function ownerDbName(base: string): string {
    return `xoi-atelier-${ownerTag}:${base}`;
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

/** 解析当前登录用户（GET /api/auth/me）；失败/超时/未登录一律落 anon 桶，不阻塞启动 */
export function initOwner(timeoutMs = 4000): Promise<string> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        try {
            const token = getAuthToken();
            if (token) {
                const resp = await fetchWithTimeout("/api/auth/me", { headers: { Authorization: token } }, timeoutMs);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data?.user?.id != null) ownerTag = `u${data.user.id}`;
                }
            }
        } catch {
            // 保持 anon 桶
        }
        return ownerTag;
    })();
    return initPromise;
}
