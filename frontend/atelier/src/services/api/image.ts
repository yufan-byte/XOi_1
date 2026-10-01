/**
 * 图片/文本生成传输层 —— XOi 深度适配：统一走宿主后端（提交即预扣积分、失败自动退还）。
 *   生图/改图 → POST /api/canvas-image-tasks + 轮询 GET /:task_id
 *   文本问答 → POST /api/canvas-llm（非流式，整段回调）
 *   模型列表 → GET /api/config（服务端供应商枚举，渠道本地 Key 仅对 TTS 直连生效）
 * 函数签名与 abort 语义与旧直连版一致，组装层（canvas-node-generation 等）零改动。
 */

import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { modelOptionName, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import type { ReferenceImage } from "@/types/image";
import {
    ensureFetchableUrl,
    notifyPointsDeducted,
    pollServerTaskUntilDone,
    referenceImagesPayload,
    submitServerTask,
} from "@/xoi/generation";
import { backendJson } from "@/xoi/backend";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type AiTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type RequestOptions = { signal?: AbortSignal };
type GeneratedImage = { id: string; dataUrl: string; storageKey?: string };
type ImageTaskResult = { images?: Array<{ url?: string }>; url?: string; warnings?: string[] };

const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const IMAGE_SIZE_STEP = 16;
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_MAX_RATIO = 3;

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : undefined;
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function parseRatioValue(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error(apiText("invalidImageSizeFormat"));
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error(apiText("positiveImageRatio"));
    return { width: w, height: h };
}

/** Map "quality + ratio" to an explicit pixel dimension like "3840x2160". */
function resolveSize(quality: string | undefined, ratio: string): string {
    const parsedRatio = parseRatioValue(ratio);
    if (Math.max(parsedRatio.width, parsedRatio.height) / Math.min(parsedRatio.width, parsedRatio.height) > IMAGE_MAX_RATIO) {
        throw new Error(apiText("imageRatioLimit"));
    }
    const basePixels = quality ? QUALITY_BASE[quality] : undefined;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longSide: number;
    let shortSide: number;

    if (basePixels) {
        const targetPixels = basePixels * basePixels;
        const longSideRaw = Math.sqrt(targetPixels * longRatio);
        longSide = Math.floor(longSideRaw / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortSide = Math.round(longSide / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    } else {
        shortSide = DEFAULT_IMAGE_SHORT_SIDE;
        longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    return `${width}x${height}`;
}

/** 把画布的 size 设置（auto / "16:9" / "1024x1024"）折算成后端的 width/height；解析不了就不传走服务端默认 */
function serverImageSizePayload(config: AiConfig): { width?: number; height?: number } {
    const value = config.size.trim();
    if (!value || value.toLowerCase() === "auto") return {};
    const dimensions = value.match(/^(\d+)x(\d+)$/i);
    if (dimensions) {
        const width = Number(dimensions[1]);
        const height = Number(dimensions[2]);
        return width > 0 && height > 0 ? { width, height } : {};
    }
    if (value.includes(":")) {
        try {
            const [width, height] = resolveSize(normalizeQuality(config.quality), value).split("x").map(Number);
            return { width, height };
        } catch {
            return {}; // 比例非法等场景交给服务端默认，避免整次生成被阻断
        }
    }
    return {};
}

function taskResultToImages(result: ImageTaskResult): GeneratedImage[] {
    const urls = (result.images || []).map((item) => item.url || "").filter(Boolean);
    if (!urls.length && result.url) urls.push(result.url);
    return urls.map((url) => ({ id: nanoid(), dataUrl: url, storageKey: url }));
}

/** 服务端生图通道：每张图一个任务（服务端单任务单图，count 张即并行提交 N 个任务、各计一次积分） */
async function generateServerImages(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, options?: RequestOptions): Promise<GeneratedImage[]> {
    const body = {
        prompt: withSystemPrompt(config, prompt),
        model: modelOptionName(config.model || config.imageModel),
        ...serverImageSizePayload(config),
        reference_images: referenceImagesPayload(references),
    };
    const submits = await Promise.all(Array.from({ length: count }, () => submitServerTask("/api/canvas-image-tasks", body, options?.signal)));
    notifyPointsDeducted(submits[0]?.pointsDeducted, submits[0]?.balance);
    const results = await Promise.all(
        submits.map((submit) => pollServerTaskUntilDone("/api/canvas-image-tasks", submit.task_id, { signal: options?.signal })),
    );
    const images = results.flatMap((result) => taskResultToImages(result as ImageTaskResult));
    if (!images.length) throw new Error(apiText("noImageReturned"));
    return images;
}

export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    return generateServerImages(config, prompt, [], n, options);
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage, options?: RequestOptions) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    // 后端暂无原生蒙版通道：蒙版作为参考图尾随提交（模型至少可感知蒙版区域）
    const allReferences = mask ? [...references, mask] : references;
    return generateServerImages(config, requestPrompt, allReferences, n, options);
}

export async function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    const payload = {
        model: modelOptionName(config.model || config.textModel),
        ...(config.systemPrompt.trim() ? { system_prompt: config.systemPrompt.trim() } : {}),
        // 多模态 content 里的图片统一折算成 dataURL（上游只认 dataURL/公网 URL，无法访问宿主相对路径）
        messages: await Promise.all(
            messages.map(async (item) => ({
                role: item.role,
                content: Array.isArray(item.content)
                    ? await Promise.all(
                          item.content.map(async (part) =>
                              part.type === "text" ? part : { type: "image_url" as const, image_url: { url: await ensureFetchableUrl(part.image_url.url) } },
                          ),
                      )
                    : item.content,
            })),
        ),
    };
    try {
        const data = await backendJson<{ text?: string; pointsDeducted?: number | null; balance?: number | null }>("/api/canvas-llm", {
            method: "POST",
            json: payload,
            signal: options?.signal,
        });
        notifyPointsDeducted(data.pointsDeducted, data.balance);
        const text = (data.text || "").trim() || apiText("noContent");
        onDelta(text);
        return text;
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new Error(error instanceof Error ? error.message : apiText("requestFailed"));
    }
}

/** 服务端供应商模型枚举（生图/视频/文本三类合并去重；音频模型仍需在渠道内手动维护） */
export async function fetchImageModels(_config: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat">) {
    try {
        const data = await backendJson<{ image_models?: string[]; video_models?: string[]; chat_models?: string[] }>("/api/config");
        return Array.from(new Set([...(data.image_models || []), ...(data.video_models || []), ...(data.chat_models || [])].map((name) => String(name).trim()).filter(Boolean))).sort((a, b) =>
            a.localeCompare(b),
        );
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : apiText("modelReadFailed"));
    }
}

export async function fetchChannelModels(channel: Pick<ModelChannel, "baseUrl" | "apiKey" | "apiFormat">) {
    return fetchImageModels({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, apiFormat: channel.apiFormat });
}
