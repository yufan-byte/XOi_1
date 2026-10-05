export interface CapturedFrame {
  time: number;
  url: string;
}

export function bareModel(value: string) {
  return String(value || "").split(/:(.+)/)[1] || String(value || "");
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function waitFor(target: EventTarget, event: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("视频读取超时")), 15000);
    target.addEventListener(event, () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export async function captureVideoFrames(source: File | string, count = 8): Promise<{ duration: number; frames: CapturedFrame[] }> {
  const objectUrl = typeof source === "string" ? source : URL.createObjectURL(source);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = objectUrl;
  try {
    await waitFor(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error("无法读取视频时长");
    const frameCount = Math.max(4, Math.min(12, count));
    const frames: CapturedFrame[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      const time = Math.min(duration - 0.04, Math.max(0, duration * ((index + 0.5) / frameCount)));
      video.currentTime = time;
      await waitFor(video, "seeked");
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth || 1, video.videoHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ time, url: canvas.toDataURL("image/jpeg", 0.78) });
    }
    return { duration, frames };
  } finally {
    video.removeAttribute("src");
    video.load();
    if (typeof source !== "string") URL.revokeObjectURL(objectUrl);
  }
}

export function parseJsonContent(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(normalized);
  } catch {
    const start = Math.min(...[normalized.indexOf("{"), normalized.indexOf("[")].filter((item) => item >= 0));
    const end = Math.max(normalized.lastIndexOf("}"), normalized.lastIndexOf("]"));
    if (Number.isFinite(start) && start >= 0 && end > start) return JSON.parse(normalized.slice(start, end + 1));
    throw new Error("模型返回的结果不是有效 JSON，请重试");
  }
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function downloadUrl(url: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.click();
}
