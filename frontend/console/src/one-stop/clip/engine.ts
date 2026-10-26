"use client";
// 浏览器内合成引擎：把片段按顺序画到 canvas（按适配方式裁切 / 垫模糊背景 / 留黑边），叠字幕与转场，用 MediaRecorder 录成 webm/mp4；
// 音频通过 AudioContext 把视频原声 / BGM 混进同一条流。渲染是实时的：成片多长就要等多久。
// 每帧怎么画抽成了 composeFrame：导出和工作台的实时预览共用同一份，预览看到的就是导出的样子。
import type { ClipAsset, FitMode } from "./types";
import { drawFx, type ClipFx } from "./fx";

export interface RenderSegment { asset: ClipAsset; start: number; end: number; caption?: string; fx?: ClipFx; fit?: FitMode }
export interface RenderOptions {
  width: number; height: number; fps?: number;
  transition?: "none" | "fade";
  /** 全片的适配方式；不传 = letterbox（/video-concat 不传，输出和以前一致） */
  fit?: FitMode;
  keepAudio?: boolean;                       // 保留视频原声
  bgm?: { asset: ClipAsset; volume: number }; // 背景音乐
  title?: string;
  signal?: AbortSignal;
  onProgress?: (ratio: number, phase: string) => void;
}
export interface RenderResult { blob: Blob; mime: string; duration: number; url: string }

export function pickMime() {
  const cands = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  if (typeof MediaRecorder === "undefined") return null;
  return cands.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}
export const canRender = () => typeof MediaRecorder !== "undefined" && !!pickMime() && !!HTMLCanvasElement.prototype.captureStream;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));
/** 等一个媒体 Promise：带超时、响应取消。解码卡住时 onloadeddata / play() 可能永不 settle，
 *  不加这层导出会无限挂起，而且取消按钮也点不动（check() 只在帧循环里跑）。 */
function guard<T>(p: Promise<T>, ms: number, msg: string, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => { off(); rej(new Error(msg)); }, ms);
    const onAbort = () => { clearTimeout(t); rej(new Error("已取消导出")); };
    const off = () => signal?.removeEventListener("abort", onAbort);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    p.then((v) => { clearTimeout(t); off(); res(v); }, (e) => { clearTimeout(t); off(); rej(e); });
  });
}

export function fit(sw: number, sh: number, dw: number, dh: number) {
  const s = Math.min(dw / sw, dh / sh); const w = sw * s, h = sh * s;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}
