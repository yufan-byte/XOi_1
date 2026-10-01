import localforage from "localforage";
import { nanoid } from "nanoid";

import { backendUploadFile } from "@/xoi/backend";
import { ownerDbName } from "@/xoi/owner";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

// media_files 库按宿主登录用户分桶；仅承载 legacy 本地兜底 blob（storageKey 为 <prefix>:<nanoid> 形态）
let mediaStoreInstance: ReturnType<typeof localforage.createInstance> | null = null;
function mediaStore() {
    if (!mediaStoreInstance) {
        mediaStoreInstance = localforage.createInstance({ name: ownerDbName("files"), storeName: "media_files" });
    }
    return mediaStoreInstance!;
}

const objectUrls = new Map<string, string>();

function isRemoteKey(storageKey: string): boolean {
    return storageKey.startsWith("/") || storageKey.startsWith("http") || storageKey.startsWith("data:") || storageKey.startsWith("blob:");
}

function extFromBlob(blob: Blob, fallbackPrefix: string): string {
    const type = blob.type || "";
    if (type.includes("webm")) return "webm";
    if (type.includes("mp4")) return "mp4";
    if (type.includes("mpeg")) return "mp3";
    if (type.includes("wav")) return "wav";
    if (fallbackPrefix === "director") return "mp4";
    if (fallbackPrefix.startsWith("audio")) return "mp3";
    return "mp4";
}

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;

    // 先从本地 blob 读取时长/尺寸元数据
    const localUrl = URL.createObjectURL(blob);
    const meta = blob.type.startsWith("video/") ? await readVideoMeta(localUrl) : blob.type.startsWith("audio/") ? await readAudioMeta(localUrl) : {};
    const mimeType = blob.type || "application/octet-stream";
    const uploaded: UploadedFile = { url: "", storageKey: "", bytes: blob.size, mimeType, ...meta };

    // 首选落宿主后端（跨设备可见）；失败退回本地 IndexedDB 兜底
    try {
        const remote = await backendUploadFile(blob, extFromBlob(blob, prefix));
        URL.revokeObjectURL(localUrl);
        uploaded.url = remote.url;
        uploaded.storageKey = remote.url;
        return uploaded;
    } catch {
        const storageKey = `${prefix}:${nanoid()}`;
        await mediaStore().setItem(storageKey, blob);
        objectUrls.set(storageKey, localUrl);
        uploaded.url = localUrl;
        uploaded.storageKey = storageKey;
        return uploaded;
    }
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    if (isRemoteKey(storageKey)) return storageKey;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await mediaStore().getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getMediaBlob(storageKey: string) {
    if (isRemoteKey(storageKey)) {
        const resp = await fetch(storageKey);
        if (!resp.ok) return null;
        return resp.blob();
    }
    return mediaStore().getItem<Blob>(storageKey);
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    await mediaStore().setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            if (isRemoteKey(key)) return; // 远端文件第一阶段不做服务端 GC
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await mediaStore().removeItem(key);
        }),
    );
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused: string[] = [];
    await mediaStore().iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await Promise.all(unused.map((key) => mediaStore().removeItem(key)));
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
