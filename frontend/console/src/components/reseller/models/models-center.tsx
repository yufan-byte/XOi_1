"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Coins, Cpu, ListChecks, Network, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { SectionHero } from "@/components/reseller/common";
import { Kpi } from "@/components/reseller/legacy/frame";
import { Button } from "@/components/ui/button";
import { LabeledSwitch } from "@/components/reseller/site/ui";
import { api, getPricing } from "@/lib/api";
import { buildCatalog, type CatalogModel, type Modality } from "@/lib/models";
import { DEFAULT_DATA, type ModelsConfig } from "@/lib/reseller/types";
import { cn, USD_TO_CNY } from "@/lib/utils";

interface ModelsAdmin { models: ModelsConfig; remaining: number; defaultGroupRatio: number | null; optionError: string }
/** 管理配置读取失败时仍按参考站结构渲染模型列表（全部视为已启用） */
const FALLBACK_CFG: ModelsAdmin = { models: DEFAULT_DATA.models, remaining: 0, defaultGroupRatio: null, optionError: "" };
interface MarkupResult { models: ModelsConfig; remaining: number; applied: boolean; optionError: string; defaultGroupRatio: number | null }

const CATS: [Modality, string][] = [["chat", "对话"], ["image", "图像"], ["video", "视频"], ["audio", "音频"]];
const UNIT: Record<CatalogModel["billingUnit"], string> = { per_request: "/次", per_second: "/秒", per_1k_chars: "/千字", per_1m_tokens: "/1M" };
const input = "h-11 rounded-xl border bg-card px-4 text-[15px] outline-none focus:border-primary/50";

/** Admin cost and retail comparisons use yuan; customers see 10 points per yuan. */
export function zapPrice(cny: number) {
  if (!Number.isFinite(cny) || cny <= 0) return "¥0";
  if (cny < 0.0001) return "¥<0.0001";
  if (cny < 0.01) return `¥${cny.toFixed(4)}`;
  if (cny < 1) return `¥${cny.toFixed(3)}`;
  return `¥${cny.toFixed(2)}`;
}

/** 模型管理中心：可售模型 / 定价设置（?tab=pricing） */
export function ModelsCenter({ only }: { only?: "pricing" } = {}) {
  const sp = useSearchParams(); const router = useRouter(); const path = usePathname(); const qc = useQueryClient();
  const tab = only ?? (sp.get("tab") === "pricing" ? "pricing" : "models");
  const catalog = useQuery({ queryKey: ["catalog", "all"], queryFn: async () => buildCatalog((await getPricing()).data ?? [], { includeHidden: true }), staleTime: 5 * 60_000 });
  const cfg = useQuery({ queryKey: ["reseller", "models-admin"], queryFn: () => api<ModelsAdmin>("/api/reseller/models") });
  const setCfg = (next: ModelsAdmin) => { qc.setQueryData(["reseller", "models-admin"], next); qc.invalidateQueries({ queryKey: ["reseller", "public", "models"] }); };

  if (only) {
    const c = cfg.data ?? FALLBACK_CFG;
    return (
      <div className="space-y-5">
        {(catalog.error || cfg.error) && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{((catalog.error ?? cfg.error) as Error).message}</div>}
        <section className="grid gap-3 sm:grid-cols-2"><Kpi label="对用户加价率" value={`${c.models.markupPct}%`} icon={<Coins />} accent /><Kpi label="对下级加价率" value={`${c.models.downstreamMarkupPct ?? 5}%`} icon={<Network />} /></section>
        <UpstreamSyncPanel />
        {(!catalog.data && !catalog.error) || cfg.isLoading ? <div className="h-[50vh] rounded-2xl shimmer" /> : <PricingTab key="pricing-compact" compact models={catalog.data ?? []} cfg={c} setCfg={setCfg} />}
      </div>
    );
  }
  return (
    <div className="flex min-h-full flex-col gap-3">
      {!only && <SectionHero badge="模型管理" icon={<Cpu />} title="模型管理中心" subtitle="启用模型、设置加价倍率、洞察每次调用的真实利润。" />}
      {!only && (
        <nav role="tablist" aria-label="模型管理标签" className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/40 bg-card/40 p-1.5">
          {([["models", "可售模型", ListChecks], ["pricing", "定价设置", SlidersHorizontal]] as const).map(([v, l, I]) => <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => router.replace(v === "pricing" ? `${path}?tab=pricing` : path, { scroll: false })} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors", tab === v ? "border-amber-500/50 bg-amber-500/10 text-amber-500" : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground")}><I size={14} />{l}</button>)}
        </nav>
      )}
      {(catalog.error || cfg.error) && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{((catalog.error ?? cfg.error) as Error).message}</div>}
      <UpstreamSyncPanel />
      {catalog.error ? null
        : !catalog.data || cfg.isLoading ? <div className="h-[50vh] rounded-[16px] shimmer" />
        : tab === "models" ? <SalesTab key="models" models={catalog.data} cfg={cfg.data ?? FALLBACK_CFG} setCfg={setCfg} /> : <PricingTab key="pricing" models={catalog.data} cfg={cfg.data ?? FALLBACK_CFG} setCfg={setCfg} />}
    </div>
  );
}

function UpstreamSyncPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  type SyncStatus = { syncedAt: string | null; models: number; status: string; canSync: boolean; syncedChannels?: number; totalChannels?: number; channels?: { name: string; status: string }[] };
  const query = useQuery({ queryKey: ["upstream-pricing-sync"], retry: false, queryFn: () => api<SyncStatus>("/api/reseller/models/upstream-status"), refetchInterval: 60_000 });
  if (!query.data) return null;
  const sync = async () => {
    setBusy(true);
    try {
      const result = await api<{ failedChannels?: { name: string }[] }>("/api/reseller/models/sync-upstream", { method: "POST", body: "{}" });
      await Promise.all([qc.invalidateQueries({ queryKey: ["upstream-pricing-sync"] }), qc.invalidateQueries({ queryKey: ["catalog"] })]);
      if (result.failedChannels?.length) toast.warning(`其余分组已同步；${result.failedChannels.map(item => item.name).join("、")} 保留现有价格并将自动重试`);
      else toast.success("上游模型和成本价已同步，本站加价率保持不变");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const failed = query.data.channels?.filter(channel => channel.status !== "synced").map(channel => channel.name) ?? [];
  const state = query.data.status === "synced"
    ? `已同步 ${query.data.models} 个模型 · ${new Date(query.data.syncedAt!).toLocaleString("zh-CN")}`
    : query.data.status === "partial"
      ? `已同步 ${query.data.syncedChannels ?? 0}/${query.data.totalChannels ?? 0} 个分组；${failed.join("、") || "待更新分组"} 保留现有价格并自动重试`
      : "尚未完成同步，当前使用网关已有价格";
  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-xs">
    <div><p className="font-medium">造物价格自动同步 · 每 15 分钟</p><p className="mt-1 text-muted-foreground">{state}。本站售价按你设置的加价率计算，1 元 = 10 积分。</p></div>
    {query.data.canSync && <Button size="sm" disabled={busy} onClick={sync}>{busy ? "同步中…" : "立即同步"}</Button>}
  </section>;
}

function SalesTab({ models, cfg, setCfg }: { models: CatalogModel[]; cfg: ModelsAdmin; setCfg: (c: ModelsAdmin) => void }) {
  const [filter, setFilter] = useState<"all" | "on" | "off">("all"); const [q, setQ] = useState("");
  const disabled = useMemo(() => new Set(cfg.models.disabled), [cfg.models.disabled]);
  const offCount = models.filter((m) => disabled.has(m.id)).length;
  const list = useMemo(() => { const k = q.trim().toLowerCase(); return models.filter((m) => (filter === "all" || (filter === "off") === disabled.has(m.id)) && (!k || m.name.toLowerCase().includes(k) || m.id.toLowerCase().includes(k))); }, [models, filter, q, disabled]);
  const toggle = async (m: CatalogModel, on: boolean) => {
    const prev = cfg; const ids = on ? cfg.models.disabled.filter((x) => x !== m.id) : [...cfg.models.disabled, m.id];
    setCfg({ ...cfg, models: { ...cfg.models, disabled: ids } });
    try { const r = await api<{ models: ModelsConfig }>("/api/reseller/models", { method: "PUT", body: JSON.stringify({ action: "disabled", disabled: ids }) }); setCfg({ ...cfg, models: r.models }); toast.success(`${m.name} 已${on ? "启用" : "禁用"}`); }
    catch (e) { setCfg(prev); toast.error(`操作失败：${(e as Error).message}`); }
  };
  const chip = (k: typeof filter, label: string, n: number) => <button type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors duration-150", filter === k ? "border-amber-500/40 bg-amber-500/10 text-amber-500" : "border-border/60 bg-card hover:border-border/80")}>{label}<span className="ml-1 text-[10px] tabular-nums opacity-75">{n}</span></button>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-border/50 bg-card p-5">
        {chip("all", "全部", models.length)}{chip("on", "已启用", models.length - offCount)}{chip("off", "已禁用", offCount)}
        <div className="ml-auto flex items-center gap-2"><Search size={16} className="text-muted-foreground" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="按名称或 ID 搜索" aria-label="按名称或 ID 搜索" className="h-9 w-64 min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/50" /></div>
      </div>
      {CATS.map(([c, label]) => { const rows = list.filter((m) => m.category === c); if (!rows.length) return null; return (
        <section key={c} className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label} 模型</h3><span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{rows.length}</span></div>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-[16px] border border-border/50 bg-card">
            {rows.map((m) => { const on = !disabled.has(m.id); return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className={cn("flex min-w-0 flex-1 flex-col", !on && "opacity-60")}><span className="truncate text-sm font-medium text-foreground">{m.name}</span><span className="truncate font-mono text-[10px] text-muted-foreground">{m.id} · {m.series}</span></div>
                <LabeledSwitch label={`${m.name} 启用状态`} checked={on} onCheckedChange={(v) => toggle(m, v)} />
              </li>
            ); })}
          </ul>
        </section>
      ); })}
      {list.length === 0 && <div className="rounded-[16px] border border-border/50 py-12 text-center text-sm text-muted-foreground">没有匹配的模型。</div>}
    </div>
  );
}