/** 铺满画幅、居中裁掉多余部分（以后有分析结果时可以按主体位置偏移裁切中心） */
export function cover(sw: number, sh: number, dw: number, dh: number) {
  const s = Math.max(dw / sw, dh / sh); const w = sw * s, h = sh * s;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

/** 段时长：和导出循环一致，再短也按 0.1 秒算 */
export const segDur = (s: { start: number; end: number }) => Math.max(0.1, s.end - s.start);
/** 全局时间 t 落在第几段：index = 段序号，local = 段内秒数，offset = 这段在成片里的起点。
 *  t 超出总长时停在最后一段末尾，负数按 0；没有段返回 null */
export function segmentAt(plan: { segments: { start: number; end: number }[] }, t: number): { index: number; local: number; offset: number } | null {
  const segs = plan.segments; if (!segs.length) return null;
  let offset = 0; const tt = Math.max(0, Number.isFinite(t) ? t : 0);
  for (let i = 0; i < segs.length; i++) { const d = segDur(segs[i]); if (tt < offset + d || i === segs.length - 1) return { index: i, local: Math.min(d, tt - offset), offset }; offset += d; }
  return null;
}
export const timelineDuration = (plan: { segments: { start: number; end: number }[] }) => plan.segments.reduce((s, x) => s + segDur(x), 0);
/** 单段适配 > 全片适配 > letterbox（老项目和 /video-concat 都没有 fit，保持原样） */
export const resolveFit = (planFit?: FitMode, segFit?: FitMode): FitMode => segFit ?? planFit ?? "letterbox";
/** 照片段的 Ken Burns 推近：段内 0 → dur 从 1 放大到 1.08，预览和导出同一个公式 */
export const kenBurns = (t: number, dur: number) => 1 + 0.08 * (t / dur);

function drawCaption(ctx: CanvasRenderingContext2D, text: string, W: number, H: number) {
  if (!text) return;
  const fs = Math.round(Math.min(W, H) * 0.052); ctx.font = `600 ${fs}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // 简单按宽度折行
  const maxW = W * 0.86; const lines: string[] = []; let cur = "";
  for (const ch of text) { if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
  if (cur) lines.push(cur);
  const lh = fs * 1.35; const y0 = H - Math.round(H * 0.11) - (lines.length - 1) * lh;
  lines.forEach((ln, i) => {
    const y = y0 + i * lh; const tw = ctx.measureText(ln).width;
    ctx.fillStyle = "rgba(0,0,0,.45)"; const pad = fs * 0.5; const r = fs * 0.35; const x = W / 2 - tw / 2 - pad, w = tw + pad * 2, h = lh;
    ctx.beginPath(); ctx.roundRect(x, y - h / 2, w, h, r); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(ln, W / 2, y);
  });
}

function drawTitle(ctx: CanvasRenderingContext2D, text: string, W: number, H: number, alpha: number) {
  if (!text || alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; const fs = Math.round(Math.min(W, H) * 0.08);
  ctx.font = `700 ${fs}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = fs * 0.4; ctx.fillStyle = "#fff"; ctx.fillText(text, W / 2, H * 0.42); ctx.restore();
}

/** 老版 Safari 的 2D canvas 没有 filter：模糊背景画不出来，退回黑边 */
const canFilter = (ctx: CanvasRenderingContext2D) => typeof (ctx as { filter?: unknown }).filter === "string";
const FADE = 0.45;
export interface FrameLayer { src: CanvasImageSource; sw: number; sh: number; zoom?: number }
/** 画一帧：layer 为空 = 纯音频段（深灰底 + 字幕 + 动效，没有标题和转场，和以前一样）。
 *  t / dur 是段内时间，i / n 是第几段 / 共几段（决定标题与淡入淡出）。导出与预览共用，改这里两边一起变 */
export function composeFrame(ctx: CanvasRenderingContext2D, W: number, H: number, layer: FrameLayer | null, seg: { caption?: string; fx?: ClipFx }, t: number, dur: number, i: number, n: number, opts: { title?: string; transition?: "none" | "fade"; fit?: FitMode }) {
  if (!layer) { ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H); if (seg.caption) drawCaption(ctx, seg.caption, W, H); if (seg.fx) drawFx(ctx, seg.fx, W, H, t, dur); return; }
  const { src, sw, sh } = layer; const z = layer.zoom ?? 1;
  let mode = opts.fit ?? "letterbox"; if (mode === "blur_bg" && !canFilter(ctx)) mode = "letterbox";
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  if (mode === "blur_bg") {
    // 垫底放大 8%：模糊会把边缘往里吃，不放大四周会露出一圈发灰的黑边
    const c = cover(sw, sh, W, H); const bw = c.w * 1.08, bh = c.h * 1.08;
    ctx.save(); ctx.filter = "blur(24px) brightness(0.7)"; ctx.drawImage(src, (W - bw) / 2, (H - bh) / 2, bw, bh); ctx.restore(); ctx.filter = "none";
  }
  const f = mode === "smart_crop" ? cover(sw, sh, W, H) : fit(sw, sh, W, H); const w = f.w * z, h = f.h * z;
  ctx.drawImage(src, f.x - (w - f.w) / 2, f.y - (h - f.h) / 2, w, h);
  if (seg.caption) drawCaption(ctx, seg.caption, W, H);
  if (seg.fx) drawFx(ctx, seg.fx, W, H, t, dur);
  if (i === 0 && opts.title) drawTitle(ctx, opts.title, W, H, t < 2.2 ? Math.min(1, (2.2 - t) / 0.6) * Math.min(1, t / 0.4) : 0);
  if (opts.transition === "fade") {
    const alpha = t < FADE && i > 0 ? 1 - t / FADE : dur - t < FADE && i < n - 1 ? 1 - (dur - t) / FADE : 0;
    if (alpha > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha)})`; ctx.fillRect(0, 0, W, H); }
  }
}
/** 预览里画不了素材时的占位：缺文件 / 解码失败，居中一行提示 */
export function drawNotice(ctx: CanvasRenderingContext2D, W: number, H: number, text: string, bg = "#3a3a3f") {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const fs = Math.round(Math.min(W, H) * 0.04); ctx.font = `500 ${fs}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,255,255,.85)";
  const maxW = W * 0.84; const lines: string[] = []; let cur = "";
  for (const ch of text) { if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
  if (cur) lines.push(cur);
  lines.forEach((ln, k) => ctx.fillText(ln, W / 2, H / 2 + (k - (lines.length - 1) / 2) * fs * 1.5));
}

