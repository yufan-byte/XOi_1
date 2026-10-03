"use client";
import { Suspense } from "react";
import * as Sw from "@radix-ui/react-switch";
import { CircleCheck, Inbox, Info, Search } from "lucide-react";
import { ResellerShell } from "@/components/reseller/shell";
import { ResellerGate } from "@/components/reseller/common";
import { useIsReseller } from "@/lib/reseller/client";
import { cn } from "@/lib/utils";

/**
 * 旧版菜单子页页头（参考站三种写法）：
 * - lg：财务类，图标方块与 text-2xl 标题同行，副标题在下（items-end）
 * - md：渠道 / 账号类，图标方块在左，text-xl 标题 + 副标题在右
 * - plain：站内运营类，仅 text-xl 标题 + 副标题
 * - banner：客户分析类，信息条（Info 图标 + 标题 + 说明）
 * - none：不渲染页头（页面自带）
 */
export type HeadVariant = "lg" | "md" | "plain" | "banner" | "none";

export function LegacyHead({ variant = "md", icon, title, subtitle, right }: { variant?: HeadVariant; icon?: React.ReactNode; title: string; subtitle?: string; right?: React.ReactNode }) {
  if (variant === "none") return null;
  if (variant === "banner") return (
    <section className="flex items-start gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <Info size={18} className="mt-0.5 shrink-0 text-primary" />
      <div><p className="text-sm font-semibold text-foreground">{title}</p>{subtitle && <p className="mt-1 text-sm leading-6 text-muted-foreground">{subtitle}</p>}</div>
    </section>
  );
  if (variant === "lg") return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {icon && <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/[0.14] text-primary [&_svg]:size-[18px]">{icon}</span>}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        </div>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {variant === "md" && icon && <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.16] text-primary [&_svg]:size-[18px]">{icon}</span>}
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

/** 旧版菜单子页外框：代理商中心壳 + 未开通引导 + 页头 */
export function LegacyPage({ title, subtitle, right, children, bare, icon, head, narrow, gap }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; bare?: boolean; icon?: React.ReactNode; head?: HeadVariant; narrow?: boolean; gap?: string }) {
  const ok = useIsReseller(); const variant: HeadVariant = bare ? "none" : head ?? "md";
  const space = gap ?? (variant === "lg" || narrow ? "space-y-6" : variant === "banner" ? "space-y-4" : "space-y-5");
  return (
    <ResellerShell>
      {!ok ? <ResellerGate title={title} /> : (
        <div className={cn("w-full", space, narrow && "max-w-3xl")}>
          <LegacyHead variant={variant} icon={icon} title={title} subtitle={subtitle} right={right} />
          <Suspense fallback={<div className="h-72 rounded-2xl shimmer" />}>{children}</Suspense>
        </div>
      )}
    </ResellerShell>
  );
}

/** 加载失败提示条（页面结构照常渲染，数据按空值 / 默认值展示） */
export function ErrorBanner({ error, suffix, onRetry }: { error: unknown; suffix?: string; onRetry?: () => void }) {
  if (!error) return null;
  return <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{(error as Error).message}{suffix}{onRetry && <button type="button" className="ml-2 text-primary underline" onClick={onRetry}>重试</button>}</div>;
}

/**
 * 参考站 KPI 卡：大写小标签 + 右上图标方块 + 数值 + 底部说明。
 *
 * 视觉重做（2026-10-03）：原来图标方块是 `bg-primary/[0.16]` 的极淡紫、卡片又是纯白平铺，
 * 整排 KPI 在浅色主题下"洗白"得几乎看不见层次。现在：
 *   · 顶部加一层很淡的品牌色渐变，卡片本身带柔和投影（--shadow-soft）；
 *   · 强调项（accent）的图标方块改为**实心品牌色**，一眼能找到关键指标；
 *   · 数值加大加粗、收字距，读起来更像仪表盘而不是普通段落。
 */