const RATES = [5, 10, 15, 20, 30, 40, 50];
const CAT_ORDER: Record<Modality, number> = { audio: 0, chat: 1, image: 2, video: 3 };

function PricingTab({ models, cfg, setCfg, compact }: { models: CatalogModel[]; cfg: ModelsAdmin; setCfg: (c: ModelsAdmin) => void; compact?: boolean }) {
  const rate = cfg.models.markupPct; const down = cfg.models.downstreamMarkupPct ?? 5;
  const [val, setVal] = useState(String(rate)); const [downVal, setDownVal] = useState(String(down)); const [spend, setSpend] = useState("10000"); const [busy, setBusy] = useState(false);
  const rows = useMemo(() => [...models].sort((a, b) => CAT_ORDER[a.category] - CAT_ORDER[b.category] || a.name.localeCompare(b.name, "zh")), [models]);
  const expected = Math.round((1 + rate / 100) * 10_000) / 10_000;

  const saveMarkup = async () => {
    const n = Number(val);
    if (val.trim() === "" || !Number.isFinite(n) || n < 0 || n > 50) { toast.error("加价率需在 0 – 50% 之间"); return; }
    setBusy(true);
    try {
      const r = await api<MarkupResult>("/api/reseller/models", { method: "PUT", body: JSON.stringify({ action: "markup", markupPct: n }) });
      setCfg({ models: r.models, remaining: r.remaining, defaultGroupRatio: r.applied ? r.defaultGroupRatio : cfg.defaultGroupRatio, optionError: r.optionError });
      if (r.applied) toast.success(`已保存：加价率 ${r.models.markupPct}%，new-api 分组倍率 default = ×${r.defaultGroupRatio}`);
      else toast.error(`加价率已保存，但同步 new-api 分组倍率失败：${r.optionError}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const saveDown = async () => {
    const n = Number(downVal);
    if (downVal.trim() === "" || !Number.isFinite(n) || n < 0 || n > 20) { toast.error("对分销加成需在 0 – 20% 之间"); return; }
    setBusy(true);
    try { const r = await api<{ models: ModelsConfig }>("/api/reseller/models", { method: "PUT", body: JSON.stringify({ action: "downstream", downstreamMarkupPct: n }) }); setCfg({ ...cfg, models: r.models }); toast.success("对分销加成已保存"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const spendN = Math.max(0, Number(spend) || 0); const profit = spendN * (rate / 100) / (1 + rate / 100);

  if (compact) {
    const card = "rounded-2xl border border-border bg-card p-5";
    const small = "w-20 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary";
    const successBox = "rounded-xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-success/[0.08]";
    const Head = ({ title, desc, label, value }: { title: string; desc: string; label?: string; value?: string }) => (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1"><h3 className="text-sm font-semibold text-foreground">{title}</h3><p className="max-w-prose text-xs leading-5 text-muted-foreground">{desc}</p></div>
        {label && <div className="text-right"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="font-mono text-2xl font-semibold tabular-nums text-primary">{value}</p></div>}
      </div>
    );
    return (
      <>
        <section className={card}>
          <Head title="我的加价率" desc="在你的进货价基础上加价，加价部分全部归你（跟平台无关）。客户在你这里付：进货价 ×（1 + 加价率）。" label="当前加价率" value={`${rate}%`} />
          <div className={cn(successBox, "mt-4 px-4 py-3")}><p className="text-xs leading-5 text-foreground">你加价 <span className="font-semibold text-success">{rate}%</span>：进货 ¥100 → 客户付 ¥{+(100 + rate).toFixed(2)} → 你赚 <span className="font-semibold text-success">¥{+rate.toFixed(2)}</span>（加价全归你，跟我们进货价无关）</p></div>
          <p className="mt-2 text-[11px]">
            {cfg.defaultGroupRatio == null ? <span className="inline-flex items-center gap-1 text-danger"><AlertTriangle size={12} />无法读取 new-api 分组倍率{cfg.optionError ? `：${cfg.optionError}` : ""}</span>
              : Math.abs(cfg.defaultGroupRatio - expected) < 1e-6 ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 size={12} />已生效：new-api 分组倍率 default = ×{cfg.defaultGroupRatio}</span>
              : <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle size={12} />new-api 分组倍率 default 当前为 ×{cfg.defaultGroupRatio}，与加价率不一致，点击保存即可同步</span>}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label htmlFor="markup-c" className="text-xs font-medium text-foreground">设置加价率</label>
            <div className="flex items-center gap-1"><input id="markup-c" type="number" min={0} max={50} step={1} value={val} onChange={(e) => setVal(e.target.value)} className={small} /><span className="text-xs text-muted-foreground">%</span></div>
            <span className="font-mono text-[10px] text-muted-foreground">0 – 50%</span>
            <Button size="sm" disabled={busy || (cfg.remaining <= 0 && Number(val) !== rate)} onClick={saveMarkup}>保存</Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">售价 = 上游成本 ×（1 + 加价率）；积分 = 售价 × 10。保存后影响后续模型调用，已有充值余额不变，新报价约 30 秒内刷新。</p>
          <p className="mt-2 text-[11px] text-muted-foreground">本月还可调整 {cfg.remaining} 次(30 天内最多 10 次)</p>
        </section>
        <section className={card}>
          <Head title="对分销加成" desc="开通新下级代理时，对方的默认进货加价。本数值不影响你自己的客户价。" label="当前对分销加成" value={`${down}%`} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label htmlFor="downstream-c" className="text-xs font-medium text-foreground">设置对分销加成</label>
            <div className="flex items-center gap-1"><input id="downstream-c" type="number" min={0} max={20} step={1} value={downVal} onChange={(e) => setDownVal(e.target.value)} className={small} /><span className="text-xs text-muted-foreground">%</span></div>
            <span className="font-mono text-[10px] text-muted-foreground">0 – 20%</span>
            <Button size="sm" disabled={busy} onClick={saveDown}>保存</Button>
          </div>
          <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">开通新下级时：下级进货价 =（你的进货价）×（1 + 对分销加成），开通瞬间算定并锁存到对方账户。你之后再调本值只影响下一个新下级，已开通的下级不受影响（保护下级利润）。</p>
        </section>
        <section className={card}>
          <Head title="利润测算器" desc="输入月消费额，按你当前加价率预估利润；下方是各加价档位的利润占比参考。" />
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div><label htmlFor="spend-c" className="text-xs font-medium text-foreground">名下用户月消费额</label><div className="mt-1.5 flex items-center gap-1"><span className="text-xs text-muted-foreground">¥</span><input id="spend-c" type="number" min={0} value={spend} onChange={(e) => setSpend(e.target.value)} className={cn(small, "w-32")} /></div></div>
            <div className={cn(successBox, "px-4 py-2.5")}><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">按当前 {rate}% 加价，您赚约</p><p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-success">¥{profit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">利润公式：您赚 = 消费额 × 加价率 ÷ (1 + 加价率)</p>
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-foreground">加价率 · 利润精确对照</p>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50"><tr className="text-left text-muted-foreground"><th className="px-3 py-2 font-medium">加价率</th><th className="px-3 py-2 text-right font-medium">利润占消费比</th></tr></thead>
                <tbody>{RATES.map((r) => <tr key={r} className={cn("border-t border-border/60", r === rate && "bg-primary/[0.12]")}><td className="px-3 py-2 font-mono text-foreground">{r} %{r === 10 && <span className="ml-1.5 rounded bg-success/[0.16] px-1.5 py-0.5 font-sans text-[9px] font-medium text-success">推荐</span>}{r === rate && <span className="ml-1.5 rounded bg-primary/[0.18] px-1.5 py-0.5 font-sans text-[9px] font-medium text-primary">当前</span>}</td><td className="px-3 py-2 text-right font-mono text-success">{(r / (100 + r) * 100).toFixed(1)} %</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">利润占比为精确公式派生。加价越高，单笔利润越厚但付费转化通常越低；甜点区综合利润往往最优。</p>
        </section>
        <section className={card}>
          <div className="max-h-[26rem] overflow-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card/95 backdrop-blur"><tr className="text-left text-muted-foreground"><th className="px-3 py-2 font-medium">模型</th><th className="px-3 py-2 text-right font-medium">我的进货价</th><th className="px-3 py-2 text-right font-medium">客户价</th><th className="px-3 py-2 text-right font-medium">我每笔赚</th></tr></thead>
              <tbody className="font-mono">
                {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center font-sans text-muted-foreground">暂无模型</td></tr>}
                {rows.map((m) => { const base = m.priceUsd * USD_TO_CNY; const u = UNIT[m.billingUnit]; return (
                  <tr key={m.id} className="border-t border-border/60"><td className="px-3 py-1.5 font-sans text-foreground">{m.name}</td><td className="px-3 py-1.5 text-right text-muted-foreground">{zapPrice(base)}<span className="text-[10px]">{u}</span></td><td className="px-3 py-1.5 text-right text-foreground">{zapPrice(base * (1 + rate / 100))}<span className="text-[10px] text-muted-foreground">{u}</span></td><td className="px-3 py-1.5 text-right text-success">{zapPrice(base * rate / 100)}</td></tr>
                ); })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">客户价 = 进货价 × (1 + 加价率)。客户积分 = 客户价 × 10；成本 ¥1，加价 30% 后为 ¥1.30，即 13 积分。</p>
        </section>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <section className="pane p-6">
        <h2 className="text-lg font-semibold">我的加价率</h2>
        <p className="mt-1 text-sm text-muted-foreground">在你的进货价基础上加价，加价部分全部归你（跟平台无关）。客户在你这里付：进货价 ×（1 + 加价率）。</p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border bg-primary-tint/40 p-5">
            <div className="text-sm text-muted-foreground">当前加价率</div>
            <div className="mt-1 font-mono text-5xl font-bold text-primary">{rate}%</div>
            <p className="mt-3 text-sm">你加价 {rate}%：进货 ¥100 → 客户付 ¥{+(100 + rate).toFixed(2)} → 你赚 ¥{+rate.toFixed(2)}（加价全归你，跟我们进货价无关）</p>
            <div className="mt-3 text-xs">
              {cfg.defaultGroupRatio == null ? <span className="inline-flex items-center gap-1 text-danger"><AlertTriangle size={13} />无法读取 new-api 分组倍率{cfg.optionError ? `：${cfg.optionError}` : ""}</span>
                : Math.abs(cfg.defaultGroupRatio - expected) < 1e-6 ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 size={13} />已生效：new-api 分组倍率 default = ×{cfg.defaultGroupRatio}</span>
                : <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle size={13} />new-api 分组倍率 default 当前为 ×{cfg.defaultGroupRatio}，与加价率不一致，点击保存即可同步</span>}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="markup">设置加价率</label>
            <div className="mt-2 flex items-center gap-2">
              <span className="relative"><input id="markup" type="number" min={0} max={50} step={1} value={val} onChange={(e) => setVal(e.target.value)} className={cn(input, "w-40 pr-9 font-mono")} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span></span>
              <span className="text-sm text-muted-foreground">0 – 50%</span>
              <button type="button" disabled={busy || cfg.remaining <= 0 && Number(val) !== rate} onClick={saveMarkup} className="ml-auto h-11 rounded-xl bg-primary px-6 font-medium text-white hover:bg-primary-strong disabled:opacity-60">保存</button>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">售价 = 上游成本 ×（1 + 加价率）；积分 = 售价 × 10。保存后影响后续模型调用，已有充值余额不变，新报价约 30 秒内刷新。</p>
            <p className="mt-2 text-sm font-medium">本月还可调整 {cfg.remaining} 次(30 天内最多 10 次)</p>
          </div>
        </div>
        <div className="mt-6 max-h-[520px] overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr><th className="px-4 py-2.5 font-medium">模型</th><th className="px-4 py-2.5 text-right font-medium">我的进货价</th><th className="px-4 py-2.5 text-right font-medium">客户价</th><th className="px-4 py-2.5 text-right font-medium">我每笔赚</th></tr></thead>
            <tbody className="divide-y">
              {rows.map((m) => { const base = m.priceUsd * USD_TO_CNY; const u = UNIT[m.billingUnit]; return (
                <tr key={m.id}><td className="px-4 py-2.5">{m.name}</td><td className="px-4 py-2.5 text-right font-mono">{zapPrice(base)}<span className="text-xs text-muted-foreground">{u}</span></td><td className="px-4 py-2.5 text-right font-mono">{zapPrice(base * (1 + rate / 100))}<span className="text-xs text-muted-foreground">{u}</span></td><td className="px-4 py-2.5 text-right font-mono text-success">{zapPrice(base * rate / 100)}</td></tr>
              ); })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">客户价 = 进货价 × (1 + 加价率)。客户积分 = 客户价 × 10；成本 ¥1，加价 30% 后为 ¥1.30，即 13 积分。</p>
      </section>

      <section className="pane p-6">
        <h2 className="text-lg font-semibold">对分销加成</h2>
        <p className="mt-1 text-sm text-muted-foreground">开通新下级代理时，对方的默认进货加价。本数值不影响你自己的客户价。</p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border p-5"><div className="text-sm text-muted-foreground">当前对分销加成</div><div className="mt-1 font-mono text-4xl font-bold">{down}%</div></div>
          <div>
            <label className="text-sm font-medium" htmlFor="downstream">设置对分销加成</label>
            <div className="mt-2 flex items-center gap-2">
              <span className="relative"><input id="downstream" type="number" min={0} max={20} step={1} value={downVal} onChange={(e) => setDownVal(e.target.value)} className={cn(input, "w-40 pr-9 font-mono")} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span></span>
              <span className="text-sm text-muted-foreground">0 – 20%</span>
              <button type="button" disabled={busy} onClick={saveDown} className="ml-auto h-11 rounded-xl bg-primary px-6 font-medium text-white hover:bg-primary-strong disabled:opacity-60">保存</button>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">开通新下级时：下级进货价 =（你的进货价）×（1 + 对分销加成），开通瞬间算定并锁存到对方账户。你之后再调本值只影响下一个新下级，已开通的下级不受影响（保护下级利润）。</p>
          </div>
        </div>
      </section>

      <section className="pane p-6">
        <h2 className="text-lg font-semibold">利润测算器</h2>
        <p className="mt-1 text-sm text-muted-foreground">输入月消费额，按你当前加价率预估利润；下方是各加价档位的利润占比参考。</p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <label className="text-sm font-medium" htmlFor="spend">名下用户月消费额</label>
            <div className="relative mt-2"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span><input id="spend" type="number" min={0} value={spend} onChange={(e) => setSpend(e.target.value)} className={cn(input, "w-full pl-8 font-mono")} /></div>
            <div className="mt-4 rounded-2xl border bg-success/5 p-5">
              <div className="text-sm text-muted-foreground">按当前 {rate}% 加价，您赚约</div>
              <div className="mt-1 font-mono text-4xl font-bold text-success">¥{profit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="mt-2 text-xs text-muted-foreground">利润公式：您赚 = 消费额 × 加价率 ÷ (1 + 加价率)</div>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">加价率 · 利润精确对照</div>
            <table className="mt-2 w-full overflow-hidden rounded-xl border text-sm">
              <thead className="bg-muted text-left text-muted-foreground"><tr><th className="px-4 py-2 font-medium">加价率</th><th className="px-4 py-2 text-right font-medium">利润占消费比</th></tr></thead>
              <tbody className="divide-y">{RATES.map((r) => <tr key={r} className={cn(r === rate && "bg-primary-tint/50")}><td className="px-4 py-2">{r}%{r === 10 && <span className="ml-2 rounded bg-success/10 px-1.5 py-px text-xs text-success">推荐</span>}{r === rate && <span className="ml-2 rounded bg-primary-tint px-1.5 py-px text-xs text-primary">当前</span>}</td><td className="px-4 py-2 text-right font-mono">{(r / (100 + r) * 100).toFixed(1)}%</td></tr>)}</tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">利润占比为精确公式派生。加价越高，单笔利润越厚但付费转化通常越低；甜点区综合利润往往最优。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
