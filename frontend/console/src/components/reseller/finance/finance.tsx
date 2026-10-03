"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpRight, Building2, Calendar, CircleDollarSign, CreditCard, FileText, Receipt, Search, Ticket, TrendingUp, Wallet, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useSaveSection } from "@/lib/reseller/client";
import type { FinanceConfig, PayoutAccount, PayoutProfile, Withdrawal } from "@/lib/reseller/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyBox, VaultPanel, Zap, dateTimeFull, inputCls } from "@/components/reseller/common";
import { AccountsTab, ProfileTab } from "./payout";
import { CardKeysTab } from "./card-keys";

export interface FinanceData {
  share: number; markupPct: number; wallet: number; hasTopups: boolean; available: number; settled: number; pending: number; monthIncome: number; todayIncome: number; allIncome: number; directIncome: number; indirectIncome: number;
  income: { id: number; at: number; userId: number; username: string; model: string; consume: number; income: number; direct: boolean }[];
  topCustomers: { id: number; username: string; income: number }[];
  withdrawals: Withdrawal[]; accounts: PayoutAccount[]; profile: PayoutProfile; invoices: FinanceConfig["invoices"];
}
const TABS = [
  { value: "overview", label: "总览", icon: <TrendingUp size={16} /> }, { value: "income", label: "收益明细", icon: <CircleDollarSign size={16} /> }, { value: "withdrawals", label: "提现", icon: <ArrowDownToLine size={16} /> },
  { value: "payout-accounts", label: "收款账号", icon: <CreditCard size={16} /> }, { value: "invoices", label: "发票", icon: <FileText size={16} /> }, { value: "card-keys", label: "卡密", icon: <Ticket size={16} /> }, { value: "payout-profile", label: "提现资料", icon: <Building2 size={16} /> },
] as const;
type Tab = (typeof TABS)[number]["value"];
export const ACCOUNT_TYPES: Record<string, string> = { alipay: "支付宝", wechat: "微信", bank: "银行卡" };
export const STATUS_TONE: Record<string, string> = { 待审核: "bg-[#fff8e6] text-warning", 处理中: "bg-primary-tint text-primary", 已打款: "bg-success/10 text-success", 已驳回: "bg-danger/10 text-danger" };

