"use client";
// 超级智能体专用浮层（与参考站一致）：
// - OmniDialog：omni-modal —— 白 60% 磨砂遮罩 + 顶部紫色光晕；1.4px 描边框 + 圆角 12.6 白色面板；右上 39.6 关闭钮
// - PickerSheet：va-pk-modal —— 锚定在触发胶囊下方 10px、左对齐，宽 460、最高 320，圆角 24 磨砂浅灰底，透明遮罩点击关闭
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function OmniDialog({ open, onOpenChange, title, description, className, panelClassName, children, footer, headless }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; className?: string; panelClassName?: string; children: React.ReactNode; footer?: React.ReactNode; headless?: boolean }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-white/60 backdrop-blur-sm animate-in fade-in-0 dark:bg-black/50" />
        <D.Content className={cn("fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100vh-35.2px)] w-[min(460px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] bg-black/[0.09] p-[1.4px] font-medium shadow-[0_1px_3px_rgba(255,255,255,0.22),0_20px_46px_-20px_rgba(255,255,255,0.55)] outline-none animate-in fade-in-0 zoom-in-95", className)}>
          <div className={cn("min-h-0 overflow-y-auto rounded-[12.6px] bg-card p-[22px]", panelClassName)}>
            <D.Title className={headless ? "sr-only" : "text-[14px] font-[650] leading-none tracking-[-0.01em]"}>{title}</D.Title>
            {description && !headless ? <D.Description className="mt-[6px] text-[12px] leading-[19.2px] text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{description ?? title}</D.Description>}
            {children}
            {footer}
          </div>
          <D.Close className="absolute right-[17.6px] top-[17.6px] z-30 grid h-[39.6px] w-[39.6px] place-items-center rounded-[10px] border border-border/35 bg-white/20 text-muted-foreground/70 transition-colors hover:text-foreground" aria-label="关闭"><X className="h-[16.7px] w-[16.7px]" /><span className="sr-only">关闭</span></D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** 锚定弹层：anchor 为触发按钮；Esc / 点遮罩关闭 */
export function PickerSheet({ open, onClose, anchor, title, children, height }: { open: boolean; onClose: () => void; anchor: HTMLElement | null; title: string; children: React.ReactNode; height?: number }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => { const r = anchor.getBoundingClientRect(); const w = Math.min(460, window.innerWidth - 24); setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)), top: r.bottom + 10 }); };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, anchor]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open, onClose]);
  if (!open || !pos || typeof document === "undefined") return null;
  // 下方空间不足 320 时向上翻
  const maxH = Math.min(320, window.innerHeight - 24);
  const top = pos.top + Math.min(height ?? 320, maxH) > window.innerHeight - 12 ? Math.max(12, pos.top - 44 - Math.min(height ?? 320, maxH)) : pos.top;
  return createPortal(
    <div role="dialog" aria-label={title} className="fixed inset-0 z-50">
      <div className="absolute inset-0" onClick={onClose} />
      <div style={{ left: pos.left, top, maxHeight: maxH }} className="absolute flex w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px] border border-black/[0.055] bg-muted/[0.94] font-medium shadow-[0_20px_60px_-24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(17,17,17,0.06)] backdrop-blur-[24px] backdrop-saturate-[1.3] animate-in fade-in-0 slide-in-from-top-1">
        <div className="flex shrink-0 items-center justify-between px-[20px] pb-[12px] pt-[18px] text-[16px] font-semibold leading-[25.6px] tracking-[-0.01em]">
          <span>{title}</span>
          <button type="button" onClick={onClose} className="grid h-[36px] w-[36px] place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" aria-label="关闭"><X className="h-[15px] w-[15px]" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export const PK = {
  filter: "flex shrink-0 items-center gap-[8px] px-[14px] pb-[10px]",
  search: "flex h-[32px] min-w-0 flex-1 items-center gap-[7px] rounded-[2px] border border-black/[0.055] bg-white px-[10px] text-muted-foreground",
  input: "min-w-0 flex-1 bg-transparent text-[12px] leading-[19.2px] text-foreground outline-none placeholder:text-muted-foreground",
  vendor: "flex h-[32px] shrink-0 items-center gap-[5px] rounded-[2px] border border-black/[0.055] bg-white px-[10px] text-[11.5px] leading-[18.4px] text-muted-foreground",
  scroll: "min-h-0 flex-1 overflow-y-auto px-[12px] pb-[14px]",
  row: (sel: boolean) => cn("flex w-full items-center gap-[12px] rounded-[10px] border px-[12px] py-[10px] text-left transition-colors", sel ? "border-primary/35 bg-primary-tint" : "border-transparent hover:bg-foreground/[0.04]"),
  ic: "grid h-[32px] w-[32px] shrink-0 place-items-center rounded-[2px] border border-black/[0.055] bg-white text-primary",
  name: "block truncate text-[12.5px] font-bold leading-[20px] tracking-[0.05em]",
  desc: "mt-[2px] block truncate text-[11.5px] leading-[18.4px] text-muted-foreground",
  mark: "grid h-[22px] w-[22px] shrink-0 place-items-center text-primary",
  status: "px-[8px] pb-[22px] pt-[18px] text-center text-[12.5px] leading-[20px] text-muted-foreground",
};
