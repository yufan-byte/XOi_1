"use client";
import Link from "next/link";
import { ArrowRight, Building2, Globe2, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** 代理商中心通用：算力（⚡）格式化、日期格式、页头、统计卡、标签页、On/Off、空态、未开通引导 */
export function fmtZap(v: number) {
  if (!Number.isFinite(v) || v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}
export const zap = (v: number) => `⚡${fmtZap(v)}`;
export function Zap({ v, className }: { v: number; className?: string }) { return <span className={cn("tabular-nums", className)}>⚡{fmtZap(v)}</span>; }
export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
export const dateCn = (ts: number) => { if (!ts) return "—"; const d = new Date(ts); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
export const dateSlash = (ts: number) => { if (!ts) return "—"; const d = new Date(ts); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
export const dateTimeShort = (ts: number) => { if (!ts) return "—"; const d = new Date(ts); return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const dateTimeFull = (ts: number) => (ts ? new Date(ts).toLocaleString("zh-CN", { hour12: false }) : "—");

/** 简洁的管理页页头，标题、说明与右侧操作保持稳定层级，不叠加装饰光晕。 */
export function SectionHero({ badge, icon, title, subtitle, right, className }: { badge: string; icon?: React.ReactNode; title: string; subtitle?: string; right?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("xoi-admin-section-header relative rounded-2xl border border-border bg-card px-5 py-5", className)}>
      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">{icon}{badge}</div>
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-muted-foreground md:text-sm">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
/** 参考站 vault 面板：细边框 + 大写小标题（可选图标）+ 分隔线 */
export function VaultPanel({ icon, title, right, children, className }: { icon?: React.ReactNode; title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[16px] border border-border/60 bg-card p-5 shadow-[var(--shadow-soft)] transition-colors duration-200 hover:border-border", className)}>
      {title && <div className="mb-5 flex items-center justify-between border-b border-border/30 pb-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-foreground">{icon && <span className="text-primary [&_svg]:size-4">{icon}</span>}{title}</div>{right}</div>}
      {children}
    </div>
  );
}
export function StatCard({ label, value, sub, icon, right, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("pane p-5", className)}>
      <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span>{icon}</div>
      <div className="mt-2 font-mono text-3xl font-bold tabular-nums">{value}</div>
      {(sub || right) && <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{sub}</span>{right}</div>}
    </div>
  );
}
export function CardTitle({ icon, children, right }: { icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-base font-semibold"><span className="text-primary">{icon}</span>{children}</div>{right}</div>;
}
export function EmptyBox({ title, desc, className }: { title: string; desc?: string; className?: string }) {
  return <div className={cn("rounded-2xl border border-dashed px-6 py-10 text-center", className)}><div className="text-[15px] text-foreground">{title}</div>{desc && <div className="mt-1 text-sm text-muted-foreground">{desc}</div>}</div>;
}
export function TabBar<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: string; icon?: React.ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("flex flex-wrap gap-1 border-b", className)}>
      {tabs.map((t) => <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} className={cn("-mb-px flex h-11 items-center gap-2 border-b-2 px-4 text-[15px] transition-colors", value === t.value ? "border-warning font-medium text-warning" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.icon}{t.label}</button>)}
    </div>
  );
}
export function OnOff({ value, onChange, labels = ["On", "Off"] }: { value: boolean; onChange: (v: boolean) => void; labels?: [string, string] }) {
  return (
    <div className="inline-flex rounded-xl border p-0.5">
      <button type="button" aria-pressed={value} onClick={() => onChange(true)} className={cn("h-8 rounded-lg px-4 text-sm", value ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted")}>{labels[0]}</button>
      <button type="button" aria-pressed={!value} onClick={() => onChange(false)} className={cn("h-8 rounded-lg px-4 text-sm", !value ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted")}>{labels[1]}</button>
    </div>
  );
}
export function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><div className="text-sm font-medium">{label}{required && <span className="text-danger"> *</span>}</div>{hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}<div className="mt-2">{children}</div></label>;
}
export const inputCls = "h-11 w-full rounded-xl border bg-card px-4 text-sm outline-none focus:border-primary/50";
export function Avatar({ name, className }: { name: string; className?: string }) { return <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-tint text-sm font-semibold text-primary", className)}>{(name || "?").slice(0, 1).toUpperCase()}</span>; }

/** 未开通代理时的引导（与 /reseller/[section] 一致） */
export function ResellerGate({ title }: { title: string }) {
  return (
    <section className="pane mx-auto max-w-4xl px-8 py-12 text-center">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-[#fff8e6] text-warning"><Sparkles size={36} /></span>
      <h2 className="mt-6 text-4xl font-bold">成为代理商</h2>
      <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-muted-foreground">您当前还不是代理商。「{title}」需申请并获平台批准后使用。代理商中心用于管理归属客户、收益及收款资料；整站品牌由平台管理员统一设置。</p>
      <div className="mx-auto mt-8 max-w-xl space-y-3 text-left">
        {["按平台规则查看客户分润", "仅查看归属自己的客户和收益", "管理卡密与收款资料"].map((t) => <div key={t} className="flex items-center gap-3 rounded-2xl border px-5 py-4 text-[15px]"><ShieldCheck size={18} className="text-success" />{t}</div>)}
      </div>
      <div className="mx-auto mt-8 grid max-w-3xl gap-4 text-left md:grid-cols-2">
        {[[Globe2, "客户管理", "通过邀请方式建立客户归属，查看自己权限范围内的客户。"], [Building2, "收益管理", "按平台已批准的规则管理收益；申请通过不代表开通独立品牌分站。"]].map(([I, t, d]) => { const Icon = I as typeof Globe2; return (
          <div key={String(t)} className="rounded-2xl border p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff8e6] text-warning"><Icon size={20} /></span><span className="text-lg font-semibold">{String(t)}</span></div><p className="mt-3 text-sm leading-7 text-muted-foreground">{String(d)}</p></div>
        ); })}
      </div>
      <Link href="/reseller/recruit" className="mt-10 inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-8 text-[15px] font-medium text-white shadow-pop hover:bg-primary-strong">立即申请</Link>
    </section>
  );
}

/** 分页页码序列：1 … p-1 p p+1 … n（页数多时中间折叠，避免长列表把页脚撑爆）。 */
function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  const picked = Array.from(new Set([1, pageCount, page - 1, page, page + 1])).filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  picked.forEach((n, i) => { if (i > 0 && n - (picked[i - 1] as number) > 1) out.push("gap"); out.push(n); });
  return out;
}

/**
 * 通用分页条。列表一页装得下时不渲染（避免空页脚），
 * 超过一页时给出「上一页 / 页码 / 下一页」和总数说明。
 */
export function Pager({ page, pageCount, total, onChange, unit = "条", className }: {
  page: number; pageCount: number; total: number; onChange: (page: number) => void; unit?: string; className?: string;
}) {
  if (pageCount <= 1) return null;
  const safe = Math.min(Math.max(1, page), pageCount);
  const move = (next: number) => { if (next >= 1 && next <= pageCount && next !== safe) onChange(next); };
  const navBtn = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav className={cn("mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-border/45 pt-3", className)} aria-label="分页">
      <span className="text-[11px] text-muted-foreground">共 {total} {unit} · 第 {safe} / {pageCount} 页</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={navBtn} disabled={safe <= 1} onClick={() => move(safe - 1)}>上一页</button>
        {pageWindow(safe, pageCount).map((item, index) => item === "gap"
          ? <span key={`gap-${index}`} className="px-1 text-xs text-muted-foreground">…</span>
          : <button key={item} type="button" aria-current={item === safe ? "page" : undefined}
              className={cn(navBtn, item === safe && "border-primary/50 bg-primary/10 text-primary")}
              onClick={() => move(item)}>{item}</button>)}
        <button type="button" className={navBtn} disabled={safe >= pageCount} onClick={() => move(safe + 1)}>下一页</button>
      </div>
    </nav>
  );
}
