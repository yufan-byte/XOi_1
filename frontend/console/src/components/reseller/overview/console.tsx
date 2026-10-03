"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, Cpu, Link2, Network, ScrollText, Trophy, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Zap, pct } from "@/components/reseller/common";
import { AgreementDialog } from "./agreement";

type Split = { direct: number; indirect: number; total: number };
export interface OverviewData {
  range: string; markupPct: number; share: number;
  totals: { income: Split; withdrawable: number; customers: number; direct: number; indirect: number; agents: number };
  period: { income: Split; consume: Split; topup: Split; newUsers: number; newDirect: number; newIndirect: number };
  series: { t: string; income: number; consume: number; topup: number }[];
  funnel: { registered: number; paid: number; repeat: number; topupRate: number; totalTopup: number; repurchaseRate: number };
  topCustomers: { id: number; username: string; consume: number }[];
  topModels: { model: string; consume: number; count: number }[];
}
const RANGES = [{ v: "today", l: "今日" }, { v: "yesterday", l: "昨天" }, { v: "week", l: "一周" }, { v: "30d", l: "近30日" }] as const;
const EMPTY_PREFIX: Record<string, string> = { today: "今日", yesterday: "昨天", week: "本周", "30d": "近30日" };

/** 与参考站一致：分润收益=品牌紫、客户消耗=绿、客户充值=琥珀 */
const SERIES = [{ key: "income", label: "分润收益", color: "var(--primary)" }, { key: "consume", label: "客户消耗", color: "var(--success)" }, { key: "topup", label: "客户充值", color: "var(--warning)" }] as const;

const card = "rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-soft)]";
const dashedEmpty = "rounded-xl border border-dashed border-border bg-card/30";

/** 经营走势：内联 SVG 折线图 */
function TrendChart({ data, empty }: { data: OverviewData["series"]; empty: string }) {
  const max = Math.max(0, ...data.flatMap((d) => [d.income, d.consume, d.topup]));
  if (!data.length || max <= 0) return <div className={cn("mt-4 flex h-64 flex-col items-center justify-center gap-2 text-center", dashedEmpty)}><Activity size={28} className="text-muted-foreground/70" /><p className="text-sm font-medium text-foreground">{empty}</p></div>;
  const W = 720, H = 240, P = { l: 44, r: 12, t: 12, b: 26 };
  const x = (i: number) => P.l + (data.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (data.length - 1));
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / max);
  const every = Math.ceil(data.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-64 w-full" role="img" aria-label="经营走势">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={P.l} x2={W - P.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeDasharray="3 4" /><text x={P.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{(max * f).toFixed(max * f >= 10 ? 0 : 2)}</text></g>)}
      {data.map((d, i) => i % every === 0 && <text key={d.t} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{d.t}</text>)}
      {SERIES.map((s) => (
        <g key={s.key}>
          <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" points={data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(" ")} />
          {data.map((d, i) => d[s.key] > 0 && <circle key={i} cx={x(i)} cy={y(d[s.key])} r={2.5} fill={s.color}><title>{`${d.t} ${s.label} ⚡${d[s.key].toFixed(3)}`}</title></circle>)}
        </g>
      ))}
    </svg>
  );
}

/** 概览 KPI 卡。视觉与 legacy/frame 的 Kpi 保持一致（顶部淡品牌渐变 + 强调项实心图标 + 柔和投影），
 *  否则概览页会显得比后台其它页"轻"一档，整体不成体系。 */
function KpiCard({ label, icon, value, children, accent }: { label: string; icon: React.ReactNode; value: React.ReactNode; children?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn(card, "relative h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30")}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_7%,transparent),transparent)]" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <p className="pt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <span className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4",
          accent ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_color-mix(in_srgb,var(--primary)_85%,transparent)]" : "bg-muted/70 text-muted-foreground ring-1 ring-inset ring-border/60",
        )}>{icon}</span>
      </div>
      <p className="relative mt-3.5 text-[1.75rem] font-bold leading-none tracking-[-0.02em] text-foreground tabular-nums">{value}</p>
      <div className="relative mt-2.5 flex items-center gap-2 text-xs">{children}</div>
    </div>
  );
}

