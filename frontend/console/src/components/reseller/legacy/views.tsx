"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownLeft, ArrowDownToLine, ArrowUpRight, BadgeCheck, BadgeDollarSign, CalendarCheck, CalendarClock, ChevronRight, ChevronsDown, ChevronsUp, CircleDollarSign, Clock, Coins, CreditCard, FileText, Gift, Globe, Hourglass, Inbox, Layers, List, Mail, MailOpen, MousePointerClick, Network, Percent, Plus, Receipt, Scale, ScrollText, Search, ShieldAlert, ShieldCheck, Ticket, TicketCheck, TicketX, Trash2, TrendingUp, UserCheck, UserCog, UserPlus, Users, Wallet, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useResellerAll, useSaveSection } from "@/lib/reseller/client";
import { DEFAULT_DATA, type ActivitiesConfig, type AuditEntry } from "@/lib/reseller/types";
import { useApp } from "@/store/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { VaultPanel, dateCn, dateSlash, dateTimeFull } from "@/components/reseller/common";
import { STATUS_TONE, WithdrawDialog, WithdrawRow, useFinance, ACCOUNT_TYPES } from "@/components/reseller/finance/finance";
import { CardKeysTab } from "@/components/reseller/finance/card-keys";
import { useHost } from "@/components/reseller/site/ui";
import type { CustomerRow } from "@/components/reseller/customers/customers";
import { Card, CurrentPanel, DayBars, EmptyPanel, EmptyTable, ErrorBanner, Kpi, LegacyHead, MiniSwitch, PillTabs, RangeTabs, RowsCard, SaveRow, SearchInput, SetRow, cardCls, fieldCls, rangeOf, type Range } from "./frame";

const zapS = (v: number) => `⚡${v ? (Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3)) : "0"}`;
const Count = ({ n, className }: { n: number; className?: string }) => <span className={cn("whitespace-nowrap text-xs text-muted-foreground", className)}>{n} 条</span>;

/* ---------------- 财务管理 ---------------- */

/** 顶部「提现」按钮（打开提现弹窗） */
export function WithdrawButton() {
  const f = useFinance(); const [open, setOpen] = useState(false);
  return <><Button className="gap-2" onClick={() => setOpen(true)}><WalletCards size={16} />提现</Button><WithdrawDialog open={open} onOpenChange={setOpen} data={f.data} /></>;
}