export function Kpi({ label, value, sub, icon, accent, dim, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; accent?: boolean; dim?: boolean; className?: string }) {
  return (
    <div className={cn("group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_7%,transparent),transparent)]" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <p className="pt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        {icon && (
          <span className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4",
            accent
              ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_color-mix(in_srgb,var(--primary)_85%,transparent)]"
              : "bg-muted/70 text-muted-foreground ring-1 ring-inset ring-border/60",
          )}>{icon}</span>
        )}
      </div>
      <p className={cn("relative mt-3.5 text-[1.75rem] font-bold leading-none tracking-[-0.02em] tabular-nums", dim ? "text-muted-foreground" : "text-foreground")}>{value}</p>
      <div className="relative mt-2.5 flex items-center gap-2 text-xs">{sub && <span className="text-muted-foreground">{sub}</span>}</div>
    </div>
  );
}

/** 普通内容卡 */
export const cardCls = "rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-soft)]";
export function Card({ title, icon, right, children, className, bodyClass }: { title?: React.ReactNode; icon?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn(cardCls, "p-5", className)}>
      {(title || right) && <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold text-foreground [&_svg]:size-4">{icon}{title}</h2>{right}</div>}
      {children !== undefined && <div className={cn(title || right ? "mt-4" : "", bodyClass)}>{children}</div>}
    </section>
  );
}

/** 参考站 surface-empty-panel 空态 */
export function EmptyPanel({ icon, title, desc, className }: { icon?: React.ReactNode; title: string; desc?: string; className?: string }) {
  return (
    <div className={cn("rounded-[24px] border border-border/55 bg-muted/30 px-6 py-10 text-center", className)}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border/45 bg-muted text-muted-foreground [&_svg]:size-6">{icon ?? <Inbox />}</div>
      <div className="mt-4 text-lg font-semibold text-foreground">{title}</div>
      {desc && <div className="mt-2 text-sm leading-7 text-muted-foreground">{desc}</div>}
    </div>
  );
}

/** 表格内空态（图标 + 标题 + 说明，py-16） */
export function EmptyTable({ icon, title, desc }: { icon: React.ReactNode; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted-foreground [&>svg]:size-7">
      {icon}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {desc && <p className="max-w-md text-xs leading-5 text-muted-foreground">{desc}</p>}
    </div>
  );
}

/** 「当前生效」摘要卡 */
export function CurrentPanel({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <section className={cn(cardCls, "p-5")}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><CircleCheck size={14} className="text-success" />当前生效</div>
      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([k, v]) => <div key={k} className="min-w-0"><dt className="truncate text-xs text-muted-foreground">{k}</dt><dd className="mt-1 truncate text-base font-semibold tabular-nums text-foreground">{v}</dd></div>)}
      </dl>
    </section>
  );
}

/** 设置行卡：左 220px 标题说明｜右 控件 */
export function RowsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(cardCls, "px-5 py-1.5", className)}>{children}</div>;
}
export function SetRow({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-border/50 py-4 last:border-b-0 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-center sm:gap-4">
      <div className="min-w-0"><div className="text-sm font-medium text-foreground">{title}</div>{desc && <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{desc}</div>}</div>
      <div className="min-w-0 sm:w-full">{children}</div>
    </div>
  );
}

/** shadcn 尺寸的小开关（h-[1.15rem] w-8） */
export function MiniSwitch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <Sw.Root checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} className="peer inline-flex h-[1.15rem] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input shadow-xs outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary">
      <Sw.Thumb className="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0" />
    </Sw.Root>
  );
}

export function SaveRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 pt-2">{children}</div>;
}

/** 输入框（shadcn h-9） */
export const fieldCls = "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50";
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative w-full max-w-xs", className)}>
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cn(fieldCls, "pl-8")} />
    </div>
  );
}