/** 直接 vs 间接：堆叠条 + 图例 */
function SplitBar({ label, total, direct, indirect, zap }: { label: string; total: number; direct: number; indirect: number; zap?: boolean }) {
  const d = total > 0 ? Math.round((direct / total) * 100) : 0; const i = total > 0 ? Math.round((indirect / total) * 100) : 0;
  const fmt = (v: number) => (zap ? <Zap v={v} /> : `${v} 人`);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><span className="text-sm font-semibold tabular-nums text-foreground">{fmt(total)}</span></div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${d}%` }} /><div className="h-full bg-primary/30" style={{ width: `${i}%` }} /></div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-primary" aria-hidden />直接 {fmt(direct)} <span className="ml-0.5 tabular-nums text-foreground">{d}%</span></span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-full bg-primary/30" aria-hidden />间接 {fmt(indirect)} <span className="ml-0.5 tabular-nums text-foreground">{i}%</span></span>
      </div>
    </div>
  );
}

/** 代理商概览（管理员）：统计卡 / 区间指标 / 走势 / 漏斗 / 直接 vs 间接 / Top 榜 / 协议 */
export function OverviewConsole() {
  const [range, setRange] = useState<(typeof RANGES)[number]["v"]>("today");
  const [agree, setAgree] = useState(false);
  const q = useQuery({ queryKey: ["reseller", "overview", range], queryFn: () => api<OverviewData>(`/api/reseller/overview?range=${range}`), staleTime: 15_000 });
  const d = q.data; const p = d?.period; const pre = EMPTY_PREFIX[range]; const f = d?.funnel;
  const reg = f?.registered ?? 0; const w = (n: number) => `${reg > 0 ? Math.max(28, Math.round((n / reg) * 100)) : 100}%`;
  const steps = [{ k: "注册", n: reg, rate: null as number | null, tone: "bg-primary/20" }, { k: "充值", n: f?.paid ?? 0, rate: f?.topupRate ?? 0, tone: "bg-primary/12" }, { k: "复购", n: f?.repeat ?? 0, rate: null, tone: "bg-primary/[0.07]" }];
  return (
    <div className={cn("w-full space-y-4", q.isFetching && !d && "opacity-60")}>
      {q.isError && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{(q.error as Error).message} <button className="ml-2 text-primary underline" onClick={() => q.refetch()}>重试</button></div>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="累计收入" icon={<Link2 size={16} />} value={<Zap v={d?.totals.income.total ?? 0} />}><span className="text-muted-foreground">直接 <Zap v={d?.totals.income.direct ?? 0} /> · 间接 <Zap v={d?.totals.income.indirect ?? 0} /></span></KpiCard>
        <Link href="/reseller/finance?tab=withdrawals" className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary"><KpiCard accent label="可提现余额" icon={<Wallet size={16} />} value={<Zap v={d?.totals.withdrawable ?? 0} />}><span className="inline-flex items-center gap-1 font-medium text-primary">去提现<ArrowUpRight size={13} /></span></KpiCard></Link>
        <KpiCard label="客户总数" icon={<Users size={16} />} value={d?.totals.customers ?? 0}><span className="text-muted-foreground">直接 {d?.totals.direct ?? 0} 人 · 间接 {d?.totals.indirect ?? 0} 人</span></KpiCard>
        <KpiCard label="直属代理" icon={<Network size={16} />} value={d?.totals.agents ?? 0} />
      </section>

      <section className={cn("flex flex-wrap gap-x-6 gap-y-3 rounded-2xl border border-border bg-card px-5 py-4")}>
        {[["收益", <Zap key="a" v={p?.income.total ?? 0} />, <>直接 <Zap v={p?.income.direct ?? 0} /> · 间接 <Zap v={p?.income.indirect ?? 0} /></>], ["消费", <Zap key="b" v={p?.consume.total ?? 0} />, <>直接 <Zap v={p?.consume.direct ?? 0} /> · 间接 <Zap v={p?.consume.indirect ?? 0} /></>], ["新增", `+${p?.newUsers ?? 0}`, `直接 ${p?.newDirect ?? 0} 人 · 间接 ${p?.newIndirect ?? 0} 人`]].map(([k, v, s]) => (
          <div key={String(k)} className="flex min-w-[9rem] flex-col"><span className="text-xs text-muted-foreground">{k}</span><span className="mt-1 text-lg font-semibold tabular-nums text-foreground">{v}</span><span className="mt-1"><span className="text-[11px] text-muted-foreground">{s}</span></span></div>
        ))}
      </section>

      <div className="flex justify-end">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card/40 p-0.5" role="tablist" aria-label="统计区间">
          {RANGES.map((r) => <button key={r.v} role="tab" aria-selected={range === r.v} onClick={() => setRange(r.v)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150", range === r.v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>{r.l}</button>)}
        </div>
      </div>

      <section className={card} aria-label="经营走势">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold text-foreground">经营走势</h2></div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">{SERIES.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>)}</div>
        {d ? <TrendChart data={d.series} empty={`${pre}暂无数据`} /> : q.isError ? <TrendChart data={[]} empty={`${pre}暂无数据`} /> : <div className="mt-4 h-64 rounded-xl shimmer" />}
      </section>

      <section>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card} aria-label="转化漏斗">
            <h2 className="text-sm font-semibold text-foreground">转化漏斗</h2>
            <div className="mt-5">
              <ol className="grid gap-1" aria-label="邀请转化漏斗">
                {steps.map((s) => (
                  <li key={s.k} className="grid gap-1">
                    {s.rate != null && <div className="flex justify-center"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">→ {pct(s.rate)}</span></div>}
                    <div className="flex items-center gap-3"><div className={cn("flex h-11 items-center justify-between rounded-lg px-3 text-sm transition-[width] duration-300 motion-reduce:transition-none", s.tone)} style={{ width: w(s.n) }}><span className="truncate font-medium text-foreground">{s.k}</span><span className="ml-2 shrink-0 font-semibold tabular-nums text-foreground">{s.n}</span></div></div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
              <div><div className="text-base font-semibold tabular-nums text-foreground">{pct(f?.topupRate ?? 0)}</div><div className="mt-1 text-[11px] text-muted-foreground">充值转化率</div></div>
              <div><div className="text-base font-semibold tabular-nums text-foreground"><Zap v={f?.totalTopup ?? 0} /></div><div className="mt-1 text-[11px] text-muted-foreground">总充值</div></div>
              <div><div className="text-base font-semibold tabular-nums text-success">{pct(f?.repurchaseRate ?? 0)}</div><div className="mt-1 text-[11px] text-muted-foreground">复购率</div></div>
            </div>
          </div>
          <div className={card} aria-label="直接 vs 间接">
            <h2 className="text-sm font-semibold text-foreground">直接 vs 间接</h2>
            <div className="mt-5 grid gap-5">
              <SplitBar label={`${pre}新增注册`} total={p?.newUsers ?? 0} direct={p?.newDirect ?? 0} indirect={p?.newIndirect ?? 0} />
              <SplitBar zap label={`${pre}模型消耗`} total={p?.consume.total ?? 0} direct={p?.consume.direct ?? 0} indirect={p?.consume.indirect ?? 0} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-label="消费客户 Top">
          <div className="flex items-center gap-2"><Trophy size={16} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">消费客户 Top</h2></div>
          {d?.topCustomers.length ? <ol className="mt-4 space-y-2">{d.topCustomers.map((c, i) => <li key={c.id} className="flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm"><span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span><span className="truncate">{c.username}</span><Zap v={c.consume} className="ml-auto font-semibold" /></li>)}</ol> : <p className={cn("mt-6 px-4 py-8 text-center text-sm text-muted-foreground", dashedEmpty)}>{pre}暂无客户消费</p>}
        </section>
        <section className={card} aria-label="模型消费 Top">
          <div className="flex items-center gap-2"><Cpu size={16} className="text-primary" /><h2 className="text-sm font-semibold text-foreground">模型消费 Top</h2></div>
          {d?.topModels.length ? <ol className="mt-4 space-y-2">{d.topModels.map((m, i) => <li key={m.model} className="flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm"><span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span><span className="truncate">{m.model}</span><span className="text-xs text-muted-foreground">{m.count} 次</span><Zap v={m.consume} className="ml-auto font-semibold" /></li>)}</ol> : <p className={cn("mt-6 px-4 py-8 text-center text-sm text-muted-foreground", dashedEmpty)}>{pre}暂无模型调用</p>}
        </section>
      </div>

      <div className="fixed right-5 top-36 z-[80]">
        <button type="button" onClick={() => setAgree(true)} aria-label="协议" title="协议" className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-foreground shadow-[0_8px_22px_-6px_rgba(0,0,0,0.35)] ring-1 ring-border/60 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.42)]"><ScrollText size={18} className="shrink-0 text-primary" /><span className="whitespace-nowrap text-xs font-semibold">协议</span></button>
      </div>
      <AgreementDialog open={agree} onOpenChange={setAgree} />
    </div>
  );
}
