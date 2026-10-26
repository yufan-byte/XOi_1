"use client";
// 实时预览：不用导出，直接在 canvas 上按方案逐帧合成（和导出共用 composeFrame，看到的就是导出的样子）。
// 每个视频素材一个隐藏的静音 <video>（预览不出声，不建 AudioContext），照片用 Image() 缓存；
// rAF 推进全局时间，视频正常播放时以视频自己的进度为时钟，跑偏超过 0.25 秒才 seek，避免一直 seek 卡顿。
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { composeFrame, drawNotice, kenBurns, resolveFit, segDur, segmentAt, timelineDuration } from "./engine";
import { fmtDur, RATIOS, type ClipAsset, type EditPlan, type RatioKey } from "./types";

const DECODE_ERR = "这段素材浏览器无法解码 · 换素材或转码后重新上传";
const SEEK_TIMEOUT = 5000, LOAD_TIMEOUT = 30000;
/** seek 超时后派发到 <video> 上的自定义事件：暂停状态下没有 rAF，靠它回来重画并标成「无法解码」 */
const SEEK_STUCK = "mc-seek-stuck";
type Media = { el: HTMLVideoElement | HTMLImageElement; ready: boolean; bad: boolean; seekAt: number };
const isVideo = (el: Media["el"]): el is HTMLVideoElement => el instanceof HTMLVideoElement;

/** 竖屏画幅限高随视口走（560px 封顶），并在右栏里居中：以前固定 560px 高、贴左，笔记本屏上播放条落到首屏以下 */
export const ratioBox = (ratio: RatioKey) => cn("mx-auto", ratio === "9:16" ? "aspect-[9/16] max-h-[min(560px,calc(100dvh-3.5rem-190px))]" : ratio === "4:5" ? "aspect-[4/5] max-h-[min(560px,calc(100dvh-3.5rem-190px))]" : ratio === "1:1" ? "aspect-square max-h-[min(560px,calc(100dvh-3.5rem-190px))]" : "aspect-video");

