"use client";
// 漫剧 / 短片共用的视频小工具：图片转 dataURL、任务恢复、顺序下载、canvas + MediaRecorder 合成 WebM

/** 把任意图片 URL 转成 dataURL（跨域失败时原样返回） */
export async function toDataUrl(url: string): Promise<string> {
  if (!url || url.startsWith("data:")) return url;
  try {
    const b = await (await fetch(url)).blob();
    return await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });
  } catch { return url; }
}

/** 参考图 / 首帧入参：压到 maxSide 以内的 JPEG dataURL。原图 base64 动辄数 MB，上传被截断后请求永远不结束、状态一直「生成中」（电商生图同款事故）。
 *  跨域读不到像素时把 http(s) 原地址交给上游自己拉；blob 已失效等实在拿不到时返回空串 */
export async function toRefDataUrl(url: string, maxSide = 1024, quality = 0.9): Promise<string> {
  if (!url) return "";
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    // JPEG 没有透明通道，不铺底的话透明处会变成黑色（透明底角色立绘传上去就成了黑底）
    const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    return c.toDataURL("image/jpeg", quality);
  } catch { return /^(https?:|data:)/i.test(url) ? url : ""; }
}

/** 封面和参考图先限文件大小、再压缩；不可解码的内容不能入库冒充图片。 */
export async function shrinkImage(file: File, maxSide = 768, quality = 0.85): Promise<string> {
  if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("请选择 PNG、JPEG 或 WebP 图片");
  if(file.size>10*1024*1024)throw new Error("图片不能超过 10 MB，请先压缩后上传");
  const src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  return new Promise((resolve,reject) => {
    const img = new Image();
    img.onload = () => {
      if(img.width*img.height>40_000_000){reject(new Error("图片像素过大，请缩小到 4000 万像素以内"));return;}
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); // 透明处铺白，别变黑
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("图片无法读取，请换一张图片"));
    img.src = src;
  });
}

export const isBlobUrl = (u?: string) => !!u && u.startsWith("blob:");

export async function downloadUrl(url: string, name: string) {
  let href = url;
  if (!url.startsWith("blob:") && !url.startsWith("data:")) { try { href = URL.createObjectURL(await (await fetch(url)).blob()); } catch { /* 跨域时直接打开 */ } }
  const a = document.createElement("a"); a.href = href; a.download = name; a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove();
}

/** 依次下载多个片段（浏览器需要间隔，否则会拦截） */
export async function downloadAll(items: { url: string; name: string }[]) {
  for (const it of items) { await downloadUrl(it.url, it.name); await new Promise((r) => setTimeout(r, 600)); }
}

export interface ComposeClip { video: string; audio?: string }

/** 把多个视频依次画到 canvas 上并用 MediaRecorder 录成一个 WebM（含视频原声与配音混音） */
export async function composeWebm(clips: ComposeClip[], opts: { onProgress?: (i: number, total: number) => void; fps?: number } = {}): Promise<Blob> {
  if (!clips.length) throw new Error("没有可合成的片段");
  if (typeof MediaRecorder === "undefined") throw new Error("当前浏览器不支持 MediaRecorder");
  const fps = opts.fps ?? 30;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(fps);
  let ac: AudioContext | null = null; let dest: MediaStreamAudioDestinationNode | null = null;
  try { ac = new AudioContext(); dest = ac.createMediaStreamDestination(); dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); } catch { ac = null; }
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: mime || "video/webm" })); });
  let started = false;
  for (let i = 0; i < clips.length; i++) {
    opts.onProgress?.(i, clips.length);
    const v = document.createElement("video"); v.src = clips[i].video; v.crossOrigin = "anonymous"; v.playsInline = true; v.preload = "auto";
    await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error(`第 ${i + 1} 段视频无法读取`)); });
    if (!started) { canvas.width = v.videoWidth || 1280; canvas.height = v.videoHeight || 720; rec.start(250); started = true; }
    let speech: HTMLAudioElement | null = null;
    if (ac && dest) {
      try { ac.createMediaElementSource(v).connect(dest); } catch { /* ignore */ }
      if (clips[i].audio) { try { speech = new Audio(clips[i].audio); speech.crossOrigin = "anonymous"; ac.createMediaElementSource(speech).connect(dest); } catch { speech = null; } }
    } else v.muted = true;
    await new Promise<void>((res) => {
      let raf = 0;
      const draw = () => { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height); const k = Math.min(canvas.width / v.videoWidth, canvas.height / v.videoHeight); const w = v.videoWidth * k, h = v.videoHeight * k; ctx.drawImage(v, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h); raf = requestAnimationFrame(draw); };
      v.onended = () => { cancelAnimationFrame(raf); speech?.pause(); res(); };
      v.play().then(() => { draw(); speech?.play().catch(() => {}); }).catch(() => { cancelAnimationFrame(raf); res(); });
    });
  }
  opts.onProgress?.(clips.length, clips.length);
  rec.stop();
  const blob = await done;
  stream.getTracks().forEach((t) => t.stop()); ac?.close().catch(() => {});
  return blob;
}