/** 收益记录 */
export function IncomeView() {
  const f = useFinance(); const [range, setRange] = useState<Range>("全部"); const [kw, setKw] = useState("");
  const [from, to] = rangeOf(range);
  const inRange = useMemo(() => (f.data?.income ?? []).filter((r) => r.at >= from && r.at < to), [f.data, from, to]);
  const rows = useMemo(() => { const k = kw.trim().toLowerCase().replace(/^#/, ""); return inRange.filter((r) => !k || String(r.userId) === k || r.username.toLowerCase().includes(k)); }, [inRange, kw]);
  const sum = (g: (r: (typeof inRange)[number]) => number) => inRange.reduce((s, r) => s + g(r), 0);
  if (f.isLoading) return <div className="h-72 rounded-2xl shimmer" />;
  return (
    <>
      <ErrorBanner error={f.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="本段分润" value={zapS(sum((r) => r.income))} icon={<BadgeDollarSign />} accent />
        <Kpi label="本段笔数" value={inRange.length} sub="笔" icon={<Receipt />} />
        <Kpi label="本段客户充值" value={zapS(sum((r) => r.consume))} icon={<CircleDollarSign />} />
        <Kpi label="可提现余额" value={zapS(f.data?.available ?? 0)} sub="实时" icon={<Wallet />} />
      </div>
      <section className={cn(cardCls, "p-5")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">分润趋势 · {range}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{([["直接分润", sum((r) => (r.direct ? r.income : 0))], ["间接分润", sum((r) => (r.direct ? 0 : r.income))], ["加盟佣金", 0]] as const).map(([k, v]) => <span key={k} className="flex items-baseline gap-1.5 text-xs"><span className="text-muted-foreground">{k}</span><span className="font-semibold tabular-nums text-foreground">{zapS(v)}</span></span>)}</div>
        </div>
        <DayBars points={inRange.map((r) => ({ at: r.at, v: r.income }))} label={zapS} />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">收益明细</h2>
        <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--success)_28%,var(--border))] bg-success/[0.08] px-3 py-2.5">
          <BadgeDollarSign size={16} className="mt-0.5 shrink-0 text-success" />
          <div className="min-w-0"><p className="text-xs font-medium text-foreground">充值成功，收益自动入账</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">客户或下级代理每次充值成功，你的本笔收益都会自动结算并一次计入余额。“本笔收益率”= 本笔收益 ÷ 充值金额；点开记录可查看收益来源和计算明细。</p></div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><RangeTabs value={range} onChange={setRange} /><div className="flex items-center gap-2"><SearchInput value={kw} onChange={setKw} placeholder="搜索 ID / 邮箱 / 昵称" /><Count n={rows.length} /></div></div>
        {rows.length === 0 ? <EmptyPanel title="暂无收益记录" desc="客户或下级代理充值成功后，收益会自动结算并显示在这里。" /> : (
          <div className={cn(cardCls, "overflow-x-auto")}><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b border-border text-left">{["时间", "客户", "来源", "金额", "本笔收益", "本笔收益率"].map((h, i) => <th key={h} className={cn("px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground", i > 2 && "text-right")}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-border/60 last:border-b-0"><td className="px-5 py-3 text-muted-foreground">{dateTimeFull(r.at)}</td><td className="px-5 py-3">#{r.userId} · {r.username}</td><td className="px-5 py-3">{r.direct ? "直接" : "间接"}</td><td className="px-5 py-3 text-right tabular-nums">{zapS(r.consume)}</td><td className="px-5 py-3 text-right font-medium tabular-nums text-success">+{zapS(r.income)}</td><td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{r.consume ? `${((r.income / r.consume) * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </>
  );
}

const WD_TABS = [["全部", () => true], ["审核中", (s: string) => s === "待审核"], ["待打款", (s: string) => s === "处理中"], ["已到账", (s: string) => s === "已打款"], ["已驳回", (s: string) => s === "已驳回"]] as const;
/** 提现记录 */
export function WithdrawalsView() {
  const f = useFinance(); const [tab, setTab] = useState(0); const [kw, setKw] = useState("");
  const all = f.data?.withdrawals ?? []; const accounts = f.data?.accounts ?? [];
  const rows = all.filter((w) => WD_TABS[tab][1](w.status)).filter((w) => { if (!kw) return true; const a = accounts.find((x) => x.id === w.accountId); return w.status.includes(kw) || (a && ((ACCOUNT_TYPES[a.type] ?? a.type) + a.note).includes(kw)); });
  const sum = (p: (s: string) => boolean) => all.filter((w) => p(w.status)).reduce((s, w) => s + w.amount, 0);
  if (f.isLoading) return <div className="h-72 rounded-2xl shimmer" />;
  return (
    <>
      <ErrorBanner error={f.error} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-success/25 bg-success/[0.07] px-4 py-3 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-success"><Clock size={14} />预计 24 小时内到账</span>
        <span className="flex items-center gap-1.5 text-foreground"><BadgeCheck size={14} className="text-success" />0 手续费</span>
        <span className="text-muted-foreground">≤ ⚡36,000 自动打款 · 超额需人工审核</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Kpi label="可提现余额" value={zapS(f.data?.available ?? 0)} icon={<Wallet />} accent /><Kpi label="已提现" value={zapS(sum((s) => s === "已打款"))} icon={<CreditCard />} /><Kpi label="审核中" value={zapS(sum((s) => s === "待审核" || s === "处理中"))} icon={<Hourglass />} /></div>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PillTabs tabs={WD_TABS.map(([l], i) => ({ value: i, label: l }))} value={tab} onChange={setTab} />
          <div className="flex items-center gap-2"><SearchInput value={kw} onChange={setKw} placeholder="搜索收款账号 / 状态" /><Count n={rows.length} /></div>
        </div>
        {rows.length === 0 ? <EmptyPanel title="暂无提现记录" desc="可提余额大于 0 时，即可发起首次提现。" /> : <ul className="space-y-2">{rows.map((w) => <WithdrawRow key={w.id} w={w} accounts={accounts} />)}</ul>}
      </section>
    </>
  );
}

/** 资金流水：分润进账 + 提现出账 */
export function CashflowView() {
  const f = useFinance(); const [range, setRange] = useState<Range>("全部"); const [from, to] = rangeOf(range);
  const flows = useMemo(() => {
    const d = f.data; if (!d) return [];
    const inc = d.income.filter((r) => r.income > 0).map((r) => ({ id: `i${r.id}`, at: r.at, kind: "in" as const, title: `分润进账 · #${r.userId} ${r.username}`, amount: r.income }));
    const out = d.withdrawals.filter((w) => w.status !== "已驳回").map((w) => ({ id: `w${w.id}`, at: w.createdAt, kind: "out" as const, title: `提现出账 · ${w.status}`, amount: w.amount }));
    return [...inc, ...out].filter((x) => x.at >= from && x.at < to).sort((a, b) => b.at - a.at);
  }, [f.data, from, to]);
  const inSum = flows.filter((x) => x.kind === "in").reduce((s, x) => s + x.amount, 0); const outSum = flows.filter((x) => x.kind === "out").reduce((s, x) => s + x.amount, 0);
  if (f.isLoading) return <div className="h-72 rounded-2xl shimmer" />;
  return (
    <>
      <ErrorBanner error={f.error} />
      <RangeTabs value={range} onChange={setRange} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="分润进账" value={zapS(inSum)} icon={<ArrowDownLeft />} /><Kpi label="提现出账" value={zapS(outSum)} icon={<ArrowUpRight />} /><Kpi label="资金净额" value={zapS(inSum - outSum)} icon={<Scale />} accent dim={inSum - outSum === 0} /><Kpi label="可提现余额" value={zapS(f.data?.available ?? 0)} icon={<Wallet />} /></div>
      <section className={cn(cardCls, "p-5")}><h2 className="mb-4 text-sm font-semibold text-foreground">分润进账 · {range}</h2><DayBars points={flows.filter((x) => x.kind === "in").map((x) => ({ at: x.at, v: x.amount }))} label={zapS} /></section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">资金流水明细</h2>
        {flows.length === 0 ? <EmptyPanel title="暂无资金流水" desc="有分润进账或提现出账后，会在这里按时间汇总。" /> : <ul className="space-y-2">{flows.slice(0, 200).map((x) => <li key={x.id} className={cn(cardCls, "flex items-center gap-3 px-4 py-3 text-sm")}><span className="min-w-0 flex-1 truncate">{x.title}</span><span className="text-xs text-muted-foreground">{dateTimeFull(x.at)}</span><span className={cn("w-28 text-right font-medium tabular-nums", x.kind === "in" ? "text-success" : "text-danger")}>{x.kind === "in" ? "+" : "-"}{zapS(x.amount)}</span></li>)}</ul>}
      </section>
    </>
  );
}

/** 发票记录 */
export function InvoicesView() {
  const f = useFinance(); const [kw, setKw] = useState("");
  const rows = (f.data?.invoices ?? []).filter((i) => !kw || i.status.includes(kw) || String(i.amount).includes(kw));
  if (f.isLoading) return <div className="h-72 rounded-2xl shimmer" />;
  return (
    <div className="flex flex-col gap-4">
      <ErrorBanner error={f.error} />
      <div className="flex items-center gap-2"><SearchInput value={kw} onChange={setKw} placeholder="搜索发票" className="max-w-sm flex-1" /><span className="text-[11px] text-muted-foreground">{rows.length} 条</span></div>
      <VaultPanel title="发票历史" icon={<FileText />}>
        {rows.length === 0 ? <EmptyPanel title="暂无发票" desc="通过顶栏 [提现] 按钮可同时提交开票申请, 或前往个人中心计费控制台查看历史发票。" /> : <ul className="space-y-2">{rows.map((i) => <li key={i.id} className="flex items-center gap-3 rounded-xl border border-border/50 px-4 py-3 text-sm"><FileText size={16} className="text-primary" /><span className="flex-1 text-muted-foreground">{dateTimeFull(i.createdAt)}</span><span className="rounded-md bg-muted px-2 py-0.5 text-xs">{i.status}</span><span className="tabular-nums">{zapS(i.amount)}</span></li>)}</ul>}
      </VaultPanel>
    </div>
  );
}

/* ---------------- 客户管理 ---------------- */
interface CustomersData { items: CustomerRow[]; stats: { total: number; active: number; new30: number; consume: number } }
export const useCustomers = () => useQuery({ queryKey: ["reseller", "customers-list"], queryFn: () => api<CustomersData>("/api/reseller/customers"), staleTime: 15_000 });

/** 漏斗条（宽度按首级比例） */
export function Funnel({ steps }: { steps: { label: string; value: number; rate?: string }[] }) {
  const max = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ol className="grid gap-1">
      {steps.map((s) => (
        <li key={s.label} className="grid gap-1">
          {s.rate && <div className="flex justify-center"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{s.rate}</span></div>}
          <div className="flex items-center gap-3"><div className="flex h-11 items-center justify-between rounded-lg bg-[color-mix(in_srgb,var(--primary)_38%,var(--card))] px-3 text-sm transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.max(28, (s.value / max) * 100)}%` }}><span className="truncate font-medium text-foreground">{s.label}</span><span className="ml-2 shrink-0 font-semibold tabular-nums text-foreground">{s.value}</span></div></div>
        </li>
      ))}
    </ol>
  );
}

/** 转化分析：邀请点击 → 注册 → 付费 */
export function ConversionView() {
  const q = useCustomers(); const all = useResellerAll();
  const items = q.data?.items ?? []; const clicks = all.data?.recruit.clicks ?? 0;
  const reg = items.length; const paid = items.filter((i) => i.topup > 0).length; const active = items.filter((i) => i.active && i.consume > 0).length;
  const rate = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(1) : "0.0"}%`;
  if (q.isLoading) return <div className="h-72 rounded-2xl shimmer" />;
  return (
    <>
      <ErrorBanner error={q.error} onRetry={() => q.refetch()} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="邀请点击" value={clicks} sub={`独立访客 ${clicks}`} icon={<MousePointerClick />} /><Kpi label="注册客户" value={reg} icon={<UserPlus />} />
        <Kpi label="付费客户" value={paid} sub={`付费转化率 ${rate(paid, reg)}`} icon={<Wallet />} accent /><Kpi label="活跃客户" value={active} sub={`活跃率 ${rate(active, reg)}`} icon={<Percent />} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className={cn(cardCls, "p-5")}><h2 className="text-sm font-semibold text-foreground">转化漏斗</h2><div className="mt-5"><Funnel steps={[{ label: "注册", value: reg }, { label: "付费", value: paid, rate: `→ ${rate(paid, reg)}` }]} /></div></div>
        <div className={cn(cardCls, "p-5")}>
          <h2 className="text-sm font-semibold text-foreground">逐级明细</h2>
          <ul className="mt-4 grid gap-1.5">{([["注册", reg, ""], ["付费", paid, `→ ${rate(paid, reg)}`]] as const).map(([l, v, r], i) => <li key={l} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5"><div className="flex min-w-0 items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span><span className="truncate text-sm font-medium text-foreground">{l}</span></div><div className="flex items-center gap-4">{r && <span className="text-xs tabular-nums text-primary">{r}</span>}<span className="min-w-[3.5rem] text-right text-sm font-semibold tabular-nums text-foreground">{v}</span></div></li>)}</ul>
        </div>
      </section>
    </>
  );
}

/** 客户分层：按累计消费分 VIP / Pro / 入门 */
const TIERS = [{ name: "VIP", min: 1000, pill: "border-primary/40 bg-primary/[0.14] text-primary" }, { name: "Pro", min: 100, pill: "border-success/40 bg-success/[0.14] text-success" }, { name: "入门", min: 0, pill: "border-border bg-muted text-muted-foreground" }];
export function TiersView() {
  const q = useCustomers(); const [open, setOpen] = useState<string | null>(null);
  const items = q.data?.items ?? []; const total = items.reduce((s, i) => s + i.consume, 0);
  const groups = TIERS.map((t, i) => { const hi = i === 0 ? Infinity : TIERS[i - 1].min; const list = items.filter((c) => c.consume >= t.min && c.consume < hi); const sum = list.reduce((s, c) => s + c.consume, 0); return { ...t, list, sum }; });
  const maxN = Math.max(1, ...groups.map((g) => g.list.length));
  if (q.isLoading) return <div className="h-72 rounded-2xl shimmer" />;
  const cur = groups.find((g) => g.name === open);
  return (
    <>
      <ErrorBanner error={q.error} onRetry={() => q.refetch()} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Kpi label="客户总数" value={items.length} icon={<Users />} /><Kpi label="分层档位" value={TIERS.length} icon={<Layers />} /><Kpi label="总消费" value={zapS(total)} icon={<Coins />} accent /></section>
      <section className={cn(cardCls, "p-5")}>
        <h2 className="text-sm font-semibold text-foreground">分档客户数</h2>
        <div className="mt-5 grid gap-2">
          <div role="img" aria-label="分档客户数" className="grid h-40 grid-cols-3 items-end gap-2">{groups.map((g) => <button key={g.name} type="button" aria-label={`${g.name}: ${g.list.length} 位客户`} title={`${g.name}: ${g.list.length} 位客户`} onClick={() => setOpen(g.name)} className="group relative flex h-full flex-col items-center justify-end outline-none"><span className="w-full rounded-t-lg bg-[color-mix(in_srgb,var(--primary)_38%,var(--border))] transition-[height,background-color] duration-200 group-hover:bg-primary" style={{ height: `${Math.max(3, (g.list.length / maxN) * 100)}%` }} /></button>)}</div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">{groups.map((g) => <span key={g.name} className="truncate">{g.name}</span>)}</div>
        </div>
      </section>
      <section className={cn(cardCls, "overflow-hidden")}>
        <div className="border-b border-border px-5 py-3"><h2 className="text-sm font-semibold text-foreground">分档明细</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-sm"><thead><tr className="border-b border-border text-left">{["档位", "客户数", "占比", "总消费", "人均消费"].map((h, i) => <th key={h} className={cn("px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground", i > 0 && "text-right")}>{h}</th>)}</tr></thead>
          <tbody>{groups.map((g) => <tr key={g.name} className="border-b border-border/60 last:border-b-0"><td className="px-5 py-3"><span className={cn("inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none", g.pill)}>{g.name}</span></td><td className="px-5 py-3 text-right font-medium tabular-nums text-foreground">{g.list.length}</td><td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{items.length ? ((g.list.length / items.length) * 100).toFixed(1) : "0.0"} %</td><td className="px-5 py-3 text-right font-medium tabular-nums text-foreground">{zapS(g.sum)}</td><td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{zapS(g.list.length ? g.sum / g.list.length : 0)}</td></tr>)}</tbody></table></div>
      </section>
      <Dialog open={!!cur} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent title={`${cur?.name ?? ""} 客户`} description={`${cur?.list.length ?? 0} 位客户`}>
          {cur && (cur.list.length === 0 ? <EmptyPanel title="该档暂无客户" /> : <ul className="max-h-[60vh] space-y-2 overflow-y-auto">{cur.list.map((c) => <li key={c.id} className="flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm"><span className="text-muted-foreground">#{c.id}</span><span className="truncate">{c.username}</span><span className="ml-auto tabular-nums">{zapS(c.consume)}</span></li>)}</ul>)}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- 渠道管理 ---------------- */

/** 下级代理（旧版菜单）：列表 / 层级树；本站为单级代理，树上只有自己 */
export function ChannelTeamView() {
  const [view, setView] = useState<"list" | "tree">("list"); const [kw, setKw] = useState(""); const [expanded, setExpanded] = useState(true);
  const user = useApp((s) => s.user); const host = useHost(); const q = useCustomers(); const f = useFinance();
  // 下级代理真数据：造物这套页面原本 KPI 写死 0、列表恒空；这里接 /api/reseller/agents（同一份 mc_agents）
  const agentsQ = useQuery({ queryKey: ["reseller", "agents"], queryFn: () => api<{ agents: Array<{ id: number; username: string; email: string; status: string; domain: string | null; markupPct: number; customers: number; createdAt: number }> }>("/api/reseller/agents"), retry: false });
  const agents = agentsQ.data?.agents ?? [];
  const active = agents.filter((a) => a.status === "approved").length;
  const agentCustomers = agents.reduce((sum, a) => sum + (Number(a.customers) || 0), 0);
  const kwAgents = agents.filter((a) => { const k = kw.trim().toLowerCase(); if (!k) return true; return `${a.id}`.includes(k.replace(/^#/, "")) || a.username?.toLowerCase().includes(k) || a.email?.toLowerCase().includes(k) || (a.domain ?? "").toLowerCase().includes(k); });
  const me = user ? { id: user.id, name: user.username, email: (user as { email?: string }).email ?? "" } : null;
  const k = kw.trim().toLowerCase().replace(/^#/, "");
  const showMe = !!me && (!k || String(me.id) === k || me.name.toLowerCase().includes(k) || me.email.toLowerCase().includes(k) || host.includes(k));
  const tabCls = (on: boolean) => cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", on ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");
  return (
    <div className="w-full space-y-5">
      <LegacyHead variant="md" icon={<Network />} title="下级代理" subtitle="管理你的直属下级代理及其业务" right={
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button type="button" role="tab" aria-selected={view === "list"} onClick={() => setView("list")} className={tabCls(view === "list")}><List size={14} />列表</button>
          <button type="button" role="tab" aria-selected={view === "tree"} onClick={() => setView("tree")} className={tabCls(view === "tree")}><Network size={14} />层级树</button>
        </div>
      } />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="下级代理" value={agents.length} icon={<Network />} />
        <Kpi label="活跃" value={active} icon={<UserCheck />} />
        <Kpi label="其客户合计" value={agentCustomers} icon={<Users />} />
        <Kpi label="激活率" value={agents.length ? `${((active / agents.length) * 100).toFixed(1)}%` : "—"} sub={`${active}/${agents.length} 活跃`} />
      </section>
      {view === "list" ? (
        <>
          <section className={cn(cardCls, "flex flex-wrap items-center gap-2 px-4 py-3")}><Search size={16} className="text-muted-foreground" /><input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索代理 ID / 域名 / 名字 / 邮箱 / 手机号" aria-label="搜索代理" className={cn(fieldCls, "w-auto flex-1")} /></section>
          <section className={cn(cardCls, "overflow-hidden")}>
            {agentsQ.isError ? <ErrorBanner error={agentsQ.error} suffix="代理列表加载失败" onRetry={() => agentsQ.refetch()} /> : null}
            {kwAgents.length ? (
              <table className="w-full border-collapse text-sm">
                <thead><tr className="bg-muted/45">
                  {["#", "代理", "状态", "专属域名", "加价", "客户数", "加入时间"].map((h) => <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>)}
                </tr></thead>
                <tbody>
                  {kwAgents.map((a) => (
                    <tr key={a.id} className="border-t border-border/40 hover:bg-muted/35">
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">{a.id}</td>
                      <td className="px-4 py-2.5"><div className="font-medium text-foreground">{a.username}</div><div className="text-xs text-muted-foreground">{a.email || "—"}</div></td>
                      <td className="px-4 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", a.status === "approved" ? "bg-success/10 text-success" : a.status === "pending" ? "bg-warning/15 text-warning" : a.status === "frozen" ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground")}>{a.status === "approved" ? "已批准" : a.status === "pending" ? "待审核" : a.status === "frozen" ? "已冻结" : "已驳回"}</span></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{a.domain || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{a.markupPct ?? 0}%</td>
                      <td className="px-4 py-2.5 tabular-nums">{a.customers ?? 0}</td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{a.createdAt ? dateSlash(a.createdAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyTable icon={<Network />} title={agents.length ? "没有匹配的代理" : "暂无下级代理"} desc={agents.length ? "换个关键词再试。" : "在「下级代理」里批准代理申请后，这里会显示他们的业务数据。"} />
            )}
          </section>
        </>
      ) : (
        <section className={cn(cardCls, "p-4")}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[200px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索名字 / 手机号 / 邮箱 / ID / 域名" className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" /></label>
              <button type="button" onClick={() => setExpanded(true)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronsDown size={14} />展开全部</button>
              <button type="button" onClick={() => setExpanded(false)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronsUp size={14} />收起全部</button>
              <span className="text-xs tabular-nums text-muted-foreground">共 {showMe ? 1 : 0} 位</span>
            </div>
            <div role="tree" className="flex flex-col gap-1.5">
              {showMe && me ? (
                <div role="treeitem" aria-expanded={expanded} aria-selected className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/[0.1] px-3 py-2.5">
                  <span className="size-6 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">{(me.name || "?").slice(0, 1).toUpperCase()}</span>
                      <div className="min-w-0 leading-tight"><div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground"><span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">#{me.id}</span><span className="shrink-0 text-muted-foreground/50">·</span><span className="truncate">{me.name}</span></div>{me.email && <div className="mt-0.5 truncate text-xs text-muted-foreground">{me.email}</div>}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-xs text-muted-foreground"><span className="rounded border border-primary/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary">我</span>{host && <span className="inline-flex min-w-0 items-center gap-1"><Globe size={12} /><span className="truncate font-mono">{host}</span></span>}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/35 bg-success/[0.14] px-2 py-0.5 text-[11px] font-medium leading-none text-success"><span className="size-1.5 rounded-full bg-current" />活跃</span>
                    <div className="flex items-center gap-3 text-xs"><span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground"><Users size={12} />{q.data?.stats.total ?? 0}</span><span className="font-semibold tabular-nums text-foreground">{zapS(f.data?.allIncome ?? 0)}</span></div>
                  </div>
                </div>
              ) : <EmptyTable icon={<Network />} title="没有匹配的代理" />}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

interface CardKeyLite { id: number; status: number }
export function CardKeysView() {
  const f = useFinance(); const list = useQuery({ queryKey: ["reseller", "card-keys"], queryFn: () => api<CardKeyLite[]>("/api/reseller/redemption") });
  const rows = list.data ?? []; const wallet = f.data?.wallet ?? 0;
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="卡密总数" value={rows.length} icon={<Ticket />} /><Kpi label="未使用" value={rows.filter((r) => r.status === 1).length} icon={<TicketCheck />} accent /><Kpi label="已使用" value={rows.filter((r) => r.status === 3).length} icon={<TicketX />} /><Kpi label="钱包余额" value={zapS(wallet)} icon={<Wallet />} /></section>
      <CardKeysTab wallet={wallet} variant="legacy" />
    </>
  );
}

/* ---------------- 站内运营 ---------------- */

/** 我的留言（旧版菜单）：KPI + 空态 */
export function SiteMessagesView() {
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2"><Kpi label="全部" value={0} icon={<Inbox />} /><Kpi label="未读" value={0} icon={<MailOpen />} /></section>
      <section className={cn(cardCls, "p-4 sm:p-5")}><EmptyPanel icon={<Mail />} title="暂无留言" desc="平台管理员给你的留言会出现在这里。" /></section>
    </>
  );
}

/** 左右等宽二选一按钮 */
function Seg({ value, onChange, labels, disabled }: { value: boolean; onChange: (v: boolean) => void; labels: [string, string]; disabled?: boolean }) {
  const b = (on: boolean) => cn("rounded-md border px-3 py-2 text-xs font-semibold transition-all duration-150 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50", on ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 bg-card text-foreground");
  return <div className="grid grid-cols-2 gap-2"><button type="button" disabled={disabled} aria-pressed={value} onClick={() => onChange(true)} className={b(value)}>{labels[0]}</button><button type="button" disabled={disabled} aria-pressed={!value} onClick={() => onChange(false)} className={b(!value)}>{labels[1]}</button></div>;
}
function CheckRow({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 border-b border-border/30 py-3 last:border-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center sm:gap-4"><div className="min-w-0"><div className="text-sm font-medium text-foreground">{title}</div>{desc && <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{desc}</div>}</div><div className="min-w-0 sm:w-full">{children}</div></div>;
}

/** 活动管理：充值福利 / 签到管理 */
export function ActivitiesView() {
  const all = useResellerAll(); const f = useFinance(); const save = useSaveSection();
  const [tab, setTab] = useState<"bonus" | "checkin">("bonus"); const [a, setA] = useState<ActivitiesConfig>(DEFAULT_DATA.activities); const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 用服务端配置初始化表单
  useEffect(() => { if (all.data) setA({ ...DEFAULT_DATA.activities, ...all.data.activities }); }, [all.data]);
  const sharePct = Math.round((f.data?.share ?? 0) * 100);
  const persist = async (next: ActivitiesConfig, action: string, ok: string) => { setBusy(true); try { await save("activities", next, action); toast.success(ok); } catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setBusy(false); } };
  const saveBonus = () => {
    const t = a.topupBonus.tiers;
    if (a.topupBonus.enabled && t.length === 0) { toast.error("开启活动前请至少添加 1 档"); return; }
    if (t.some((x) => !(x.threshold > 0) || !(x.bonus >= 0))) { toast.error("请填写有效的阈值与赠送额"); return; }
    if (t.some((x, i) => i > 0 && x.threshold <= t[i - 1].threshold)) { toast.error("阈值需从上到下严格递增"); return; }
    if (t.some((x) => x.bonus > x.threshold * (f.data?.share ?? 0))) { toast.error("每一档赠送不能超过该档可得佣金"); return; }
    persist(a, "reseller.activities.topup_bonus.update", "充值福利已保存");
  };
  const today = new Date().toISOString().slice(0, 10); const savesLeft = 3 - (a.checkin.savedOn === today ? a.checkin.savesToday : 0);
  const saveCheckin = () => {
    const c = a.checkin; const turningOff = !c.enabled;
    if (!turningOff && savesLeft <= 0) { toast.error("今日保存次数已用完"); return; }
    if (c.enabled && !(c.amount >= 0.05 && c.amount <= 0.5)) { toast.error("每日签到金额需在 ⚡0.050 ~ ⚡0.500"); return; }
    if (c.enabled && c.mode === "pool" && c.pool < 50) { toast.error("大资金池模式下，资金池需达到 ⚡50.00 才能开启签到"); return; }
    const next = { ...a, checkin: { ...c, savedOn: today, savesToday: turningOff ? (c.savedOn === today ? c.savesToday : 0) : 3 - savesLeft + 1 } };
    setA(next); persist(next, "reseller.activities.checkin.update", "签到设置已保存");
  };
  if (all.isLoading) return <div className="h-72 rounded-2xl shimmer" />;
  const saved = all.data?.activities ?? DEFAULT_DATA.activities; const tiers = a.topupBonus.tiers;
  const setTiers = (next: typeof tiers) => setA({ ...a, topupBonus: { ...a.topupBonus, tiers: next } });
  return (
    <div className="w-full max-w-3xl space-y-6">
      <nav role="tablist" className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 p-1.5">
        {([["bonus", "充值福利", Gift], ["checkin", "签到管理", CalendarCheck]] as const).map(([v, l, I]) => <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors", tab === v ? "border-primary/45 bg-primary/[0.12] text-primary" : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground")}><I size={14} />{l}</button>)}
      </nav>
      <ErrorBanner error={all.error} suffix="（以下为默认配置）" />
      <div role="tabpanel" className="w-full max-w-3xl space-y-6">
        {tab === "bonus" ? (
          <>
            <LegacyHead variant="md" icon={<Gift />} title="充值福利活动" subtitle="为白标用户设置充值满赠梯度：赠送额从你自己的佣金分润里扣，平台从不垫付，你也不会倒贴。" />
            <CurrentPanel items={[["活动状态", saved.topupBonus.enabled ? "已开启" : "已关闭"], ["档位数量", `${saved.topupBonus.tiers.length} 档`], ["你的分成比例", `${sharePct}%`]]} />
            <div className={cn(cardCls, "p-5")}>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><ShieldCheck size={14} className="text-primary" />规则说明</div>
              <ol className="mt-3 space-y-2.5 text-sm leading-6 text-foreground">
                {["赠送给用户的金额由你（代理）承担，从你的佣金分润里扣除，平台不垫付。", `举例：按你当前 ${sharePct}% 的分成比例，用户充 100 元，你照常获得约 ${(100 * sharePct / (100 + sharePct)).toFixed(2)} 元佣金；这一档你设了赠送 5 元，系统扣除后，你这单实得约 ${Math.max(0, 100 * sharePct / (100 + sharePct) - 5).toFixed(2)} 元。`, "系统限制每一档的赠送不超过你这一档能赚的佣金，所以你只会少赚，不会倒贴钱。"].map((t, i) => <li key={i} className="flex gap-2"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/[0.14] text-[11px] font-semibold text-primary">{i + 1}</span><span>{t}</span></li>)}
              </ol>
            </div>
            <RowsCard>
              <SetRow title="开启充值福利活动" desc="开启后，用户充值达到某一档阈值即自动获得赠送算力。"><MiniSwitch label="开启充值福利活动" checked={a.topupBonus.enabled} onCheckedChange={(v) => setA({ ...a, topupBonus: { ...a.topupBonus, enabled: v } })} /></SetRow>
              <SetRow title="赠送档位" desc="最多 5 档，阈值需从上到下严格递增。">
                <div className="flex flex-col gap-2.5">
                  {tiers.map((t, i) => <div key={i} className="flex flex-wrap items-center gap-2 text-sm">满 ¥<input type="number" min={1} value={t.threshold || ""} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, threshold: Number(e.target.value) } : x)))} className={cn(fieldCls, "w-24")} aria-label="充值阈值" />赠 ⚡<input type="number" min={0} step="0.01" value={t.bonus || ""} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, bonus: Number(e.target.value) } : x)))} className={cn(fieldCls, "w-24")} aria-label="赠送算力" /><button type="button" onClick={() => setTiers(tiers.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-danger" aria-label="删除档位"><Trash2 size={14} /></button></div>)}
                  <button type="button" disabled={tiers.length >= 5} onClick={() => setTiers([...tiers, { threshold: 0, bonus: 0 }])} className="inline-flex items-center gap-1 self-start rounded-lg border border-dashed border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"><Plus size={14} />添加档位</button>
                  {tiers.length === 0 && <p className="text-[11px] text-muted-foreground">暂无档位，开启活动前请至少添加 1 档。</p>}
                </div>
              </SetRow>
            </RowsCard>
            <SaveRow><Button disabled={busy} onClick={saveBonus}>保存</Button></SaveRow>
          </>
        ) : (
          <>
            <LegacyHead variant="md" icon={<CalendarCheck />} title="本站每日签到" subtitle="开启后, 你的客户每日首次登录可领取签到奖励, 费用从你的余额扣除" />
            <section>
              <div>
                <CheckRow title="开启本站签到" desc="签到关闭时其余配置不生效, 已锁定; 打开开关后即可设置金额与出资模式"><div className="grid gap-1.5"><Seg value={a.checkin.enabled} onChange={(v) => setA({ ...a, checkin: { ...a.checkin, enabled: v } })} labels={["On", "Off"]} /><span className="text-xs leading-5 text-muted-foreground">大资金池模式下，资金池需达到 ⚡50.00 才能开启签到（小资金池无需提前备钱，签到时才从余额扣）</span></div></CheckRow>
                <CheckRow title="每日签到金额（⚡）" desc="每位用户每天领取的金额; 平台允许 ⚡0.050 ~ ⚡0.500"><div className="grid gap-1.5"><input type="number" min={0.05} max={0.5} step="0.01" disabled={!a.checkin.enabled} value={a.checkin.amount || ""} placeholder="0" onChange={(e) => setA({ ...a, checkin: { ...a.checkin, amount: Number(e.target.value) } })} aria-label="每日签到金额（⚡）" className={cn(fieldCls, "disabled:opacity-50")} /></div></CheckRow>
                <CheckRow title="出资模式" desc={a.checkin.mode === "pool" ? "先一次性注满一笔预算, 签到只从池子里扣; 池子花完即静默停发, 需要你再来注资" : "无需提前备钱, 用户签到时才从你的余额扣"}><div className="grid gap-2"><Seg disabled={!a.checkin.enabled} value={a.checkin.mode === "pool"} onChange={(v) => setA({ ...a, checkin: { ...a.checkin, mode: v ? "pool" : "direct" } })} labels={["大资金池", "小资金池"]} /></div></CheckRow>
                <CheckRow title="当前资金池" desc="池子里当前真实剩余; 签到从这里扣, 扣完自动停发"><div className="grid gap-0.5"><span className="text-sm font-semibold tabular-nums text-foreground">{zapS(a.checkin.pool)}</span></div></CheckRow>
                <CheckRow title="当前可用余额"><span className="text-sm font-semibold tabular-nums text-foreground">{zapS(f.data?.wallet ?? 0)}</span></CheckRow>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={saveCheckin} className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-strong disabled:opacity-60">保存</button><span className="text-xs leading-5 text-muted-foreground">今日还可保存 {Math.max(0, savesLeft)} 次 (每日上限 3 次, 防止频繁开关); 关闭不受限</span></div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- 账号管理 · 操作日志 ---------------- */
const SENSITIVE = /withdraw|payout|finance|impersonate|password|domain/i;
export function AuditLogView() {
  const q = useQuery({ queryKey: ["reseller", "audit"], queryFn: () => api<AuditEntry[]>("/api/reseller/audit") });
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const d0 = new Date(new Date().toDateString()).getTime();
  const fmt = (t: number) => { const x = new Date(t); const p = (n: number) => String(n).padStart(2, "0"); return `${x.getFullYear()}/${p(x.getMonth() + 1)}/${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`; };
  if (q.isLoading) return <div className="h-72 rounded-2xl shimmer" />;
  return (
    <>
      <ErrorBanner error={q.error} onRetry={() => q.refetch()} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="总操作数" value={rows.length} icon={<Activity />} /><Kpi label="今日" value={rows.filter((r) => r.at >= d0).length} icon={<CalendarClock />} /><Kpi label="敏感操作" value={rows.filter((r) => SENSITIVE.test(r.action)).length} icon={<ShieldAlert />} /><Kpi label="超管操作" value={rows.filter((r) => r.actorRole !== "reseller").length} icon={<UserCog />} /></section>
      {rows.length === 0 ? <section className={cn(cardCls, "p-4 sm:p-5")}><EmptyPanel icon={<ScrollText />} title="暂无操作日志" /></section> : (
        <section className={cn(cardCls, "p-2.5")}>
          <ul className="divide-y divide-border/50">{rows.map((r) => <li key={r.id}><button type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
            <span className={cn("inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium", SENSITIVE.test(r.action) ? STATUS_TONE["待审核"] : "bg-muted text-foreground")}>{r.action}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm text-foreground">{r.targetType}<span className="ml-1 font-mono text-xs text-muted-foreground">{r.targetId}</span></div><div className="mt-0.5 truncate text-xs text-muted-foreground">{r.actorRole} · {r.actorEmail}</div></div>
            <time className="hidden shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground sm:block">{fmt(r.at)}</time><ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </button></li>)}</ul>
        </section>
      )}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent title={open?.action ?? ""} description={open ? fmt(open.at) : ""}>
          {open && (
            <div className="space-y-4 text-sm">
              <div><div className="text-xs font-medium text-primary">操作者</div><dl className="mt-2 grid grid-cols-[96px_1fr] gap-y-1.5"><dt className="text-muted-foreground">操作者角色</dt><dd>{open.actorRole}</dd><dt className="text-muted-foreground">操作者邮箱</dt><dd className="break-all">{open.actorEmail}</dd></dl></div>
              <div><div className="text-xs font-medium text-primary">操作详情</div><dl className="mt-2 grid grid-cols-[96px_1fr] gap-y-1.5"><dt className="text-muted-foreground">操作</dt><dd className="font-mono">{open.action}</dd><dt className="text-muted-foreground">目标类型</dt><dd>{open.targetType}</dd><dt className="text-muted-foreground">目标 ID</dt><dd className="break-all font-mono">{open.targetId}</dd><dt className="text-muted-foreground">时间</dt><dd>{fmt(open.at)}</dd></dl></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 邀请记录行（招募明细） */
export function InviteRecords({ items, incomeOf }: { items: CustomerRow[]; incomeOf: (id: number) => number }) {
  if (items.length === 0) return <EmptyPanel title="暂无邀请记录" desc="通过专属邀请链接注册的用户会显示在这里" />;
  return (
    <>
      <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7rem_9rem] gap-3 px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground md:grid"><span>用户</span><span>层级</span><span className="text-right">贡献佣金</span><span className="text-right">注册时间</span></div>
      <ul className="grid gap-1.5">{items.map((c) => { const label = c.email || c.username; return (
        <li key={c.id}><Link href="/reseller/customers/list" className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:border-border hover:bg-muted/50 focus-visible:border-border md:grid-cols-[minmax(0,1fr)_5rem_7rem_9rem]">
          <span className="flex min-w-0 items-center gap-2.5"><span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{label.slice(0, 1).toUpperCase()}</span><span className="truncate text-sm font-medium text-foreground">{label}</span></span>
          <span className="hidden md:block"><span className="inline-flex rounded-full bg-primary/[0.14] px-2 py-0.5 text-[11px] font-medium text-primary">直属</span></span>
          <span className="hidden text-right text-sm font-semibold tabular-nums text-foreground md:block">{zapS(incomeOf(c.id))}</span>
          <span className="hidden text-right text-xs tabular-nums text-muted-foreground md:block">{dateCn(c.joinedAt)}</span>
          <span className="flex flex-col items-end md:hidden"><span className="text-sm font-semibold tabular-nums text-foreground">{zapS(incomeOf(c.id))}</span><span className="text-[11px] tabular-nums text-muted-foreground">{dateCn(c.joinedAt)}</span></span>
        </Link></li>
      ); })}</ul>
    </>
  );
}

export { ArrowDownToLine, ArrowUpRight, Card };
