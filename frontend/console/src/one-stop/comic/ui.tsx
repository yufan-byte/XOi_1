"use client";
// 漫剧 / 短片共用的小 UI：状态徽标、顺序播放器、分段按钮组、字段包装
import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, SkipBack, SkipForward,Maximize,Volume2,VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenStatus } from "./types";

export function StatusBadge({ status, progress, label }: { status?: GenStatus; progress?: number; label?: string }) {
  const map: Record<GenStatus, { text: string; cls: string }> = {
    idle: { text: label ?? "未生成", cls: "bg-muted text-muted-foreground" },
    running: { text: `生成中${progress ? ` ${Math.round(progress)}%` : "…"}`, cls: "bg-primary-tint text-accent-foreground" },
    done: { text: "已完成", cls: "bg-success/12 text-success" },
    error: { text: "失败", cls: "bg-danger/12 text-danger" },
    stale: { text: "需重新生成", cls: "bg-warning/12 text-warning" },
  };
  const m = map[status ?? "idle"];
  return <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium", m.cls)}>{status === "running" && <Loader2 size={11} className="animate-spin" />}{m.text}</span>;
}

export function SegButtons<T extends string>({ value, options, onChange, size = "md", className }: { value: T; options: readonly T[] | { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md"; className?: string }) {
  const opts = (options as readonly (T | { value: T; label: string })[]).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <span className={cn("inline-flex rounded-2xl border bg-muted/60 p-1", className)}>
      {opts.map((o) => <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cn("rounded-xl px-3 hover:bg-card", size === "sm" ? "py-1 text-xs" : "py-1.5 text-sm", value === o.value && "bg-primary-tint font-medium text-accent-foreground")}>{o.label}</button>)}
    </span>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return <label className={cn("block", className)}><span className="mb-1.5 flex items-center gap-2 text-sm font-medium">{label}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</span>{children}</label>;
}

/** 「分 + 秒」时长输入：两个数字框，留空 = 自动 / 跟随（value 为秒；参考站大纲「每集时长」与建集「本集总时长」同款） */
export function DurationInput({ value, onChange, placeholder = "自动", size = "md", className, ariaLabel = "时长" }: { value?: number; onChange: (sec?: number) => void; placeholder?: string; size?: "sm" | "md"; className?: string; ariaLabel?: string }) {
  const has = value != null && value > 0;
  const m = has ? String(Math.floor(value / 60)) : ""; const s = has ? String(Math.round(value % 60)) : "";
  const set = (mm: string, ss: string) => { if (mm === "" && ss === "") { onChange(undefined); return; } const t = Math.max(0, Math.floor(Number(mm) || 0)) * 60 + Math.max(0, Math.floor(Number(ss) || 0)); onChange(t > 0 ? t : undefined); };
  const box = cn("rounded-lg border bg-background text-right tabular-nums outline-none focus:border-primary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none", size === "sm" ? "h-8 w-14 px-2 text-xs" : "h-10 w-16 px-2.5 text-sm");
  return (
    <span className={cn("inline-flex items-center gap-1.5", size === "sm" ? "text-xs" : "text-sm", className)}>
      <input type="number" min={0} inputMode="numeric" value={m} placeholder={placeholder} aria-label={`${ariaLabel}（分）`} onChange={(e) => set(e.target.value, s)} className={box} />
      <span className="text-muted-foreground">分</span>
      <input type="number" min={0} max={59} inputMode="numeric" value={s} placeholder={has ? "0" : ""} aria-label={`${ariaLabel}（秒）`} onChange={(e) => set(m, e.target.value)} className={box} />
      <span className="text-muted-foreground">秒</span>
    </span>
  );
}

export const inputCls = "h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary/50";
export const textareaCls = "w-full rounded-xl border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary/50";

export interface PlaylistItem { id: string; title: string; video: string; audio?: string }

/** 顺序播放器：一段播完自动播下一段；配音随段同步播放 */
export function PlaylistPlayer({ items, ratio = "16:9", className }: { items: PlaylistItem[]; ratio?: string; className?: string }) {
  const [rawIdx, setIdx] = useState(0); const [playing, setPlaying] = useState(false),[voiceMuted,setVoiceMuted]=useState(false);
  const vref = useRef<HTMLVideoElement>(null); const aref = useRef<HTMLAudioElement>(null);
  const idx = Math.max(0, Math.min(rawIdx, items.length - 1));
  const cur = items[idx];
  useEffect(() => {
    const v = vref.current; if (!v || !cur) return;
    v.load();aref.current?.load();
    if (playing) v.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id,cur?.video,cur?.audio]);
  const syncVoice=()=>{const v=vref.current,a=aref.current;if(!v||!a)return;if(Number.isFinite(a.duration))a.currentTime=Math.min(v.currentTime,a.duration);a.playbackRate=v.playbackRate;};
  const playVoice=()=>{setPlaying(true);syncVoice();if(aref.current)void aref.current.play().catch(()=>{setPlaying(false);vref.current?.pause();});};
  const stopVoice=()=>{setPlaying(false);aref.current?.pause();};
  const go = (n: number) => {const target=Math.max(0, Math.min(items.length - 1, n));if(target===idx&&vref.current){vref.current.currentTime=0;syncVoice();void vref.current.play().catch(()=>setPlaying(false));}else setIdx(target);setPlaying(true);};
  const toggle = () => { const v = vref.current,a=aref.current; if (!v) return;if(v.ended&&a&&!a.ended){if(playing)stopVoice();else {setPlaying(true);void a.play().catch(stopVoice);}return;}if (v.paused) v.play().catch(() => setPlaying(false));else v.pause(); };
  const next=()=>{if(idx<items.length-1){setIdx(idx+1);setPlaying(true);}else stopVoice();};
  if (!items.length) return <div className={cn("grid place-items-center rounded-2xl border border-dashed bg-muted/40 text-sm text-muted-foreground", className)} style={{ aspectRatio: ratio.replace(":", "/") }}>还没有可播放的片段</div>;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: ratio.replace(":", "/"), maxHeight: 560 }}>
        <video ref={vref} src={cur.video} className="h-full w-full object-contain" controls preload="metadata" muted={!!cur.audio} playsInline onPlay={playVoice} onPlaying={playVoice} onWaiting={()=>aref.current?.pause()} onPause={e=>{if(!e.currentTarget.ended&&e.currentTarget.readyState>0)stopVoice();}} onSeeking={syncVoice} onSeeked={()=>{if(!vref.current?.paused)playVoice();}} onRateChange={syncVoice} onVolumeChange={()=>{const v=vref.current,a=aref.current;if(v&&a){a.volume=v.volume;if(!v.muted)v.muted=true;}}} onEnded={()=>{const a=aref.current;if(a&&!a.ended&&Number.isFinite(a.duration)&&a.duration>a.currentTime+.1){setPlaying(true);return;}next();}} onError={stopVoice}/>
        {cur.audio && <audio ref={aref} src={cur.audio} muted={voiceMuted} preload="metadata" onEnded={()=>{if(vref.current?.ended)next();}} onError={stopVoice}/>}
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">{idx + 1} / {items.length} · {cur.title}</div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <button className="icon-btn h-10 w-10 hover:bg-muted" onClick={() => go(idx - 1)} aria-label="上一段"><SkipBack size={18} /></button>
        <button className="grid h-11 w-11 place-items-center rounded-full bg-primary text-white hover:bg-primary-strong" onClick={toggle} aria-label={playing ? "暂停" : "播放"}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <button className="icon-btn h-10 w-10 hover:bg-muted" onClick={() => go(idx + 1)} aria-label="下一段"><SkipForward size={18} /></button>
        {cur.audio&&<button className="icon-btn h-10 w-10 hover:bg-muted" onClick={()=>setVoiceMuted(v=>!v)} aria-label={voiceMuted?'打开台词声音':'静音台词'}>{voiceMuted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button>}
        <button className="icon-btn h-10 w-10 hover:bg-muted" onClick={()=>{const v=vref.current;if(!v)return;const full=v as HTMLVideoElement&{webkitEnterFullscreen?:()=>void};if(v.requestFullscreen)void v.requestFullscreen().catch(()=>full.webkitEnterFullscreen?.());else full.webkitEnterFullscreen?.();}} aria-label="全屏预览"><Maximize size={18}/></button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">{items.map((it, i) => <button key={it.id} onClick={() => go(i)} aria-label={`预览${it.title}`} className={cn("shrink-0 overflow-hidden rounded-xl border", i === idx && "border-primary ring-2 ring-primary/30")}><video src={it.video} muted className="h-16 w-28 object-cover" preload="none" /><span className="block max-w-28 truncate p-1 text-[10px] text-muted-foreground">{it.title}</span></button>)}</div>
    </div>
  );
}