export function useFinance() { return useQuery({ queryKey: ["reseller", "finance"], queryFn: () => api<FinanceData>("/api/reseller/finance"), staleTime: 15_000 }); }
/** 以 finance 分区为基础合并写入 */
export function useSaveFinance() {
  const save = useSaveSection(); const qc = useQueryClient(); const f = useFinance();
  return async (patch: Partial<FinanceConfig>, action: string) => {
    const cur = f.data; const base: FinanceConfig = { accounts: cur?.accounts ?? [], profile: cur?.profile ?? { company: "", bank: "", account: "", taxId: "", invoiceFile: "" }, withdrawals: cur?.withdrawals ?? [], invoices: cur?.invoices ?? [] };
    await save("finance", { ...base, ...patch }, action); await qc.invalidateQueries({ queryKey: ["reseller", "finance"] });
  };
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <label className="flex h-10 w-full max-w-xs items-center gap-2 rounded-xl border bg-card px-3"><Search size={15} className="text-muted-foreground" /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm outline-none" /></label>;
}
function ListHead({ count, title, search, onSearch, placeholder }: { count: number; title: string; search: string; onSearch: (v: string) => void; placeholder: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs text-muted-foreground">{count} 条</div><div className="text-base font-semibold">{title}</div></div><SearchBox value={search} onChange={onSearch} placeholder={placeholder} /></div>;
}
export function WithdrawRow({ w, accounts }: { w: Withdrawal; accounts: PayoutAccount[] }) {
  const a = accounts.find((x) => x.id === w.accountId);
  return <li className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"><ArrowDownToLine size={16} className="text-primary" /><div className="min-w-0 flex-1"><div className="font-medium">{a ? `${ACCOUNT_TYPES[a.type] ?? a.type}${a.note ? ` · ${a.note}` : ""}` : "收款账号已删除"}</div><div className="text-xs text-muted-foreground">{dateTimeFull(w.createdAt)}</div></div><span className={cn("rounded-md px-2 py-0.5 text-xs", STATUS_TONE[w.status] ?? "bg-muted")}>{w.status}</span><Zap v={w.amount} className="w-24 text-right" /></li>;
}

/** 提现弹窗（参考站「提现」：个人 / 公司提现、单笔上下限、发票抵扣提示） */
export const WD_MIN = 10, WD_MAX = 360000, WD_REVIEW = 144000;
export function WithdrawDialog({ open, onOpenChange, data }: { open: boolean; onOpenChange: (v: boolean) => void; data?: FinanceData }) {
  const qc = useQueryClient(); const [amount, setAmount] = useState(""); const [acc, setAcc] = useState(""); const [busy, setBusy] = useState(false); const [kind, setKind] = useState<"personal" | "company">("personal"); const router = useRouter();
  const accounts = data?.accounts ?? []; const available = data?.available ?? 0;
  const invoiced = (data?.invoices ?? []).filter((i) => i.status === "已确认").reduce((s, i) => s + i.amount, 0);
  const accountId = acc || accounts[0]?.id || "";
  const submit = async () => {
    const v = Number(amount);
    if (!(v > 0)) { toast.error("请输入提现金额"); return; }
    if (v < WD_MIN) { toast.error(`单笔提现最低 ⚡${WD_MIN}`); return; }
    if (v > WD_MAX) { toast.error(`单笔提现最高 ⚡${WD_MAX.toFixed(2)}`); return; }
    if (v > available + 1e-9) { toast.error("提现金额超过可提余额"); return; }
    if (!accountId) { toast.error("请先添加收款账号"); return; }
    if (kind === "company" && !data?.profile.company) { toast.error("公司提现需先完善提现资料"); return; }
    setBusy(true);
    try {
      // 服务端校验可提余额并生成提现单；状态只能由站长审核修改
      await api("/api/reseller/finance", { method: "POST", body: JSON.stringify({ action: "withdraw", amount: Math.round(v * 100) / 100, accountId }) });
      await qc.invalidateQueries({ queryKey: ["reseller", "finance"] }); toast.success("提现申请已提交，站长审核后打款"); setAmount(""); onOpenChange(false);
    } catch (e) { toast.error(`提交失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  const goAccounts = () => { onOpenChange(false); router.push("/reseller/finance?tab=payout-accounts"); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="提现" description={`单笔提现最低 ⚡${WD_MIN}，最高 ⚡${WD_MAX.toFixed(2)}。`}>
        <div className="space-y-4">
          <div className="rounded-2xl border p-4"><div className="text-xs text-muted-foreground">可提现</div><div className="mt-1 font-mono text-3xl font-bold">⚡{fmtAmt(available)}</div><div className="mt-2 flex gap-4 text-xs text-muted-foreground"><span>差票金额 ⚡{fmtAmt(Math.max(0, available - invoiced))}</span><span>已确认发票 ⚡{fmtAmt(invoiced)}</span></div></div>
          {accounts.length === 0 && <div className="rounded-xl bg-[#fff8e6] px-4 py-3 text-sm text-warning">您还没有设置收款方式,提现前请先添加收款账号(支付宝/银行卡)。<button type="button" onClick={goAccounts} className="ml-2 font-medium underline">去设置收款账号</button></div>}
          <div role="tablist" className="grid grid-cols-2 rounded-xl border p-0.5">{([["personal", "个人提现"], ["company", "公司提现"]] as const).map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={kind === v} onClick={() => setKind(v)} className={cn("h-9 rounded-lg text-sm", kind === v ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted")}>{l}</button>)}</div>
          <label className="block"><div className="text-sm font-medium">提现金额</div><div className="relative mt-2"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">⚡</span><input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn(inputCls, "pl-9")} placeholder="0.00" /><button type="button" onClick={() => setAmount(available.toFixed(2))} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary">全部</button></div></label>
          <label className="block"><div className="text-sm font-medium">收款方式</div><select value={accountId} onChange={(e) => setAcc(e.target.value)} className={cn(inputCls, "mt-2")} disabled={!accounts.length}>{accounts.length ? accounts.map((a) => <option key={a.id} value={a.id}>{ACCOUNT_TYPES[a.type] ?? a.type}{a.note ? ` · ${a.note}` : ""}</option>) : <option value="">微信</option>}</select></label>
          <ul className="space-y-1 text-xs text-muted-foreground"><li>• 最低 ⚡{WD_MIN}，单笔最高 ⚡{WD_MAX.toFixed(2)}</li><li>• 预计 24 小时内到账</li><li>• 单日提现限额由后端风控自动叠加</li><li>• ≥ ⚡{WD_REVIEW.toFixed(2)} 需要 L3 财务复核</li></ul>
          <Button className="w-full" disabled={busy || !accounts.length} onClick={submit}>确认提现</Button>
          <Link href="/guide#reseller" className="block text-center text-xs text-primary" onClick={() => onOpenChange(false)}>查看发票规则 ↗</Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
const fmtAmt = (v: number) => (v ? v.toFixed(2) : "0");

const zapMono = (v: number) => `⚡${fmtAmt(v)}`;

function OverviewTab({ d, onWithdraw }: { d?: FinanceData; onWithdraw: () => void }) {
  const last = d?.withdrawals[0];
  const minis = [["总结算", zapMono(d?.settled ?? 0), CircleDollarSign], ["本月佣金", zapMono(d?.monthIncome ?? 0), Calendar], ["今天的佣金", zapMono(d?.todayIncome ?? 0), TrendingUp], ["充值分润率", d?.markupPct ? `${(d.share * 100).toFixed(1)}%` : "—", TrendingUp]] as const;
  const breakdown = [["本月总计", d?.monthIncome ?? 0], ["已打款", d?.settled ?? 0], ["待结算", d?.pending ?? 0], ["今日预估", d?.todayIncome ?? 0], ["直接分佣", d?.directIncome ?? 0], ["间接分佣", d?.indirectIncome ?? 0]] as const;
  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-4 xl:grid-cols-12">
        <article className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-6 xl:col-span-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#10b981]">可用余额</div><h2 className="mt-1.5 text-sm font-bold text-muted-foreground">当前可提取余额</h2></div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border bg-muted"><Wallet size={20} className="text-[#10b981]" /></span>
          </div>
          <div className="mt-4 font-mono text-[clamp(2.5rem,5vw,4rem)] font-black leading-none tracking-[-0.05em] text-foreground">{zapMono(d?.available ?? 0)}</div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <button type="button" onClick={onWithdraw} className="inline-flex items-center gap-1.5 hover:text-foreground"><ArrowUpRight size={14} className="text-[#10b981]" />申请提款</button>
            <span className="inline-flex items-center gap-1.5">最近提款 · <span className="font-mono font-black text-foreground">{zapMono(last?.amount ?? 0)}</span></span>
            <Link href="/reseller/finance?tab=payout-profile" className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/60 bg-muted px-3 text-xs font-semibold text-foreground transition-colors hover:border-border"><Building2 size={14} />完善提现资料</Link>
          </div>
        </article>
        <div className="grid grid-cols-2 gap-3 xl:col-span-5">
          {minis.map(([k, v, I]) => <div key={k} className="rounded-xl border border-border bg-card px-4 py-4"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-muted-foreground">{k}</span><I size={14} className="text-muted-foreground" /></div><div className="mt-2 truncate font-mono text-lg font-black tracking-[-0.03em] text-foreground">{v}</div></div>)}
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <VaultPanel icon={<ArrowDownToLine size={16} />} title="最近提款">{d?.withdrawals.length ? <ul className="space-y-2">{d.withdrawals.slice(0, 5).map((w) => <WithdrawRow key={w.id} w={w} accounts={d.accounts} />)}</ul> : <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">暂无提现记录</div>}</VaultPanel>
        <VaultPanel icon={<CircleDollarSign size={16} />} title="近期盈利"><div className="space-y-2">{d?.income.length ? d.income.slice(0, 5).map((r) => <div key={r.id} className="flex items-center gap-3 rounded-md border border-border px-4 py-2.5 text-sm"><span className="truncate">{r.username}</span><span className="truncate text-xs text-muted-foreground">{r.model}</span><span className="ml-auto text-xs text-muted-foreground">{dateTimeFull(r.at)}</span><span className="w-20 text-right font-mono text-success">+⚡{r.income.toFixed(3)}</span></div>) : <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">暂无利润分享记录</div>}</div></VaultPanel>
      </section>
      <VaultPanel icon={<CircleDollarSign size={16} />} title="收益来源 · Top 贡献客户">{d?.topCustomers.length ? <ol className="space-y-2">{d.topCustomers.map((c, i) => <li key={c.id} className="flex items-center gap-3 rounded-md border border-border px-4 py-2.5 text-sm"><span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span><span>{c.username}</span><span className="text-xs text-muted-foreground">#{c.id}</span><span className="ml-auto font-mono font-bold">{zapMono(c.income)}</span></li>)}</ol> : <div className="py-4 text-center text-xs text-muted-foreground">暂无分润记录</div>}</VaultPanel>
      <VaultPanel icon={<Receipt size={16} />} title="收益拆解">
        <div className="grid gap-2 sm:grid-cols-2">{breakdown.map(([k, v], i) => <div key={k} className="-mx-2 flex items-baseline justify-between gap-3 rounded-lg border-b border-border/30 px-2 pb-3 transition-colors last:border-0 last:pb-0 hover:bg-muted/40"><span className="text-sm text-muted-foreground">{k}</span><span className={cn("font-mono text-base font-bold tabular-nums", i === 0 ? "text-primary" : "text-foreground")}>{zapMono(v)}</span></div>)}</div>
      </VaultPanel>
    </div>
  );
}

function IncomeTab({ d }: { d?: FinanceData }) {
  const [kw, setKw] = useState(""); const rows = useMemo(() => { const k = kw.trim().toLowerCase(); return (d?.income ?? []).filter((r) => !k || r.username.toLowerCase().includes(k) || r.model.toLowerCase().includes(k) || String(r.userId) === k.replace(/^#/, "")); }, [d, kw]);
  return (
    <section className="pane p-5">
      <ListHead count={rows.length} title="近期盈利" search={kw} onSearch={setKw} placeholder="搜索收益记录" />
      {rows.length === 0 ? <EmptyBox className="mt-4" title="暂无收益记录" desc="客户消耗 API 后,收益记录会显示在这里。" /> : (
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">时间</th><th>客户</th><th>模型</th><th>类型</th><th className="text-right">客户消耗</th><th className="text-right">分润收益</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t"><td className="py-2.5 text-muted-foreground">{dateTimeFull(r.at)}</td><td>#{r.userId} · {r.username}</td><td className="font-mono text-xs">{r.model}</td><td>{r.direct ? "直接" : "间接"}</td><td className="text-right font-mono">⚡{r.consume.toFixed(3)}</td><td className="text-right font-mono text-success">+⚡{r.income.toFixed(3)}</td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}

function WithdrawalsTab({ d }: { d?: FinanceData }) {
  const [kw, setKw] = useState(""); const rows = (d?.withdrawals ?? []).filter((w) => !kw || w.status.includes(kw) || String(w.amount).includes(kw));
  return (
    <div className="space-y-4">
      <div className="pane flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm"><span>预计 24 小时内到账</span><span className="text-muted-foreground">·</span><span>0 手续费</span><span className="text-muted-foreground">·</span><span>≤ ⚡36,000 自动打款 · 超额需人工审核</span></div>
      <section className="pane p-5">
        <ListHead count={rows.length} title="最近提款" search={kw} onSearch={setKw} placeholder="搜索提现记录" />
        {rows.length === 0 ? <EmptyBox className="mt-4" title="暂无提现记录" desc="可提余额大于 0 时,即可发起首次提现。" /> : <ul className="mt-4 space-y-2">{rows.map((w) => <WithdrawRow key={w.id} w={w} accounts={d?.accounts ?? []} />)}</ul>}
      </section>
    </div>
  );
}

export function InvoicesTab({ d }: { d?: FinanceData }) {
  const [kw, setKw] = useState(""); const rows = (d?.invoices ?? []).filter((i) => !kw || i.status.includes(kw) || String(i.amount).includes(kw));
  return (
    <section className="pane p-5">
      <ListHead count={rows.length} title="发票历史" search={kw} onSearch={setKw} placeholder="搜索发票" />
      {rows.length === 0 ? <EmptyBox className="mt-4" title="暂无发票" desc="通过顶栏 [提现] 按钮可同时提交开票申请, 或前往个人中心计费控制台查看历史发票。" /> : <ul className="mt-4 space-y-2">{rows.map((i) => <li key={i.id} className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"><FileText size={16} className="text-primary" /><span className="flex-1 text-muted-foreground">{dateTimeFull(i.createdAt)}</span><span className="rounded-md bg-muted px-2 py-0.5 text-xs">{i.status}</span><Zap v={i.amount} /></li>)}</ul>}
    </section>
  );
}

/** 财务管理：?tab= 七个标签 */
export function FinanceView() {
  const sp = useSearchParams(); const router = useRouter(); const raw = sp.get("tab") ?? "overview";
  const tab = (TABS.some((t) => t.value === raw) ? raw : "overview") as Tab; const f = useFinance(); const [wd, setWd] = useState(false);
  const go = (t: Tab) => router.replace(t === "overview" ? "/reseller/finance" : `/reseller/finance?tab=${t}`, { scroll: false });
  return (
    <div className="w-full space-y-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav role="tablist" aria-label="财务中心导航" className="-mb-px flex flex-wrap items-center gap-1 border-b border-border/40">
          {TABS.map((t) => <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => go(t.value)} className={cn("inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors [&_svg]:size-3.5", tab === t.value ? "border-amber-500 text-amber-500" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.icon}{t.label}</button>)}
        </nav>
        <Button className="mr-14 h-11 min-h-10 shrink-0 gap-2 rounded-lg px-4 text-xs font-semibold shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_18%,transparent)]" onClick={() => (tab === "withdrawals" ? setWd(true) : go("withdrawals"))}><WalletCards size={16} />提现</Button>
      </div>
      {f.isError && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{(f.error as Error).message}</div>}
      {f.isLoading ? <div className="h-72 rounded-shell shimmer" /> : (<>
        {tab === "overview" && <OverviewTab d={f.data} onWithdraw={() => setWd(true)} />}
        {tab === "income" && <IncomeTab d={f.data} />}
        {tab === "withdrawals" && <WithdrawalsTab d={f.data} />}
        {tab === "payout-accounts" && <AccountsTab d={f.data} />}
        {tab === "invoices" && <InvoicesTab d={f.data} />}
        {tab === "card-keys" && <CardKeysTab wallet={f.data?.wallet ?? 0} />}
        {tab === "payout-profile" && <ProfileTab d={f.data} />}
      </>)}
      <WithdrawDialog open={wd} onOpenChange={setWd} data={f.data} />
    </div>
  );
}
