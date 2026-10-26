"use client";
import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ChevronRight, Receipt, Search, X } from "lucide-react";
import { ModelIcon } from "@/components/models/model-icon";
import { useCatalog } from "@/lib/queries";
import { MODALITY_LABEL, type CatalogModel, type Modality } from "@/lib/models";
import { cn, USD_TO_CNY, fmtPoints } from "@/lib/utils";
import { useBrand } from "@/components/shell/brand-provider";
import { useIsReseller } from "@/lib/reseller/client";
import { useScrollTop } from "@/lib/use-scroll-top";

/** 代理商加价后的价格文案（小额保留更多位数） */
function cny(usd: number) { const v = usd * USD_TO_CNY; return `¥${v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3) : v.toFixed(2)}`; }
const SUFFIX: Record<CatalogModel["billingUnit"], string> = { per_second: " / 秒", per_request: " / 次", per_1k_chars: " / 千字", per_1m_tokens: " / 1M tokens" };
const SHORT: Record<CatalogModel["billingUnit"], string> = { per_second: "/秒", per_request: "/次", per_1k_chars: "/千字", per_1m_tokens: "/1M" };

const TABS: (Modality | "all")[] = ["all", "video", "image", "chat", "audio"];
const UNIT: Record<CatalogModel["billingUnit"], { label: string; hint: string }> = {
  per_second: { label: "按秒计费", hint: "渠道价已统一折算为每秒单价，便于跨渠道比较。实际按所选时长与分辨率结算。" },
  per_request: { label: "按次计费", hint: "每次生成固定价，不按时长计费。" },
  per_1k_chars: { label: "按字符计费", hint: "按文本字符数结算。" },
  per_1m_tokens: { label: "按量计费", hint: "按输入/输出 token 用量结算，价格为每百万 token。" },
};

