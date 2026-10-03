"use client";
// 单把 API 密钥的使用明细：对接 new-api /api/log/self?token_name=<密钥名>（可翻页、按模型 / 时间段筛选、导出 CSV），布局与参考站「使用明细」弹框一致
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Info, Search } from "lucide-react";
import { PillSelect } from "@/components/ui/select";
import { api } from "@/lib/api";
import { cn, fmtCny as fmtCnyBase, quotaToUsd } from "@/lib/utils";
import { AccountDialog, accountPillCls } from "./account-dialog-shell";
import { KIND_ICON, KIND_LABEL, kindOf, ts, type LogItem } from "./usage-dialog";
import type { Token } from "./api-key-form";

const fmtCny = (usd: number) => (usd > 0 && usd < 0.1 ? `¥${usd.toFixed(4)}` : fmtCnyBase(usd));
const RANGE = [{ value: "7", label: "近 7 天" }, { value: "30", label: "近 30 天" }, { value: "90", label: "近 90 天" }, { value: "0", label: "全部" }, { value: "custom", label: "自定义日期" }];
const PAGE = 20;
/** 汇总统计最多回溯的条数：分页 100 条 × 10 页，避免大账号把整张日志表拉下来 */
const AGG_PAGE = 100; const AGG_MAX_PAGES = 10;
const dateInputCls = "h-[35px] rounded-full border border-border bg-foreground/[0.03] px-[11px] text-[12px] font-medium leading-[19.2px] outline-none focus:ring-2 focus:ring-ring/30";
const Empty = ({ children }: { children: React.ReactNode }) => <div className="px-[13.2px] py-[44px] text-center text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">{children}</div>;
const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function unwrap(r: { items?: LogItem[]; total?: number } | LogItem[] | null) {
  return Array.isArray(r) ? { items: r, total: r.length } : { items: r?.items ?? [], total: r?.total ?? (r?.items ?? []).length };
}

