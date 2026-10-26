// 导演台工作区共享 UI 套件：从造物 workspace-ui / param-form / model-hero / media-page 摘编，
// 去掉造物特有的 ModelIcon 生态与分档价格逻辑，品牌图走 one-stop 的 providerLogoFor。
import { useEffect, useState } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as S from "@radix-ui/react-select";
import { ArrowUpRight, Check, ChevronDown, X } from "lucide-react";
import type { CatalogModel } from "@/lib/models";
import { cn } from "@/lib/utils";

/* ============ 厂商图标（造物 ModelIcon 同款：/one-stop/icons/providers 下的 SVG） ============ */
// 这些厂商图标是白色单色 SVG，需要深色底；sculpted 立体图标自带明暗，统一浅色底
const DARK = (p: string) => !p.includes("sculpted/") && (/(openai|midjourney|vidu|xai|alibaba)\.svg$/.test(p) || p.includes("external/"));
const ICON_BASE = "/one-stop/icons/providers/";
/** 按 系列 → 名称 → 模型 id 依次匹配厂商图标（与造物 ICONS 映射同一套口径） */
const ICON_RULES: [RegExp, string][] = [
  [/gpt|o1|o3|o4|openai|chatgpt|codex/i, "openai-logo.svg"],
  [/claude|anthropic/i, "sculpted/claude.svg"],
  [/deep[-_ ]?seek/i, "deepseek.svg"],
  [/gemini|veo/i, "google.svg"],
  [/\bwan\b|wanx|万相|aliyun|阿里/i, "alibaba.svg"],
  [/qwen|tongyi|通义|qwq/i, "external/qwen.svg"],
  [/doubao|seedance|seedream|jimeng|即梦|火山|volc|豆包|see[-_ ]?dream/i, "bytedance.svg"],
  [/kling|可灵/i, "kuaishou.svg"],
  [/vidu/i, "vidu.svg"],
  [/grok|xai/i, "sculpted/grok.svg"],
  [/mini[-_ ]?max|abab|hailuo|海螺/i, "minimax.svg"],
  [/moon[-_ ]?shot|kimi|月之暗面/i, "external/moonshot_bai.svg"],
  [/glm|chatglm|zhipu|智谱/i, "external/zai.svg"],
  [/sora/i, "sculpted/sora.svg"],
  [/\bfx\b|flux|kontext/i, "external/flux_bai.svg"],
  [/mid[-_ ]?journey|\bmj\b/i, "midjourney.svg"],
  [/pix[-_ ]?verse/i, "pixverse.svg"],
  [/suno/i, "external/suno.svg"],
  [/happyhorse/i, "external/happyhorse.svg"],
];
function iconPathFor(m: Pick<CatalogModel, "series" | "name" | "id">): string | null {
  for (const source of [m.series || "", m.name || "", m.id || ""]) {
    const text = source.trim();
    if (!text) continue;
    const hit = ICON_RULES.find(([re]) => re.test(text));
    if (hit) return ICON_BASE + hit[1];
  }
  return null;
}

/** 模型图标（造物 ModelIcon 同款）：白单色图标配深色底，其余浅色底；认不出回落首字母 */
export function ModelIcon({ model, size = 36, className }: { model: Pick<CatalogModel, "series" | "name" | "id">; size?: number; className?: string }) {
  const icon = iconPathFor(model);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-2xl border shadow-soft", icon && DARK(icon) ? "border-transparent bg-[#14141f]" : "border-border/60 bg-card", className)} style={{ width: size, height: size }}>
      {icon ? <img src={icon} alt="" width={size * 0.55} height={size * 0.55} /> : <span className="text-base font-bold text-muted-foreground">{(model.name || "?").slice(0, 1)}</span>}
    </span>
  );
}


/** 工作台顶部右侧控件（造物 topbarBtn：白底圆角胶囊 + 极淡投影） */
export function topbarBtn(variant: "neutral" | "accent" | "active" | "model" = "neutral") {
  return cn(
    "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl px-3 text-[12px] font-medium shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.12)] transition-colors",
    variant !== "model" && "active:scale-95",
    variant === "neutral" && "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
    variant === "accent" && "bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] font-semibold text-primary-strong hover:bg-[color-mix(in_srgb,var(--primary)_18%,var(--card))]",
    variant === "active" && "bg-primary/12 font-semibold text-primary-strong hover:bg-primary/18",
    variant === "model" && "bg-card text-primary-strong hover:bg-muted",
  );
}