export function ClipPreview({ plan, assets, ratio, suspended, suspendedText, className }: { plan?: EditPlan; assets: ClipAsset[]; ratio: RatioKey; suspended?: boolean; suspendedText?: string; className?: string }) {
  const r = RATIOS.find((x) => x.value === ratio) ?? RATIOS[0];
  const canvas = useRef<HTMLCanvasElement>(null); const bar = useRef<HTMLDivElement>(null);
  const media = useRef(new Map<string, Media>());
  const latest = useRef({ plan, assets });
  const tRef = useRef(0); const playRef = useRef(false); const dragging = useRef(false);
  const [t, setT] = useState(0); const [playing, setPlaying] = useState(false);
  // 渲染导出 / 切到「成片」页签时停下（按 React 推荐的「渲染期调整状态」写法，不在 effect 里 setState）
  const [prevSuspended, setPrevSuspended] = useState(suspended);
  if (suspended !== prevSuspended) { setPrevSuspended(suspended); if (suspended) setPlaying(false); }
  const total = plan ? timelineDuration(plan) : 0;

  /** 画当前时间点的一帧；只读 ref，所以 rAF / 媒体事件 / 方案变化都能直接调 */
  const draw = useCallback(() => {
    const c = canvas.current; const ctx = c?.getContext("2d"); if (!c || !ctx) return;
    const { plan, assets } = latest.current; const W = c.width, H = c.height;
    const at = plan ? segmentAt(plan, tRef.current) : null;
    if (!plan || !at) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }
    const seg = plan.segments[at.index]; const dur = segDur(seg); const a = assets[seg.source]; const n = plan.segments.length;
    const opts = { title: plan.title, transition: "fade" as const, fit: resolveFit(plan.fit, seg.fit) };
    // 不在当前段的视频一律停下，免得后台白白解码
    media.current.forEach((m, id) => { if (isVideo(m.el) && id !== a?.id && !m.el.paused) m.el.pause(); });
    if (!a || a.missing || !a.url) return drawNotice(ctx, W, H, "文件丢失");
    if (a.kind === "audio") return composeFrame(ctx, W, H, null, seg, at.local, dur, at.index, n, opts);
    const m = media.current.get(a.id); if (!m) return;
    if (m.bad) return drawNotice(ctx, W, H, DECODE_ERR, "#1a1a1d");
    if (!isVideo(m.el)) { if (m.ready) composeFrame(ctx, W, H, { src: m.el, sw: m.el.naturalWidth, sh: m.el.naturalHeight, zoom: kenBurns(at.local, dur) }, seg, at.local, dur, at.index, n, opts); return; }
    const v = m.el; const target = Math.min(seg.start + at.local, Math.max(0, (v.duration || seg.end) - 0.05));
    if (playRef.current) { if (v.paused && !v.seeking) v.play().catch(() => undefined); } else if (!v.paused) v.pause();
    // Safari：静音视频 seek 后要等 onseeked 才有新画面，期间保留上一帧；seek 迟迟不回来就当解不了码
    if (v.seeking) { if (performance.now() - m.seekAt > SEEK_TIMEOUT) { m.bad = true; drawNotice(ctx, W, H, DECODE_ERR, "#1a1a1d"); } return; }
    if (Math.abs(v.currentTime - target) > (playRef.current ? 0.25 : 0.04)) { m.seekAt = performance.now(); v.currentTime = target; setTimeout(() => { if (v.seeking) v.dispatchEvent(new Event(SEEK_STUCK)); }, SEEK_TIMEOUT + 50); return; }
    if (v.readyState < 2) return;
    composeFrame(ctx, W, H, { src: v, sw: v.videoWidth || 16, sh: v.videoHeight || 9 }, seg, at.local, dur, at.index, n, opts);
  }, []);

  // 素材 → 隐藏的媒体元素；卸载 / 换素材时全部释放（removeAttribute + load 才会真正放掉解码器）
  useEffect(() => {
    const map = new Map<string, Media>();
    for (const a of assets) {
      if (a.missing || !a.url || a.kind === "audio") continue;
      if (a.kind === "video") {
        const v = document.createElement("video"); const m: Media = { el: v, ready: false, bad: false, seekAt: 0 };
        v.muted = true; v.playsInline = true; v.preload = "auto";
        v.onloadeddata = () => { m.ready = true; draw(); }; v.onseeked = () => draw(); v.onerror = () => { m.bad = true; draw(); }; v.addEventListener(SEEK_STUCK, draw);
        v.src = a.url; map.set(a.id, m);
      } else {
        const img = new Image(); const m: Media = { el: img, ready: false, bad: false, seekAt: 0 };
        img.src = a.url; img.decode().then(() => { m.ready = true; draw(); }, () => { m.bad = true; draw(); }); map.set(a.id, m);
      }
    }
    media.current = map; draw();
    const timer = setTimeout(() => { map.forEach((m) => { if (!m.ready) m.bad = true; }); draw(); }, LOAD_TIMEOUT);
    return () => { clearTimeout(timer); map.forEach((m) => { if (isVideo(m.el)) { m.el.pause(); m.el.removeAttribute("src"); m.el.load(); } else m.el.src = ""; }); };
  }, [assets, draw]);

  // 方案 / 画幅一变就重画当前帧（暂停时改字幕、入出点当场可见）；段被删短了，时间夹回总长以内
  useEffect(() => { latest.current = { plan, assets }; if (plan) tRef.current = Math.min(tRef.current, timelineDuration(plan)); draw(); }, [plan, assets, ratio, draw]);

  // 播放循环：只在 playing 时跑
  useEffect(() => {
    playRef.current = playing; if (!playing) { draw(); return; }
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      const { plan, assets } = latest.current; const tot = plan ? timelineDuration(plan) : 0;
      let nt = tRef.current + dt; const at = plan ? segmentAt(plan, tRef.current) : null;
      if (plan && at) {
        const seg = plan.segments[at.index]; const a = assets[seg.source]; const m = a ? media.current.get(a.id) : undefined;
        if (m && !m.bad && isVideo(m.el)) {
          const v = m.el;
          if (v.seeking) nt = tRef.current; // 等 seek 完再走，别让时间跑到画面前面
          else if (!v.paused && Math.abs(v.currentTime - (seg.start + at.local)) <= 0.25) nt = at.offset + Math.min(segDur(seg), Math.max(at.local, v.currentTime - seg.start));
          if (v.ended || (!v.seeking && v.currentTime >= seg.end - 0.02 && !v.paused)) nt = Math.max(nt, at.offset + segDur(seg));
        }
      }
      if (nt >= tot) { tRef.current = tot; setT(tot); setPlaying(false); return; }
      tRef.current = nt; setT(nt); draw(); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); playRef.current = false; media.current.forEach((m) => { if (isVideo(m.el)) m.el.pause(); }); };
  }, [playing, draw]);

  const seekTo = (clientX: number) => { const el = bar.current; if (!el || !total) return; const b = el.getBoundingClientRect(); tRef.current = Math.max(0, Math.min(1, (clientX - b.left) / b.width)) * total; setT(tRef.current); draw(); };
  const nudge = (d: number) => { tRef.current = Math.max(0, Math.min(total, tRef.current + d)); setT(tRef.current); draw(); };
  const toggle = () => { if (!plan?.segments.length || suspended) return; if (!playing && tRef.current >= total - 0.05) { tRef.current = 0; setT(0); } setPlaying(!playing); };
  const shown = Math.min(t, total);
  // 段与段的分界刻度（成片里的百分比位置）
  const ticks = plan && total ? plan.segments.slice(0, -1).reduce<number[]>((xs, s) => [...xs, (xs.length ? xs[xs.length - 1] : 0) + (segDur(s) / total) * 100], []) : [];

  return (
    <div className={className}>
      <div className={cn("relative grid place-items-center bg-black", ratioBox(ratio))}>
        <canvas ref={canvas} width={r.w} height={r.h} onClick={toggle} className="h-full w-full cursor-pointer object-contain" aria-label="实时预览" />
        {!plan?.segments.length && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/70">还没有片段，加几段素材就能预览</div>}
        {suspended && suspendedText && <div className="absolute inset-0 grid place-items-center bg-black/60 p-6 text-center text-sm text-white/80">{suspendedText}</div>}
      </div>
      <div className="flex items-center gap-3 px-3 py-2">
        <button onClick={toggle} disabled={!plan?.segments.length || suspended} className="icon-btn h-8 w-8 hover:bg-muted disabled:opacity-40" aria-label={playing ? "暂停" : "播放"}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <div ref={bar} role="slider" tabIndex={0} aria-label="拖动定位" aria-valuemin={0} aria-valuemax={Math.round(total * 10) / 10} aria-valuenow={Math.round(shown * 10) / 10} aria-valuetext={`${fmtDur(shown)} / ${fmtDur(total)}`}
          onPointerDown={(e) => { if (suspended) return; e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; seekTo(e.clientX); }} onPointerMove={(e) => { if (dragging.current) seekTo(e.clientX); }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}
          onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); nudge(1); } else if (e.key === " ") { e.preventDefault(); toggle(); } }}
          className="relative h-5 flex-1 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${total ? (shown / total) * 100 : 0}%` }} /></div>
          {ticks.map((x, k) => <span key={k} className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-foreground/25" style={{ left: `${x}%` }} />)}
          <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow" style={{ left: `${total ? (shown / total) * 100 : 0}%` }} />
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{fmtDur(shown)} / {fmtDur(total)}</span>
      </div>
    </div>
  );
}
