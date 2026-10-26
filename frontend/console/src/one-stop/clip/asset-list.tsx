"use client";
// 素材列表：缩略图 / 时长 / 尺寸，可删除，可拖拽排序
import { useState } from "react";
import { Film, GripVertical, Image as ImageIcon, Music, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDur, fmtSize, type ClipAsset } from "./types";

export function AssetThumb({ a, className }: { a: ClipAsset; className?: string }) {
  return (
    <span className={cn("relative grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted", className)}>
      {a.thumb ? <img src={a.thumb} alt="" className="h-full w-full object-cover" /> : a.kind === "audio" ? <Music size={18} className="text-muted-foreground" /> : a.kind === "image" ? <ImageIcon size={18} className="text-muted-foreground" /> : <Film size={18} className="text-muted-foreground" />}
      {a.kind !== "image" && a.duration > 0 && <span className="absolute bottom-0.5 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{fmtDur(a.duration)}</span>}
      {a.missing && <span className="absolute inset-0 grid place-items-center bg-black/60 text-[10px] text-white">文件丢失</span>}
    </span>
  );
}

export function AssetList({ assets, onRemove, onReorder, compact }: { assets: ClipAsset[]; onRemove?: (id: string) => void; onReorder?: (from: number, to: number) => void; compact?: boolean }) {
  const [drag, setDrag] = useState<number | null>(null); const [over, setOver] = useState<number | null>(null);
  if (!assets.length) return null;
  return (
    <ul className={cn("grid gap-2", compact ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3")}>
      {assets.map((a, i) => (
        <li key={a.id} draggable={!!onReorder}
          onDragStart={() => setDrag(i)} onDragOver={(e) => { if (onReorder) { e.preventDefault(); setOver(i); } }} onDragLeave={() => setOver(null)}
          onDrop={(e) => { e.preventDefault(); if (onReorder && drag !== null && drag !== i) onReorder(drag, i); setDrag(null); setOver(null); }} onDragEnd={() => { setDrag(null); setOver(null); }}
          className={cn("flex items-center gap-3 rounded-2xl border bg-card p-2 pr-3", over === i && "border-primary bg-primary-tint/40", drag === i && "opacity-50")}>
          {onReorder && <span className="cursor-grab text-muted-foreground"><GripVertical size={16} /></span>}
          {onReorder && <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>}
          <AssetThumb a={a} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{a.name}</div>
            <div className="text-xs text-muted-foreground">{a.kind === "video" ? "视频" : a.kind === "image" ? "照片" : "音频"}{a.width ? ` · ${a.width}×${a.height}` : ""} · {fmtSize(a.size)}</div>
          </div>
          {onRemove && <button onClick={() => onRemove(a.id)} className="icon-btn h-8 w-8 hover:bg-muted" aria-label="移除这个素材"><X size={14} /></button>}
        </li>
      ))}
    </ul>
  );
}