/** 章节分隔标题：—— 各渠道价格 —— */
function Divider({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 flex items-center gap-2"><span className="h-px flex-1 bg-border/50" /><span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{children}</span><span className="h-px flex-1 bg-border/50" /></div>;
}

/** 模型价格查询（用户菜单「模型价格」）：左侧列表，点模型在右侧展开渠道明细 */
export function PriceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data } = useCatalog(); const [tab, setTab] = useState<Modality | "all">("all"); const [q, setQ] = useState(""); const [sel, setSel] = useState<CatalogModel | null>(null); const [seriesFilter, setSeriesFilter] = useState("");
  const listTop = useScrollTop<HTMLDivElement>(`${tab}|${q}|${seriesFilter}`);
  const list = useMemo(() => (data?.models ?? []).filter((m) => tab === "all" || m.category === tab).filter((m) => !seriesFilter || m.series === seriesFilter).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.id.includes(q.toLowerCase())), [data, tab, q, seriesFilter]);
  // 号池入口卡片（造物模型广场同款）：按系列聚合，点击筛选该系列模型
  const seriesCards = useMemo(() => {
    const m = new Map<string, number>();
    for (const model of data?.models ?? []) m.set(model.series, (m.get(model.series) || 0) + 1);
    return [...m.entries()].map(([series, count]) => ({ series, count })).sort((a, b) => b.count - a.count);
  }, [data]);
  const groups = data?.groupRatio ?? {};
  const markup = useBrand().models.markupPct ?? 0; const isAdmin = useIsReseller(); const withMarkup = (usd: number) => usd * (1 + markup / 100);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSel(null); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm animate-in fade-in-0" />
        <DialogPrimitive.Content aria-describedby={undefined} className={cn("fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-gradient-to-b from-primary/40 via-border to-border p-[1.4px] shadow-pop outline-none animate-in fade-in-0 zoom-in-95", sel ? "w-[calc(100vw-2rem)]" : "w-[min(calc(100vw-2rem),560px)]")}>
          <div className="flex h-[min(92vh,1040px)] max-h-[calc(100vh-2rem-2.8px)] flex-col overflow-hidden rounded-[12.6px] bg-card sm:flex-row">
            <DialogPrimitive.Title className="sr-only">模型价格查询</DialogPrimitive.Title>

            {/* 左：搜索 + 分类 + 模型列表 */}
            <div className={cn("min-h-0 w-full flex-col", sel ? "hidden sm:flex sm:w-[520px] sm:shrink-0 sm:border-r sm:border-border/50" : "flex")}>
              <div className="border-b border-border/50 px-4 pb-3.5 pt-5 pr-12 sm:px-5">
                <h4 className="[font-family:Archivo,var(--font-display)] text-[16.5px] [font-weight:660] leading-[1.1]">模型价格查询</h4>
                <p className="mt-2 text-[11px] text-muted-foreground">1 元 = 10 积分 · 单价不等于整次生成费用</p>
                <label className="relative mt-3 block">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索模型名称..." aria-label="搜索模型名称" className="h-[35px] w-full rounded-full border border-border bg-foreground/[0.03] py-[7px] pl-[30px] pr-[11px] text-[12px] outline-none transition-colors focus:border-primary/60" />
                </label>
                <div className="mt-3 flex max-w-full overflow-x-auto">
                  <div className="inline-flex gap-[2px] rounded-full border border-foreground/[0.06] bg-foreground/[0.06] p-[3px]">
                    {TABS.map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] [font-weight:560] leading-5 transition-colors", tab === t ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>{MODALITY_LABEL[t]}</button>)}
                  </div>
                </div>
                {seriesCards.length > 1 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    <button type="button" onClick={() => setSeriesFilter("")} className={cn("shrink-0 rounded-[12px] border px-3.5 py-2 text-left transition-colors", !seriesFilter ? "border-primary/60 bg-primary/[0.08]" : "border-border bg-foreground/[0.03] hover:border-primary/35")}>
                      <div className="text-[12px] [font-weight:600] leading-4">全部线路</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{(data?.models ?? []).length} 个模型</div>
                    </button>
                    {seriesCards.map((c) => (
                      <button key={c.series} type="button" onClick={() => setSeriesFilter(seriesFilter === c.series ? "" : c.series)} className={cn("shrink-0 rounded-[12px] border px-3.5 py-2 text-left transition-colors", seriesFilter === c.series ? "border-primary/60 bg-primary/[0.08]" : "border-border bg-foreground/[0.03] hover:border-primary/35")}>
                        <div className="text-[12px] [font-weight:600] leading-4">{c.series}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{c.count} 个模型</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div ref={listTop} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                <div className="space-y-[7px]">
                  {list.map((m) => (
                    <button key={m.id} type="button" onClick={() => setSel(m)} aria-current={sel?.id === m.id ? "true" : undefined} className={cn("flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors", sel?.id === m.id ? "border-primary/60 bg-primary/[0.08]" : "border-border bg-foreground/[0.03] hover:border-primary/35 hover:bg-primary/[0.04]")}>
                      <ModelIcon model={m} size={35} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-[7px] text-[13px] [font-weight:580] leading-[20.8px]"><span className="min-w-0 flex-1 truncate">{m.name}</span><span className="shrink-0 rounded-full bg-foreground/[0.08] px-[7px] py-[1.5px] text-[9.5px] [font-weight:620] leading-[15.2px] text-muted-foreground">{MODALITY_LABEL[m.category]}</span></span>
                        <span className="line-clamp-1 text-[11px] leading-[17.6px] text-muted-foreground">{m.description || m.id}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                  {list.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">没有匹配的模型。</div>}
                </div>
                <p className="mt-3 border-t border-border/60 px-1 pt-3 text-[11px] text-muted-foreground">共 {list.length} 个模型{seriesFilter ? ` · ${seriesFilter}` : ""} · 显示价为你的实付价,点模型查看各渠道明细。</p>
              </div>
            </div>

            {/* 右：模型明细 */}
            {sel && (
              <div className="flex min-h-0 w-full flex-1 flex-col animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-2 border-b border-border/50 px-4 pb-3 pt-5 pr-12 sm:px-5">
                  <button type="button" onClick={() => setSel(null)} aria-label="返回" className="inline-flex h-[33px] shrink-0 items-center rounded-full border px-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft size={16} /></button>
                  <ModelIcon model={sel} size={35} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold sm:text-base">{sel.name}</div></div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                  {sel.description && <p className="mb-4 text-xs leading-5 text-muted-foreground">{sel.description}</p>}
                  <div className="mt-5">
                    <Divider>各渠道价格</Divider>
                    <div className="mb-2 flex items-center gap-1.5"><span className="text-[10px] text-muted-foreground/70">当前价格口径</span><span className="rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{UNIT[sel.billingUnit].label} · {sel.series}</span></div>
                    <ul className="flex flex-col gap-1.5">
                      {sel.groups.map((g) => { const r = groups[g] ?? 1; return (
                        <li key={g} className="rounded-[10px] border border-border/50 bg-card/30 px-3 py-2 transition-colors hover:border-border hover:bg-muted/40">
                          <div className="flex min-w-0 items-center gap-2"><span className="shrink-0 text-[12px] font-semibold">{g === "default" ? "自动" : g}</span><span className="min-w-0 truncate rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">{g === "default" ? "智能调度（默认）" : `指定渠道 ${g}`}</span></div>
                          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-[11px]"><span className="font-mono text-primary">{fmtPoints(sel.priceUsd * r)}</span><span className="text-[10px] text-muted-foreground/70">{SHORT[sel.billingUnit]}（{cny(sel.priceUsd * r)}）</span>{r !== 1 && <span className="rounded bg-muted/60 px-1 font-mono text-[10px] text-muted-foreground/80">×{r}</span>}</div>
                        </li>
                      ); })}
                    </ul>
                    <p className="mt-2.5 text-[10px] leading-4 text-muted-foreground">系统按所选策略自动路由，任一渠道异常即时降级，全程无感。</p>
                  </div>
                  <div className="mt-4 rounded-[10px] border border-foreground/[0.09] bg-foreground/[0.03] px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold"><Receipt size={14} className="shrink-0 text-primary" />计费方式</div>
                    {/* 最醒目的这一行必须是用户真正要付的价：站长设了全站加价时，目录里的 price 还是加价前的进货价 */}
                    <div className="mt-1 text-[13px] font-semibold">{UNIT[sel.billingUnit].label} · <span className="text-primary">{fmtPoints(withMarkup(sel.priceUsd))}{SUFFIX[sel.billingUnit]}</span><small className="ml-2 font-normal text-muted-foreground">（{cny(withMarkup(sel.priceUsd))}）</small></div>
                    <p className="mt-1 text-[11px] leading-[17.6px] text-muted-foreground">{UNIT[sel.billingUnit].hint}</p>
                    {markup > 0 && isAdmin && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-foreground/[0.09] pt-2 text-[12px]"><span>进货价 <span className="font-medium">{cny(sel.priceUsd)}</span>{SUFFIX[sel.billingUnit]}</span><span className="text-[11px] text-muted-foreground">客户价 = 进货价 × (1 + {markup}%)</span></div>}
                  </div>
                  {Object.keys(sel.paramSchema).length > 0 && <div className="mt-5"><Divider>生成设置</Divider><div className="flex flex-wrap gap-1.5">{Object.entries(sel.paramSchema).map(([k, f]) => <span key={k} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{f.label?.zh ?? k}{f.options ? `：${f.options.map((o) => o.label).join(" / ")}` : f.enum ? `：${f.enum.join(" / ")}` : ""}</span>)}</div></div>}
                </div>
              </div>
            )}
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 z-30 inline-flex h-[39px] w-[39px] items-center justify-center rounded-[10px] border border-border/35 bg-background/20 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground" aria-label="关闭"><X size={17} /></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