/** API 密钥弹框 → 每把密钥的「使用明细」 */
export function TokenUsageDialog({ token, onOpenChange }: { token: Token | null; onOpenChange: (v: boolean) => void }) {
  const open = !!token; const name = token?.name ?? "";
  const [range, setRange] = useState("7"); const [from, setFrom] = useState(() => toDay(new Date(Date.now() - 6 * 86400_000))); const [to, setTo] = useState(() => toDay(new Date()));
  const [model, setModel] = useState("");
  // 任一筛选条件变化都回到第 1 页：页码和当时的筛选条件绑在一起存，条件变了页码自然失效（不用 effect）
  const filterKey = [name, range, from, to, model].join("\u0000"); const [pg, setPg] = useState({ key: filterKey, page: 1 });
  const page = pg.key === filterKey ? pg.page : 1; const setPage = (n: number) => setPg({ key: filterKey, page: n });
  // 时间窗在发请求时才取当前时刻（渲染阶段不读时钟）；自定义日期按本地零点取整，结束日期取到当天 24:00
  const query = () => {
    const now = Math.floor(Date.now() / 1000); let start = 0, end = now + 3600;
    if (range === "custom") { const s = from ? Math.floor(new Date(`${from}T00:00:00`).getTime() / 1000) : 0; const e = to ? Math.floor(new Date(`${to}T00:00:00`).getTime() / 1000) + 86400 : end; start = Number.isFinite(s) ? s : 0; end = Number.isFinite(e) ? e : end; }
    else if (range !== "0") start = now - Number(range) * 86400;
    return `type=0&token_name=${encodeURIComponent(name)}&model_name=${encodeURIComponent(model.trim())}&start_timestamp=${start}&end_timestamp=${end}&group=`;
  };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["token-logs", name, range, from, to, model, page], enabled: open,
    queryFn: async () => unwrap(await api<{ items?: LogItem[]; total?: number } | LogItem[] | null>(`/api/log/self?p=${page}&page_size=${PAGE}&${query()}`)),
  });
  // 汇总：实扣 / 退回 需要逐条区分正负额度，stat 接口只给净值，所以按 100 条一页回溯（最多 1000 条）
  const { data: agg } = useQuery({
    queryKey: ["token-logs-agg", name, range, from, to, model], enabled: open, staleTime: 60_000,
    queryFn: async () => {
      const all: LogItem[] = []; let total = 0; let truncated = false; const q = query();
      for (let p = 1; p <= AGG_MAX_PAGES; p++) {
        const r = unwrap(await api<{ items?: LogItem[]; total?: number } | LogItem[] | null>(`/api/log/self?p=${p}&page_size=${AGG_PAGE}&${q}`));
        all.push(...r.items); total = Math.max(total, r.total);
        if (r.items.length < AGG_PAGE || all.length >= total) break;
        if (p === AGG_MAX_PAGES) truncated = true;
      }
      let spent = 0, refunded = 0; for (const i of all) { if (i.quota >= 0) spent += i.quota; else refunded += -i.quota; }
      return { items: all, total, spent, refunded, truncated };
    },
  });
  const items = data?.items ?? []; const total = data?.total ?? 0; const pages = Math.max(1, Math.ceil(total / PAGE));
  const exportCsv = () => {
    const src = agg?.items?.length ? agg.items : items; if (!src.length) return;
    const rows = [["时间", "密钥", "模型", "类型", "消耗(¥)", "状态", "输入tokens", "输出tokens", "耗时(s)"], ...src.map((i) => [ts(i.created_at), name, i.model_name, KIND_LABEL[kindOf(i.model_name)], quotaToUsd(i.quota).toFixed(4), i.quota < 0 ? "已退款" : "扣费成功", i.prompt_tokens, i.completion_tokens, i.use_time ?? ""])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `密钥使用明细-${name || "key"}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const stats: [string, string][] = [
    ["算力使用量", fmtCny(quotaToUsd((agg?.spent ?? 0) - (agg?.refunded ?? 0)))],
    ["调用次数", String(agg?.total ?? total)],
    ["实扣", fmtCny(quotaToUsd(agg?.spent ?? 0))],
    ["退回", fmtCny(quotaToUsd(agg?.refunded ?? 0))],
  ];
  return (
    <AccountDialog open={open} onOpenChange={onOpenChange} title="使用明细" description={name ? `密钥 ${name} 的调用记录` : "调用记录"} className="w-[min(calc(100%-32px),600px)]">
      <div className="pt-[17.6px]">
        <div className="flex flex-wrap items-center gap-[8px]">
          <PillSelect value={range} options={RANGE} onChange={setRange} ariaLabel="时间段" className={cn(accountPillCls, "px-[11px] text-[13.2px] leading-[17.6px]")} />
          {range === "custom" && <>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="开始日期" className={dateInputCls} />
            <span className="text-[11.5px] text-muted-foreground">至</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="结束日期" className={dateInputCls} />
          </>}
          <div className="relative min-w-[150px] flex-1"><Search className="pointer-events-none absolute left-[10px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" /><input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="全部模型" aria-label="按模型筛选" className={cn(accountPillCls, "w-full py-[7px] pl-[30px] pr-[11px]")} /></div>
          <button type="button" onClick={exportCsv} disabled={!items.length} className={cn(accountPillCls, "inline-flex items-center gap-[6px] bg-transparent px-[11px] py-[7px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40")}><Download className="h-[15px] w-[15px]" />导出</button>
        </div>
        <dl className="mt-[13px] grid grid-cols-2 gap-px overflow-hidden rounded-[10px] bg-foreground/[0.06] sm:grid-cols-4">
          {stats.map(([k, v]) => <div key={k} className="bg-card px-[11px] py-[10px]"><dt className="text-[10.5px] font-medium leading-[16.8px] text-muted-foreground">{k}</dt><dd className="mt-[3px] font-mono text-[15px] font-[640] leading-[24px]">{v}</dd></div>)}
        </dl>
        <div className="mt-[6px] flex items-center gap-[6px] text-[11px] font-medium leading-[17.6px] text-muted-foreground"><Info className="h-[13px] w-[13px] shrink-0" /><span>算力使用量 = 实扣 − 退回{agg?.truncated ? `；本时间段记录较多，汇总只统计最近 ${AGG_PAGE * AGG_MAX_PAGES} 条` : ""}</span></div>
        <h3 className="mb-[4px] mt-[14px] text-[13.2px] font-semibold leading-[17.6px] text-muted-foreground">调用记录</h3>
        <div>
          {isLoading && <Empty>加载中…</Empty>}
          {!isLoading && isError && <Empty>加载失败{error?.message ? `：${error.message}` : ""}</Empty>}
          {!isLoading && !isError && items.length === 0 && <Empty>该时间段内没有调用记录</Empty>}
          {!isLoading && !isError && items.map((i) => { const k = kindOf(i.model_name); const I = KIND_ICON[k]; let other: Record<string, unknown> = {}; try { other = i.other ? JSON.parse(i.other) : {}; } catch {} const lane = (i.group && i.group !== "default") ? i.group : (other.group as string) || "auto"; return (
            <div key={i.id} className="flex items-start justify-between gap-[12px] border-b border-border/60 py-[11px] last:border-0">
              <div className="min-w-0"><div className="flex items-center gap-[8px] font-mono text-[13.2px]"><I className="h-[15px] w-[15px] shrink-0 text-muted-foreground" /><span className="truncate">{i.model_name || "系统"}</span>{lane !== "auto" && <span className="text-muted-foreground">· {lane}</span>}</div>
                <div className="mt-[4px] flex flex-wrap items-center gap-[6px] text-[11px] text-muted-foreground"><span className="rounded-[4px] bg-primary/10 px-[6px] py-px text-primary">{KIND_LABEL[k]}</span><span>· {ts(i.created_at)}</span>{i.prompt_tokens > 0 && <span>· {i.prompt_tokens} → {i.completion_tokens} tokens</span>}{i.use_time ? <span>· {i.use_time}s</span> : null}</div></div>
              <div className="flex shrink-0 items-center gap-[8px]"><span className="font-mono text-[13.2px]">-{fmtCny(Math.abs(quotaToUsd(i.quota)))}</span><span className={cn("rounded-full px-[8px] py-px text-[10.5px]", i.quota < 0 ? "bg-warning/15 text-warning" : "bg-success/10 text-success")}>{i.quota < 0 ? "已退款" : "扣费成功"}</span></div>
            </div>
          ); })}
          {!isLoading && !isError && items.length > 0 && <div className="flex items-center justify-between pt-[8px] text-[11px] text-muted-foreground"><span>共 {total} 条 · 每页 {PAGE}</span><span className="flex items-center gap-[4px]"><button type="button" className={cn(accountPillCls, "grid w-[35px] place-items-center bg-transparent disabled:opacity-40")} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="上一页"><ChevronLeft className="h-[14px] w-[14px]" /></button><span>{page} / {pages}</span><button type="button" className={cn(accountPillCls, "grid w-[35px] place-items-center bg-transparent disabled:opacity-40")} disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="下一页"><ChevronRight className="h-[14px] w-[14px]" /></button></span></div>}
        </div>
      </div>
    </AccountDialog>
  );
}
