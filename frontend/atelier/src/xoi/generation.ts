/**
 * XOi 服务端生成通道：图片/视频/文本统一提交宿主后端任务接口（canvas-stubs.ts 契约）。
 *   POST /api/canvas-image-tasks → { task_id, pointsDeducted, balance }；GET /:task_id → { status, result, error }
 *   POST /api/canvas-video       → 同上；GET /api/canvas-video/:task_id
 *   POST /api/canvas-llm         → { text, pointsDeducted, balance }（非流式，整段返回）
 * 后端提交即事务性预扣积分，失败路径由其 CAS 终态仲裁全额退还；前端只在提交响应处提示一次。
 */

import { message as staticMessage } from "antd";

import i18n from "@/i18n";
import { BackendError, backendJson } from "@/xoi/backend";
import type { ReferenceImage } from "@/types/image";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type ServerTaskSubmit = { task_id: string; pointsDeducted?: number | null; balance?: number | null };
export type ServerTaskState = { status: "running" | "succeeded" | "failed"; result?: Record<string, any>; error?: string };

/** 提示器默认走 antd 静态方法；宿主组件可用 setPointsNotifier 注入 App.useApp() 实例以获得主题上下文。 */
let notifyText = (text: string): unknown => staticMessage.info(text);
export function setPointsNotifier(notify: (text: string) => unknown) {
    notifyText = notify;
}

export function notifyPointsDeducted(deducted?: number | null, balance?: number | null) {
    if (!deducted || deducted <= 0) return;
    const balanceText = typeof balance === "number" ? i18n.t("apiPoints.balance", { balance }) : "";
    notifyText(i18n.t("apiPoints.deducted", { points: deducted }) + (balanceText ? `，${balanceText}` : ""));
}

/** 提交任务：非 2xx（积分不足/未配供应商等）错误信息已在 BackendError 内提取好 */
export async function submitServerTask(path: string, body: unknown, signal?: AbortSignal): Promise<ServerTaskSubmit> {
    try {
        return await backendJson<ServerTaskSubmit>(path, { method: "POST", json: body, signal });
    } catch (error) {
        throw new Error(readServerError(error, apiText("requestFailed")));
    }
}

/** 单次查询任务状态；404 视为失败（后端重启导致内存任务表丢失） */
export async function getServerTaskState(path: string, taskId: string, signal?: AbortSignal): Promise<ServerTaskState> {
    try {
        return await backendJson<ServerTaskState>(`${path}/${encodeURIComponent(taskId)}`, { signal });
    } catch (error) {
        if (error instanceof BackendError && error.status === 404) {
            return { status: "failed", error: i18n.t("apiErrors.serverTaskExpired") };
        }
        throw new Error(readServerError(error, apiText("requestFailed")));
    }
}

/** 轮询至终态：succeeded 返回 result，failed 抛错；abort 立即中断 */
export async function pollServerTaskUntilDone(
    path: string,
    taskId: string,
    options?: { signal?: AbortSignal; intervalMs?: number; maxAttempts?: number },
): Promise<Record<string, any>> {
    const intervalMs = options?.intervalMs ?? 2000;
    const maxAttempts = options?.maxAttempts ?? 300;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await getServerTaskState(path, taskId, options?.signal);
        if (state.status === "succeeded") return state.result || {};
        if (state.status === "failed") throw new Error(state.error || apiText("requestFailed"));
        await delay(intervalMs, options?.signal);
    }
    throw new Error(i18n.t("apiErrors.serverTaskTimeout"));
}

/** 生成参考图载荷：dataUrl 已被上游水合（后端 URL 或 dataURL），storageKey 兜底 */
export function referenceImagesPayload(references: ReferenceImage[]) {
    return references
        .map((ref) => ({ url: ref.dataUrl || ref.storageKey || "" }))
        .filter((item) => item.url);
}

/** 把 blob:/同源相对 URL 转成 dataURL；dataURL 与公网 URL 原样返回（上游 chat/completions 只认这两类） */
export async function ensureFetchableUrl(url: string): Promise<string> {
    if (!url || url.startsWith("data:") || /^https?:\/\//i.test(url)) return url;
    try {
        const blob = await (await fetch(url)).blob();
        return await blobToDataUrl(blob);
    } catch {
        return url;
    }
}

export function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("read blob failed"));
        reader.readAsDataURL(blob);
    });
}

export function readServerError(error: unknown, fallback: string) {
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    if (error instanceof BackendError) return error.message || fallback;
    return error instanceof Error ? error.message || fallback : fallback;
}

export function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}
