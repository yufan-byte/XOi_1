/**
 * 视频生成传输层 —— XOi 深度适配：统一走宿主后端 /api/canvas-video 任务接口。
 *   POST /api/canvas-video → { task_id, pointsDeducted, balance }；GET /:task_id → { status, result, error }
 * 后端提交即预扣积分、失败 CAS 仲裁退还；产物直接落 /oss 并以 URL 返回，storeGeneratedVideo 对
 * /oss 产物短路直用免二次上传。函数签名与 abort 语义与旧直连版一致。
 */

import i18n from "@/i18n";
import { boolConfig, modelOptionName, type AiConfig } from "@/stores/use-config-store";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import type { ReferenceImage } from "@/types/image";
import {
    blobToDataUrl,
    delay,
    getServerTaskState,
    notifyPointsDeducted,
    readServerError,
    submitServerTask,
} from "@/xoi/generation";

type RequestOptions = { signal?: AbortSignal };
const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "server"; model: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

/** 后端视频任务 15 分钟超时，轮询窗留足同量级余量（3s × 320 ≈ 16min） */
const POLL_ATTEMPTS = 320;
const POLL_INTERVAL_MS = 3000;
const MAX_REFERENCE_IMAGES = 7;

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, options);
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        if (attempt === POLL_ATTEMPTS - 1) throw new Error(apiText("videoTimeout", { provider: "" }));
        await delay(POLL_INTERVAL_MS, options?.signal);
    }
    throw new Error(apiText("videoTimeout", { provider: "" }));
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    if (!selectedModel) throw new Error(apiText("videoModelRequired"));
    const images = await Promise.all(references.slice(0, MAX_REFERENCE_IMAGES).map((ref) => referencePayloadUrl(ref)));
    try {
        const submit = await submitServerTask(
            "/api/canvas-video",
            {
                prompt,
                model: modelOptionName(selectedModel),
                duration: Math.max(1, Math.min(20, Math.floor(Number(config.videoSeconds) || 6))),
                resolution: normalizeVideoResolution(config.vquality),
                aspect_ratio: normalizeVideoAspectRatio(config.size),
                images,
                generate_audio: boolConfig(config.videoGenerateAudio, true),
                watermark: boolConfig(config.videoWatermark, false),
            },
            options?.signal,
        );
        notifyPointsDeducted(submit.pointsDeducted, submit.balance);
        return { id: submit.task_id, provider: "server", model: selectedModel };
    } catch (error) {
        throw new Error(readServerError(error, apiText("videoTaskCreateFailed")));
    }
}

export async function pollVideoGenerationTask(_config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    let state;
    try {
        state = await getServerTaskState("/api/canvas-video", task.id, options?.signal);
    } catch (error) {
        throw new Error(readServerError(error, apiText("videoTaskQueryFailed")));
    }
    if (state.status === "succeeded") {
        const url = String(state.result?.url || state.result?.videos?.[0]?.url || "");
        if (!url) return { status: "failed", error: apiText("noPlayableVideo") };
        return { status: "completed", result: { url, mimeType: "video/mp4" } };
    }
    if (state.status === "failed") return { status: "failed", error: state.error || apiText("videoGenerationFailed") };
    return { status: "pending" };
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    // 服务端产物已落 /oss：直接引用，免 fetch+重传一份重复文件
    if (result.url && /^\/oss\//i.test(result.url)) {
        return { url: result.url, storageKey: result.url, bytes: 0, mimeType: result.mimeType || "video/mp4" };
    }
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) {
        try {
            return await uploadMediaFile(result.url, "video");
        } catch {
            return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
        }
    }
    throw new Error(apiText("noPlayableVideo"));
}

/** 参考图折算成后端可取回的 URL：稳定 storageKey 优先（/oss/…），blob: 本地兜底转 dataURL 直送 */
async function referencePayloadUrl(ref: ReferenceImage) {
    const key = ref.storageKey || "";
    let url = key && !key.startsWith("image:") ? key : ref.dataUrl;
    if (url.startsWith("blob:")) url = await blobToDataUrl(await (await fetch(url)).blob());
    return url;
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

/** 后端只认七档几何比；未知名目原样上送交给其统一降级 16:9 并附 warnings */
function normalizeVideoAspectRatio(value: string) {
    const size = (value || "").trim();
    const dimensions = size.match(/^(\d+)x(\d+)$/i);
    if (dimensions) {
        const width = Number(dimensions[1]);
        const height = Number(dimensions[2]);
        if (width > 0 && height > 0) {
            const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
            const g = gcd(width, height);
            return `${width / g}:${height / g}`;
        }
    }
    return size || "16:9";
}
