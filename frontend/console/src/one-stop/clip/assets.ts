"use client";
// 素材登记：读时长 / 尺寸 / 缩略图
import { uid } from "@/lib/utils";
import type { AssetKind, ClipAsset } from "./types";

export function kindOf(f: File): AssetKind | null {
  if (f.type.startsWith("video/")) return "video";
  if (f.type.startsWith("image/")) return "image";
  if (f.type.startsWith("audio/")) return "audio";
  if (/\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name)) return "audio";
  if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)) return "image";
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string) { return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]); }

export async function probeFile(f: File, id = uid()): Promise<ClipAsset> {
  const kind = kindOf(f); if (!kind) throw new Error(`${f.name}：不支持的文件类型`);
  const url = URL.createObjectURL(f);
  const base: ClipAsset = { id, name: f.name, kind, size: f.size, duration: 0, width: 0, height: 0, url };
  if (kind === "image") {
    const img = new Image(); img.src = url;
    await withTimeout(img.decode(), 15000, `${f.name}：图片无法解码`);
    const c = document.createElement("canvas"); const s = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight)); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { ...base, width: img.naturalWidth, height: img.naturalHeight, thumb: c.toDataURL("image/jpeg", 0.7) };
  }
  if (kind === "audio") {
    const a = document.createElement("audio"); a.preload = "metadata"; a.src = url;
    await withTimeout(new Promise<void>((res, rej) => { a.onloadedmetadata = () => res(); a.onerror = () => rej(new Error(`${f.name}：音频无法解码`)); }), 15000, `${f.name}：读取音频超时`);
    return { ...base, duration: Number.isFinite(a.duration) ? a.duration : 0 };
  }
  const v = document.createElement("video"); v.preload = "auto"; v.muted = true; v.playsInline = true; v.src = url;
  await withTimeout(new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error(`${f.name}：视频浏览器无法解码 · 换素材或转码后重新上传`)); }), 20000, `${f.name}：读取视频超时`);
  // MediaRecorder 录的 webm（含本站导出的成片）元数据里没有时长，duration 是 Infinity：
  // 不补的话时长记成 0，拼接 / 剪辑时这段只会被截成 0.1 秒。跳到极远处逼浏览器算出真实时长。
  if (!Number.isFinite(v.duration)) {
    try { v.currentTime = 1e101; await withTimeout(new Promise<void>((res) => { v.ondurationchange = () => { if (Number.isFinite(v.duration)) res(); }; }), 8000, "时长探测超时"); } catch { /* 探不出就按 0 处理 */ }
  }
  let thumb: string | undefined;
  try {
    v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    await withTimeout(new Promise<void>((res) => { v.onseeked = () => res(); }), 8000, "seek 超时");
    const c = document.createElement("canvas"); const s = Math.min(1, 200 / Math.max(v.videoWidth, v.videoHeight)); c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s); c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height); thumb = c.toDataURL("image/jpeg", 0.7);
  } catch { /* 缩略图失败不影响使用 */ }
  return { ...base, duration: Number.isFinite(v.duration) ? v.duration : 0, width: v.videoWidth, height: v.videoHeight, thumb };
}

export function assetSummary(assets: ClipAsset[]) {
  const n = (k: AssetKind) => assets.filter((a) => a.kind === k).length;
  const secs = assets.reduce((s, a) => s + (a.duration || 0), 0); const bytes = assets.reduce((s, a) => s + a.size, 0);
  return { video: n("video"), photo: n("image"), audio: n("audio"), minutes: Math.max(1, Math.round(secs / 60)), bytes };
}