/** 工作台悬停提示（造物 omni-tooltip-content：浅色浮层 + 标题 / 10px 说明） */
export function RichTip({ title, desc, content, side = "top", children, className }: { title?: React.ReactNode; desc?: React.ReactNode; content?: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; children: React.ReactNode; className?: string }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={8} collisionPadding={8} className={cn("z-50 w-fit max-w-[18rem] text-balance rounded-[10px] border border-border/40 bg-card px-3 py-1.5 text-[11px] font-medium leading-snug tracking-[0.01em] text-foreground shadow-pop animate-in fade-in-0 zoom-in-95", className)}>
          {content ?? <div className="space-y-0.5"><div className="font-medium text-foreground">{title}</div>{desc && <div className="text-[10px] font-normal text-muted-foreground">{desc}</div>}</div>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** 参数胶囊统一尺寸（造物 workbench-action-chip：34px 高、全圆角） */
export const PILL = "h-[34px] rounded-full";
export function benchChip(strong?: boolean) {
  return cn(
    "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60",
    strong
      ? "border-foreground/20 bg-muted text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_3%,transparent),0_1px_2px_color-mix(in_srgb,var(--foreground)_4%,transparent)] hover:border-foreground/30"
      : "border-foreground/[0.09] bg-muted/90 text-foreground/75 shadow-[0_1px_2px_color-mix(in_srgb,var(--foreground)_3%,transparent)] hover:border-foreground/20 hover:text-foreground",
  );
}
/** 固定值 / 说明胶囊（造物锁定的参数）：透明底 + 普通描边，不可点 */
export const FIXED_CHIP = "inline-flex h-8 max-w-full shrink-0 cursor-default select-none items-center gap-1.5 rounded-full border border-border bg-transparent px-3 text-[12px] font-medium text-foreground sm:h-9";
/** 下拉弹层底板（造物 omni-floating-content） */
export const FLOAT_PANEL = "rounded-[20px] border border-foreground/10 bg-card p-1.5 text-foreground shadow-[0_16px_48px_-18px_color-mix(in_srgb,var(--foreground)_20%,transparent),0_2px_6px_color-mix(in_srgb,var(--foreground)_4%,transparent)]";
export interface ParamOpt { value: string; label: string; description?: string }

/** 参数胶囊下拉（造物 ParamSelect：弹层顶部参数名标题，选项可带说明；accent 高亮影响价格的参数） */
export function ParamSelect({ label, value, options, onChange, className, active, accent, grid, hint }: { label: string; value: string; options: ParamOpt[]; onChange: (v: string) => void; className?: string; active?: boolean; accent?: boolean; grid?: boolean; hint?: string }) {
  const cur = options.find((o) => o.value === value);
  return (
    <S.Root value={value} onValueChange={onChange}>
      <S.Trigger aria-label={`${label}: ${cur?.label ?? value}`} title={`${label}: ${cur?.label ?? value}${hint ? ` · ${hint}` : ""}`} className={cn(className, benchChip(active), "max-w-full data-[state=open]:border-foreground/30 data-[state=open]:bg-muted data-[state=open]:text-foreground", accent && "border-primary/45 bg-primary/[0.07] text-primary hover:border-primary/60 data-[state=open]:border-primary/60 data-[state=open]:bg-primary/10 data-[state=open]:text-primary")}>
        <span className="min-w-0 truncate text-muted-foreground">{label}</span>
        <span className={cn("min-w-0 shrink-0 truncate", active && "font-semibold")}>{cur?.label ?? value}</span>
        <ChevronDown size={14} className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" side="top" align="start" sideOffset={6} className={cn("z-50 max-h-[min(646px,var(--radix-select-content-available-height))] overflow-hidden font-medium animate-in fade-in-0 zoom-in-95", FLOAT_PANEL, grid ? "w-[264px]" : "min-w-[max(var(--radix-select-trigger-width),12rem)]")}>
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          {hint && !grid && <div className="max-w-[18rem] px-2.5 pb-1 text-[11px] leading-4 text-muted-foreground/80">{hint}</div>}
          <S.Viewport className={cn(grid && "!grid grid-cols-5 gap-1")}>
            {options.map((o) => grid ? (
              <S.Item key={o.value} value={o.value} className="flex cursor-default select-none items-center justify-center rounded-xl border border-transparent py-1.5 text-xs outline-none transition-colors data-[highlighted]:bg-muted/70 data-[state=checked]:border-foreground/15 data-[state=checked]:bg-muted data-[state=checked]:font-semibold data-[state=checked]:text-foreground">
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ) : (
              <S.Item key={o.value} value={o.value} className="relative flex cursor-default select-none items-start justify-between gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-sm outline-none transition-[background,transform] duration-150 data-[highlighted]:translate-x-0.5 data-[highlighted]:bg-muted/70 data-[state=checked]:border-foreground/15 data-[state=checked]:bg-muted data-[state=checked]:shadow-[0_1px_3px_color-mix(in_srgb,var(--foreground)_5%,transparent)]">
                <div className="min-w-0"><div className="text-sm font-medium text-foreground"><S.ItemText>{o.label}</S.ItemText></div>{o.description && <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{o.description}</div>}</div>
                <S.ItemIndicator className="shrink-0 self-center text-foreground"><Check size={16} /></S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

/** 滑杆胶囊（造物 ParamRange：自由秒数等连续参数） */
export function ParamRange({ label, value, onChange, min, max, step, className, active, hint, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; className?: string; active?: boolean; hint?: string; unit?: string }) {
  return (
    <label className={cn(className, benchChip(active), "cursor-pointer gap-2")} title={hint ? `${label} · ${hint}` : `${label}: ${value}${unit ?? ""}`}>
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <input type="range" value={value} min={min} max={max} step={step ?? 1} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="w-20 accent-[var(--primary)] sm:w-24" />
      <span className="min-w-[2ch] text-right text-[12px] font-semibold tabular-nums text-foreground">{value}{unit}</span>
    </label>
  );
}

/** 生成数量 1x…Nx */
export const countOptions = (max = 50) => Array.from({ length: Math.max(1, Math.min(200, Math.floor(max))) }, (_, i) => ({ value: String(i + 1), label: `${i + 1}x` }));

/** 工作台空状态主视觉（造物 WorkspaceHero 简化版：品牌图 + 名称 + 系列 + 描述胶囊 + 推荐问题） */
export function WorkspaceHero({ model, suggestions, onSuggestion, caption, icon, subtitle }: { model: CatalogModel; suggestions?: string[]; onSuggestion?: (q: string) => void; caption?: string; icon?: React.ReactNode; subtitle?: string }) {
  return (
    <div className="pop-in relative z-10 flex w-full flex-col items-center text-center">
      {caption && <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/80 [@media(max-height:800px)]:mb-1">{caption}</div>}
      <div aria-hidden className="relative isolate grid h-[3.4rem] w-[3.4rem] place-items-center rounded-[1.55rem] [@media(max-height:800px)]:h-8 [@media(max-height:800px)]:w-8">
        <span className="absolute -inset-[0.8rem] -z-20 rounded-[1.9rem] bg-[radial-gradient(circle,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_70%)] opacity-30 blur-[18px]" />
        <span className="absolute -inset-[0.35rem] -z-10 rounded-[1.7rem] bg-[radial-gradient(circle,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_72%)] opacity-40 blur-[12px]" />
        {icon ?? <ModelIcon model={model} size={44} className="relative rounded-[14px]" />}
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground sm:mt-5 sm:text-3xl [@media(max-height:800px)]:mt-1 [@media(max-height:800px)]:text-2xl">{model.name}</h2>
      {(subtitle ?? model.series) && <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{subtitle ?? model.series}</p>}
      {(model.description || model.id) && (
        <p className="mt-3 max-w-full whitespace-normal break-words rounded-2xl border border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] bg-card px-4 py-2 text-center text-sm leading-6 text-muted-foreground shadow-soft sm:mt-5 sm:max-w-xl sm:px-5 sm:py-3 sm:leading-7 [@media(max-height:800px)]:mt-2 [@media(max-height:800px)]:max-w-4xl [@media(max-height:800px)]:px-3 [@media(max-height:800px)]:py-1 [@media(max-height:800px)]:leading-normal">{model.description || model.id}</p>
      )}
      {suggestions && suggestions.length > 0 && (
        <div className="mt-4 flex w-full max-w-[min(max(820px,64vw),1560px)] flex-wrap items-center justify-center gap-2 [@media(max-height:800px)]:mt-2 [@media(max-height:800px)]:gap-1">
          {suggestions.map((q) => (
            <button key={q} type="button" onClick={() => onSuggestion?.(q)} className="group inline-flex max-w-full items-center gap-2 rounded-tile border border-primary/15 bg-card px-4 py-2.5 text-left text-xs leading-5 text-foreground/[0.88] transition-colors hover:border-primary/35 hover:bg-primary/[0.03] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 sm:text-[13px] [@media(max-height:800px)]:py-1 [@media(max-height:800px)]:leading-normal">
              <span>{q}</span><ArrowUpRight size={14} className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 没有可选模型时的占位（造物 EmptyModel） */
export function EmptyModel({ modality, failed, onRetry }: { modality: string; failed?: boolean; onRetry?: () => void }) {
  if (failed) return <div className="mx-auto mt-16 max-w-md text-center"><div className="text-2xl font-semibold">价格加载失败</div><p className="mt-2 text-sm text-muted-foreground">网络不稳或访问太频繁，模型列表暂时没取到。</p>{onRetry && <button type="button" onClick={onRetry} className="chip mt-4 h-10 px-5 hover:bg-muted">点此重试</button>}</div>;
  return <div className="mx-auto mt-16 max-w-md text-center"><div className="text-2xl font-semibold">暂无可用{modality}模型</div><p className="mt-2 text-sm text-muted-foreground">请在左侧选择模型，或联系站长开通该类型的渠道。</p></div>;
}

/** 造物 omni 弹窗外壳（媒体页的抽屉 / 预估弹层共用） */
export function OmniDialog({ open, onOpenChange, title, description, icon, className, children, bare }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode;
  className?: string; children: React.ReactNode; bare?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[radial-gradient(48%_42%_at_50%_0,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_72%)] bg-background/60 backdrop-blur-[18px] animate-in fade-in-0" />
        <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-shell border border-foreground/10 bg-card font-medium text-foreground shadow-[0_16px_48px_-18px_color-mix(in_srgb,var(--foreground)_16%,transparent),0_2px_6px_color-mix(in_srgb,var(--foreground)_4%,transparent)] outline-none animate-in fade-in-0 zoom-in-95 sm:max-w-lg", className)}>
          <div className={cn(bare ? "flex flex-col gap-2 border-b border-border/30 pb-3" : "flex flex-col gap-2 border-b border-border/60 px-4 pb-3 pt-5 sm:px-6")}>
            <DialogPrimitive.Title className="flex items-center gap-2 pr-10 text-[15px] font-semibold leading-[1.1] tracking-[-0.02em]">{icon}{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="text-[12px] leading-[1.6] text-muted-foreground">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">对话框</DialogPrimitive.Description>}
          </div>
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 z-30 inline-flex size-8 items-center justify-center rounded-full border border-transparent bg-transparent text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground" aria-label="关闭"><X size={16} /><span className="sr-only">关闭</span></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** 右侧滑入抽屉（造物 TaskDrawer 的壳：白底 + 模糊 + slide-in-from-right） */
export function SideDrawer({ open, onOpenChange, title, description, icon, children, wide }: { open: boolean; onOpenChange: (v: boolean) => void; title: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/60 backdrop-blur-[18px] animate-in fade-in-0" />
        <DialogPrimitive.Content className={cn("fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col overflow-y-auto border-l border-border bg-background font-medium shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_10%,transparent),0_28px_88px_-24px_color-mix(in_srgb,var(--primary)_10%,transparent)] outline-none backdrop-blur-xl animate-in slide-in-from-right duration-500 sm:max-w-md", wide && "sm:max-w-xl")}>
          <div className="border-b border-border/60 px-4 pb-3 pr-12 pt-5 sm:px-5">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold text-foreground sm:text-lg">{icon}{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">{description}</DialogPrimitive.Description>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">{children}</div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-xl border border-border/35 bg-background/20 p-1.5 text-muted-foreground/70 opacity-80 transition-all hover:-translate-y-0.5 hover:bg-foreground/5 hover:text-foreground hover:opacity-100" aria-label="关闭"><X size={16} /><span className="sr-only">关闭</span></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** 全站 Tooltip Provider：挂在媒体页最外层一次即可 */
export function TipProvider({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={200}>{children}</TooltipPrimitive.Provider>;
}

/** 粘贴超长文本按行保留（造物 composer 同款，防半句话截断） */
export function trimByLine(cur: string, add: string, max: number): { text: string; dropped: number } {
  const room = Math.max(0, max - cur.length);
  if (add.length <= room) return { text: add, dropped: 0 };
  const lines = add.split("\n"); let out = "";
  for (const ln of lines) {
    if ((out ? out.length + 1 : 0) + ln.length > room) break;
    out = out ? `${out}\n${ln}` : ln;
  }
  if (!out) out = add.slice(0, room);
  return { text: out, dropped: add.length - out.length };
}

/** 挂载时取一次 now（渲染要求纯函数，作品卡「已等 N 分钟」用） */
export function useNow() { return useState(() => Date.now())[0]; }

/** 从视频抽末帧（造物 lib/llm lastFrame 同款）：seek 到结尾前一点，画到 canvas 导出 JPEG */
export function lastFrame(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous"; v.muted = true; v.preload = "auto"; v.src = url;
    const fail = () => reject(new Error("无法读取视频末帧"));
    v.onerror = fail;
    v.onloadedmetadata = () => { try { v.currentTime = Math.max(0, (v.duration || 0.1) - 0.06); } catch { fail(); } };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.9));
      } catch (e) { reject(e as Error); }
    };
    setTimeout(fail, 15000);
  });
}
