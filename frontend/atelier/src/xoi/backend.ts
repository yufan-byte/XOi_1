/**
 * 后端(宿主 Express)访问层：统一附带 JWT、JSON 编解码与错误处理。
 * 全部走同源相对路径（dev 由 Vite 代理 /api → 10588，生产同体托管）。
 */

import { getAuthToken, getVerifiedToken } from "@/xoi/owner";

export class BackendError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers || {});
    const token = getAuthToken();
    const raw = token.replace(/^(Bearer\s+)+/i, "").trim();
    if (!raw || raw !== getVerifiedToken()) throw new BackendError(401, "登录账号已切换，请刷新画布");
    headers.set("Authorization", token);
    return fetch(path, { ...init, headers });
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
    return resp.json() as Promise<T>;
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
    return resp.json();
}
