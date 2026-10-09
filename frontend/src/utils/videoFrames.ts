export interface VideoFrame { time: number; dataUrl: string }
export interface AnalysisVideo { name: string; duration: number; frames: VideoFrame[] }

export function sampleVideoTimes(duration: number, count = 12): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1800) {
    throw new Error("视频时长需在 0–30 分钟之间");
  }
  if (!Number.isFinite(count)) throw new Error("抽帧数量无效");
  const n = Math.max(2, Math.min(16, Math.floor(count)));
  // Include the opening and closing portions, across the entire video rather than its first minutes.
  const margin = Math.min(0.05, duration / 100);
  return Array.from({ length: n }, (_, i) => margin + (duration - 2 * margin) * i / (n - 1));
}

function waitForVideo(video: HTMLVideoElement, event: "loadeddata" | "seeked", signal: AbortSignal, start: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, success);
      video.removeEventListener("error", failure);
      signal.removeEventListener("abort", aborted);
    };
    const success = () => { cleanup(); resolve(); };
    const failure = () => { cleanup(); reject(new Error("视频无法解码，请上传浏览器支持的 MP4 / WebM 文件")); };
    const aborted = () => { cleanup(); reject(new DOMException("已停止", "AbortError")); };
    if (signal.aborted) { aborted(); return; }
    video.addEventListener(event, success, { once: true });
    video.addEventListener("error", failure, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error("视频读取超时；远程素材可能受跨域限制，请下载后本地上传")); }, 20_000);
    try { start(); } catch (e) { cleanup(); reject(e); }
  });
}

export async function extractAnalysisFrames(input: { name: string; source: File | string }, signal: AbortSignal, onProgress?: (message: string) => void): Promise<AnalysisVideo> {
  const video = document.createElement("video");
  const ownedUrl = typeof input.source !== "string" ? URL.createObjectURL(input.source) : undefined;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const canvas = document.createElement("canvas");
  try {
    await waitForVideo(video, "loadeddata", signal, () => { video.src = ownedUrl || String(input.source); video.load(); });
    if (!video.videoWidth || !video.videoHeight) throw new Error("视频没有可读取的画面");
    const times = sampleVideoTimes(video.duration);
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器无法抽取视频画面");
    const frames: VideoFrame[] = [];
    for (const time of times) {
      signal.throwIfAborted();
      await waitForVideo(video, "seeked", signal, () => { video.currentTime = time; });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try { frames.push({ time, dataUrl: canvas.toDataURL("image/jpeg", 0.7) }); }
      catch { throw new Error("该远程视频不允许跨域抽帧，请下载后本地上传"); }
      onProgress?.(`正在抽帧 ${frames.length}/${times.length}`);
    }
    return { name: input.name.slice(0, 200), duration: video.duration, frames };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    canvas.width = canvas.height = 0;
    if (ownedUrl) URL.revokeObjectURL(ownedUrl);
  }
}

export function formatFrameTime(time: number): string {
  const rounded = Math.round(time * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  return `${String(minutes).padStart(2, "0")}:${(rounded % 60).toFixed(1).padStart(4, "0")}`;
}