export async function renderTimeline(segments: RenderSegment[], opts: RenderOptions): Promise<RenderResult> {
  if (!segments.length) throw new Error("先加一段素材再导出");
  const mime = pickMime(); if (!mime) throw new Error("这个浏览器导不了片：不支持 MediaRecorder / 视频编码。请用最新版 Chrome 或 Edge。");
  const W = opts.width, H = opts.height, fps = opts.fps ?? 30, transition = opts.transition ?? "none";
  const total = segments.reduce((s, x) => s + Math.max(0, x.end - x.start), 0);
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  const stream = canvas.captureStream(fps);

  // 每个素材一个媒体元素（MediaElementSource 只能建一次）
  const videos = new Map<string, HTMLVideoElement>();
  const gains = new Map<string, GainNode>();
  const images = new Map<string, HTMLImageElement>();
  let bgmEl: HTMLAudioElement | null = null; let ac: AudioContext | null = null; let rec: MediaRecorder | null = null;
  // 准备阶段出错也要释放：否则每次失败都泄漏一个 AudioContext 和一堆解码中的 <video>
  const cleanup = () => { videos.forEach((v) => { v.pause(); v.src = ""; }); if (bgmEl) { bgmEl.pause(); bgmEl.src = ""; } ac?.close().catch(() => undefined); stream.getTracks().forEach((t) => t.stop()); };
  const check = () => { if (opts.signal?.aborted) throw new Error("已取消导出"); };
  const t0 = performance.now(); let elapsedBefore = 0;
  const chunks: Blob[] = [];

  try {
    // 音频图
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ac = new AC(); await ac.resume().catch(() => undefined);
    const dest = ac.createMediaStreamDestination();
    const wantAudio = (opts.keepAudio ?? true) || !!opts.bgm;
    if (wantAudio) dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

    opts.onProgress?.(0, "准备素材");
    for (const s of segments) {
      check();
      const a = s.asset; if (!a.url) throw new Error(`${a.name} 的文件不在浏览器里，请重新上传`);
      if (a.kind === "video" && !videos.has(a.id)) {
        const v = document.createElement("video"); v.src = a.url; v.preload = "auto"; v.playsInline = true; v.muted = !(opts.keepAudio ?? true); v.volume = 1;
        videos.set(a.id, v);
        await guard(new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error(`${a.name} 浏览器无法解码 · 换素材或转码后重新上传`)); }), 30000, `${a.name} 加载超时：浏览器解不了这个视频的画面 · 换素材或转码成 H.264 后重新上传`, opts.signal);
        if (opts.keepAudio ?? true) { try { const src = ac.createMediaElementSource(v); const g = ac.createGain(); g.gain.value = 1; src.connect(g); g.connect(dest); gains.set(a.id, g); } catch { /* 无音轨 */ } }
      } else if (a.kind === "image" && !images.has(a.id)) {
        const img = new Image(); img.src = a.url; await guard(img.decode(), 20000, `${a.name} 图片无法解码`, opts.signal).catch((e: Error) => { throw e.message === "已取消导出" ? e : new Error(`${a.name} 图片无法解码 · 换一张再试`); }); images.set(a.id, img);
      }
    }
    if (opts.bgm?.asset.url) {
      const el = document.createElement("audio"); bgmEl = el; el.src = opts.bgm.asset.url; el.loop = true; el.preload = "auto";
      // BGM 加载不了就不带 BGM，但不能无限等
      await guard(new Promise<void>((res) => { el.onloadeddata = () => res(); el.onerror = () => res(); }), 15000, "bgm", opts.signal).catch((e: Error) => { if (e.message === "已取消导出") throw e; });
      try { const src = ac.createMediaElementSource(el); const g = ac.createGain(); g.gain.value = opts.bgm.volume; src.connect(g); g.connect(dest); } catch { /* ignore */ }
    }

    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(W * H * 6) }); }
    catch { throw new Error("这个浏览器的录制器不支持当前视频编码，导不了片。请用最新版 Chrome 或 Edge。"); }
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const r = rec; const stopped = new Promise<void>((res) => { r.onstop = () => res(); });
    rec.start(500);
    if (bgmEl) { bgmEl.currentTime = 0; bgmEl.play().catch(() => undefined); }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]; const dur = segDur(seg); const a = seg.asset;
      opts.onProgress?.(elapsedBefore / total, `渲染第 ${i + 1} / ${segments.length} 段`);
      const segStart = performance.now();
      const frameOpts = { title: opts.title, transition, fit: resolveFit(opts.fit, seg.fit) };
      const drawFrame = (src: CanvasImageSource, sw: number, sh: number, t: number, zoom = 1) => composeFrame(ctx, W, H, { src, sw, sh, zoom }, seg, t, dur, i, segments.length, frameOpts);
      if (a.kind === "image") {
        const img = images.get(a.id)!;
        while (true) {
          check(); const t = (performance.now() - segStart) / 1000; if (t >= dur) break;
          drawFrame(img, img.naturalWidth, img.naturalHeight, t, kenBurns(t, dur));
          opts.onProgress?.((elapsedBefore + t) / total, `渲染第 ${i + 1} / ${segments.length} 段`);
          await nextFrame();
        }
      } else if (a.kind === "video") {
        const v = videos.get(a.id)!;
        const g = gains.get(a.id); if (g) g.gain.value = 1;
        v.currentTime = Math.min(seg.start, Math.max(0, (v.duration || seg.end) - 0.05));
        await Promise.race([new Promise<void>((res) => { v.onseeked = () => res(); }), sleep(4000)]);
        // Safari 等对「有声自动播放」更严：离开点击手势太久 play() 会被拒或迟迟不 resolve；
        // 被拒就静音重试（至少画面能动），并限时，避免卡死在这里
        await guard(v.play().catch(async () => { v.muted = true; await v.play().catch(() => undefined); }), 5000, "play", opts.signal).catch((e: Error) => { if (e.message === "已取消导出") throw e; });
        while (true) {
          check(); const t = (performance.now() - segStart) / 1000;
          if (t >= dur || v.currentTime >= seg.end || v.ended) break;
          drawFrame(v, v.videoWidth || 16, v.videoHeight || 9, t);
          opts.onProgress?.((elapsedBefore + t) / total, `渲染第 ${i + 1} / ${segments.length} 段`);
          await nextFrame();
        }
        v.pause(); if (g) g.gain.value = 0;
      } else {
        // 纯音频素材当作片段：黑场 + 字幕
        while (true) { check(); const t = (performance.now() - segStart) / 1000; if (t >= dur) break; composeFrame(ctx, W, H, null, seg, t, dur, i, segments.length, frameOpts); await nextFrame(); }
      }
      elapsedBefore += dur;
    }
    opts.onProgress?.(1, "封装文件");
    await sleep(300);
    rec.stop(); await guard(stopped, 15000, "封装文件超时，请重试");
  } catch (e) { try { if (rec && rec.state !== "inactive") rec.stop(); } catch { /* ignore */ } cleanup(); throw e; }
  cleanup();
  const blob = new Blob(chunks, { type: mime.split(";")[0] });
  if (!blob.size) throw new Error("没有录到任何画面，请保持标签页在前台后重试");
  return { blob, mime: mime.split(";")[0], duration: (performance.now() - t0) / 1000, url: URL.createObjectURL(blob) };
}

export function downloadBlob(blob: Blob, name: string) {
  // 挂进 DOM 再点：老版 Firefox 对游离的 <a download> 不触发下载；大文件给足时间再回收
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.style.display = "none"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
export const extOf = (mime: string) => (mime.includes("mp4") ? "mp4" : "webm");
