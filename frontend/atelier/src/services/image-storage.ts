import localforage from "localforage";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { readImageMeta } from "@/lib/image-utils";
import { proxyApiUrl } from "@/lib/api-proxy";
import { backendUploadFile } from "@/xoi/backend";
import { ownerDbName } from "@/xoi/owner";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

// image_files 库按宿主登录用户分桶；仅承载 legacy 本地兜底 blob（storageKey 以 image: 开头）
let imageStoreInstance: ReturnType<typeof localforage.createInstance> | null = null;
function imageStore() {
    if (!imageStoreInstance) {
        imageStoreInstance = localforage.createInstance({ name: ownerDbName("files"), storeName: "image_files" });
    }
    return imageStoreInstance!;
}

const objectUrls = new Map<string, string>();

function isRemoteKey(storageKey: string): boolean {
    return storageKey.startsWith("/") || storageKey.startsWith("http") || storageKey.startsWith("data:") || storageKey.startsWith("blob:");
}

function extFromMimeType(mimeType: string): string {
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("svg")) return "svg";
    return "png";
}

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    // 服务端生成产物已在 /oss 目录：直接引用免二次转存（避免同一张图双份落盘）
    if (typeof input === "string" && /^\/oss\//i.test(input)) {
        const meta = await readImageMeta(input);
        const mimeType = /\.jpe?g(\?|$)/i.test(input) ? "image/jpeg" : /\.webp(\?|$)/i.test(input) ? "image/webp" : /\.gif(\?|$)/i.test(input) ? "image/gif" : meta.mimeType;
        return { url: input, storageKey: input, width: meta.width, height: meta.height, bytes: 0, mimeType };
    }
    const blob = typeof input === "string" ? await (await fetch(proxyRemoteMediaUrl(input))).blob() : input;

    // 先从本地 blob 读取尺寸元数据（避免上传后再拉远端测宽高）
    const localUrl = URL.createObjectURL(blob);
    const meta = await readImageMeta(localUrl);
    const mimeType = blob.type || meta.mimeType;
    const uploaded: UploadedImage = { url: "", storageKey: "", width: meta.width, height: meta.height, bytes: blob.size, mimeType };

    // 首选落宿主后端（跨设备可见，storageKey 即伺服 URL）；失败（离线等）退回本地 IndexedDB 兜底
    try {
        const remote = await backendUploadFile(blob, extFromMimeType(mimeType));
        URL.revokeObjectURL(localUrl);
        uploaded.url = remote.url;
        uploaded.storageKey = remote.url;
        return uploaded;
    } catch {
        // 本地兜底：legacy image: key，仅当前浏览器可见
        const storageKey = `image:${nanoid()}`;
        await imageStore().setItem(storageKey, blob);
        objectUrls.set(storageKey, localUrl);
        uploaded.url = localUrl;
        uploaded.storageKey = storageKey;
        return uploaded;
    }
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    if (isRemoteKey(storageKey)) return storageKey; // 后端 URL / dataURL / blobURL 直接可用
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await imageStore().getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    if (isRemoteKey(storageKey)) {
        const resp = await fetch(storageKey);
        if (!resp.ok) return null;
        return resp.blob();
    }
    return imageStore().getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await imageStore().setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await (await fetch(proxyRemoteMediaUrl(url))).blob());
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            if (isRemoteKey(key)) return; // 远端文件第一阶段不做服务端 GC
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await imageStore().removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    const unused: string[] = [];
    await imageStore().iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}

function proxyRemoteMediaUrl(url: string) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? proxyApiUrl(url) : url;
    } catch {
        return url;
    }
}