/** 圆角胶囊筛选（提现记录状态） */
export function PillTabs<T extends string | number>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap items-center gap-1">
      {tabs.map((t) => <button key={String(t.value)} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150", value === t.value ? "bg-primary/[0.16] text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{t.label}</button>)}
    </div>
  );
}

/** 日期区间：今日 / 昨日 / 前天 / 本周 / 上周 / 本月 / 上月 / 全部 */
export const RANGES = ["今日", "昨日", "前天", "本周", "上周", "本月", "上月", "全部"] as const;
export type Range = (typeof RANGES)[number];
export function rangeOf(r: Range, now = new Date()): [number, number] {
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const DAY = 86400000;
  const wd = (now.getDay() + 6) % 7; const w0 = d0 - wd * DAY;
  const m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); const pm0 = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  switch (r) {
    case "今日": return [d0, Infinity];
    case "昨日": return [d0 - DAY, d0];
    case "前天": return [d0 - 2 * DAY, d0 - DAY];
    case "本周": return [w0, Infinity];
    case "上周": return [w0 - 7 * DAY, w0];
    case "本月": return [m0, Infinity];
    case "上月": return [pm0, m0];
    default: return [0, Infinity];
  }
}
/** 区间分段控件（参考站：描边容器 + 选中淡色填充） */
export function RangeTabs({ value, onChange, className, boxed = true }: { value: Range; onChange: (r: Range) => void; className?: string; boxed?: boolean }) {
  return (
    <div role="tablist" className={cn("flex flex-wrap items-center gap-1", boxed && "w-fit rounded-xl border border-border bg-card p-1", className)}>
      {RANGES.map((r) => <button key={r} type="button" role="tab" aria-selected={value === r} onClick={() => onChange(r)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150", value === r ? "bg-primary/[0.18] text-primary" : "text-muted-foreground hover:text-foreground")}>{r}</button>)}
    </div>
  );
}

/** 小统计卡（兼容旧调用，样式同 Kpi） */
export function Stat({ label, value, sub, className, icon, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string; icon?: React.ReactNode; accent?: boolean }) {
  return <Kpi label={label} value={value} sub={sub} className={className} icon={icon} accent={accent} />;
}

/** 按日柱状趋势：有数据的日期才出柱（无数据时仅显示今天），标签在柱下 */
export function DayBars({ points, days = 30, label }: { points: { at: number; v: number }[]; days?: number; label: (v: number) => string }) {
  const now = new Date(); const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const DAY = 86400000;
  const all = Array.from({ length: days }, (_, i) => { const start = d0 - (days - 1 - i) * DAY; return { start, v: points.filter((p) => p.at >= start && p.at < start + DAY).reduce((s, p) => s + p.v, 0) }; });
  const first = all.findIndex((b) => b.v > 0); const buckets = first < 0 ? all.slice(-1) : all.slice(first);
  const max = Math.max(1e-9, ...buckets.map((b) => b.v));
  const md = (t: number) => { const x = new Date(t); return `${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getDate()).padStart(2, "0")}`; };
  const cols = { gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` };
  return (
    <div className="grid gap-2">
      <div role="img" aria-label="趋势" className="grid h-36 items-end gap-2" style={cols}>
        {buckets.map((b) => <button key={b.start} type="button" title={`${md(b.start)}: ${label(b.v)}`} aria-label={`${md(b.start)}: ${label(b.v)}`} className="group relative flex h-full cursor-default flex-col items-center justify-end outline-none"><span className="w-full rounded-t-lg bg-primary transition-[height] duration-200" style={{ height: `${Math.max(3, (b.v / max) * 100)}%`, opacity: b.v ? 1 : 0.35 }} /></button>)}
      </div>
      <div className="grid gap-2 text-center text-[11px] text-muted-foreground" style={cols}>{buckets.map((b) => <span key={b.start} className="truncate">{md(b.start)}</span>)}</div>
    </div>
  );
}
