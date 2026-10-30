/**
 * 后端(宿主 Express)访问层：统一 JSON 编解码与错误处理。
 * 全部走同源相对路径（dev 由 Vite 代理 /api → 12121，生产同体托管）。
 *
 * F3：不再手工拼 Authorization —— 凭据在 httpOnly `xoi_session` cookie 里，
 * 同源请求浏览器会自动带上，画布里也拿不到（也不该拿）JWT 原文。
 */

import { getAuthToken, getVerifiedToken, assertCanvasAccount } from "@/xoi/owner";

export class BackendError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers || {});
    // 换号检测：会话信号变了说明已经在别处换了账号，本次结果一律作废。
    if (getAuthToken() !== getVerifiedToken()) throw new BackendError(401, "登录账号已切换，请刷新画布");
    headers.set("X-Xoi-Expected-User", assertCanvasAccount().split(":")[0]);
    const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
    assertCanvasAccount();
    if (response.status === 401) {
        // 会话过期：广播出去，让桥接层把**整个宿主页面**带去登录页。
        // 画布里的 401 只会显示成一团 JSON，用户根本不知道要重新登录。
        try {
            window.dispatchEvent(new CustomEvent("xoi:session-expired"));
        } catch {
            /* 非浏览器环境忽略 */
        }
    }
    return response;
}

export async function backendJson<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const { json, ...rest } = init;
    const headers = new Headers(rest.headers || {});
    let body = rest.body;
    if (json !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(json);
    }
    const resp = await backendFetch(path, { ...rest, headers, body });
    if (!resp.ok) {
        let detail = `HTTP ${resp.status}`;
        try {
            const data = await resp.json();
            // 宿主后端错误体惯用 {error} / {message} / {detail} 三种字段（canvas-stubs 多为 {error}）
            detail = [data?.detail, data?.message, data?.error].find((value) => typeof value === "string" && value) || detail;
        } catch {
            /* 非 JSON 错误体 */
        }
        throw new BackendError(resp.status, detail);
    }
    const result = await resp.json(); assertCanvasAccount(); return result as T;
}

/** 二进制上传（POST /api/canvas-files），返回后端伺服 URL */
export async function backendUploadFile(blob: Blob, ext: string): Promise<{ url: string; bytes: number }> {
    const resp = await backendFetch(`/api/canvas-files?ext=${encodeURIComponent(ext)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
    });
    if (!resp.ok) {
        let detail = `HTTP ${resp.status}`;
        try {
            detail = (await resp.json())?.detail || detail;
        } catch {
            /* ignore */
        }
        throw new BackendError(resp.status, detail);
    }
    const result = await resp.json(); assertCanvasAccount(); return result;
}
