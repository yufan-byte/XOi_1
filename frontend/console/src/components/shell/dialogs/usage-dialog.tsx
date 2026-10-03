"use client";
// 消费记录：对接 new-api /api/log/self（使用消费 / 钱花在哪 / 充值支付），外观与参考站一致
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, Info, MessageSquare, Music, Search, Video } from "lucide-react";
import { PillSelect } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useSelf } from "@/lib/queries";
import { cn, fmtCny as fmtCnyBase, quotaToUsd } from "@/lib/utils";
import { AccountDialog, AccountTabs, accountPillCls } from "./account-dialog-shell";
const fmtCny = (usd: number) => (usd > 0 && usd < 0.1 ? `¥${usd.toFixed(4)}` : fmtCnyBase(usd));

export interface LogItem { id: number; type: number; model_name: string; quota: number; prompt_tokens: number; completion_tokens: number; created_at: number; use_time?: number; is_stream?: boolean; other?: string; content?: string; token_name?: string; group?: string; channel_name?: string }
const TABS = [["usage", "使用消费"], ["where", "钱花在哪"], ["topup", "充值支付"]] as const;
const RANGE = [{ value: "7", label: "近7天" }, { value: "30", label: "近30天" }, { value: "90", label: "近90天" }, { value: "0", label: "全部" }];
const STATUS = [{ value: "all", label: "全部" }, { value: "ok", label: "成功" }, { value: "refund", label: "退款" }];
const KIND = [["all", "全部"], ["chat", "聊天"], ["image", "图片"], ["video", "视频"], ["audio", "音频"]] as const;
type Kind = (typeof KIND)[number][0];
export function kindOf(m: string): "chat" | "image" | "video" | "audio" { return /tts|speech|voice|music|audio/i.test(m) ? "audio" : /image|flux|mj|seedream|face-repaint/i.test(m) ? "image" : /video|seedance|kling|veo|sora|wan|vidu|pixverse|happyhorse|omni|hailuo|minimax-h3|jimeng/i.test(m) ? "video" : "chat"; }
export const KIND_ICON = { chat: MessageSquare, image: ImageIcon, video: Video, audio: Music };
export const KIND_LABEL = { chat: "聊天", image: "图片", video: "视频", audio: "音频" };
export function ts(t: number) { const d = new Date(t * 1000); return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
const Empty = ({ children }: { children: React.ReactNode }) => <div className="px-[13.2px] py-[44px] text-center text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">{children}</div>;

/** 用户菜单 → 消费记录 */
export function UsageDialog({ open, onOpenChange, overlayClassName, contentClassName }: { open: boolean; onOpenChange: (v: boolean) => void; overlayClassName?: string; contentClassName?: string }) {
  const { data: self } = useSelf(open);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("usage"); const [kind, setKind] = useState<Kind>("all"); const [range, setRange] = useState("7"); const [status, setStatus] = useState("all"); const [q, setQ] = useState("");
  // 任一筛选条件变化都回到第 1 页：把页码和当时的筛选条件绑在一起存，条件变了页码自然失效（不用 effect，省一轮级联渲染）
  const filterKey = [kind, range, q, tab, status].join("\u0000"); const [pg, setPg] = useState({ key: filterKey, page: 1 });
  const page = pg.key === filterKey ? pg.page : 1; const setPage = (n: number) => setPg({ key: filterKey, page: n });
  // XOi 的推理统一使用站点为当前用户签发的 NewAPI 令牌，不向浏览器暴露或枚举子令牌。
  // 时间窗在发请求时才取当前时刻（渲染阶段不读时钟）
  const window_ = () => { const now = Math.floor(Date.now() / 1000); return { start: range === "0" ? 0 : now - Number(range) * 86400, end: now + 3600 }; };
  const { data, isLoading } = useQuery({
    queryKey: ["logs", tab, range, q, page], enabled: open,
    queryFn: async () => { const type = tab === "topup" ? 1 : 2; const { start, end } = window_(); const r = await api<{ items?: LogItem[]; total?: number } | LogItem[]>(`/api/log/self?p=${page}&page_size=${tab === "where" ? 200 : 20}&type=${type}&token_name=&model_name=${encodeURIComponent(q.trim())}&start_timestamp=${start}&end_timestamp=${end}&group=`); return Array.isArray(r) ? { items: r, total: r.length } : { items: r.items ?? [], total: r.total ?? (r.items ?? []).length }; },
  });
  const { data: stat } = useQuery({ queryKey: ["logstat", range], enabled: open, queryFn: () => { const { start, end } = window_(); return api<{ quota: number; rpm?: number; tpm?: number }>(`/api/log/self/stat?type=0&token_name=&model_name=&start_timestamp=${start}&end_timestamp=${end}&group=`).catch(() => ({ quota: 0 })); } });
  const items = useMemo(() => (data?.items ?? []).filter((i) => (kind === "all" || kindOf(i.model_name) === kind) && (status === "all" || (status === "refund" ? i.quota < 0 : i.quota >= 0))), [data, kind, status]);
  const total = data?.total ?? 0; const pages = Math.max(1, Math.ceil(total / 20));
  const used = self ? quotaToUsd(self.used_quota) : 0; const avail = self ? quotaToUsd(self.quota) : 0; const topped = used + avail;
  const byModel = useMemo(() => { const m = new Map<string, { n: number; quota: number }>(); for (const i of data?.items ?? []) { const k = i.model_name || "其他"; const c = m.get(k) ?? { n: 0, quota: 0 }; c.n++; c.quota += i.quota; m.set(k, c); } return [...m.entries()].sort((a, b) => b[1].quota - a[1].quota); }, [data]);
  const byKind = useMemo(() => { const m: Record<string, number> = { chat: 0, image: 0, video: 0, audio: 0 }; for (const i of data?.items ?? []) m[kindOf(i.model_name)] += i.quota; return m; }, [data]);
  const exportCsv = () => { const rows = [["时间", "模型", "类型", "消耗(¥)", "输入tokens", "输出tokens"], ...(data?.items ?? []).map((i) => [ts(i.created_at), i.model_name, KIND_LABEL[kindOf(i.model_name)], quotaToUsd(i.quota).toFixed(4), i.prompt_tokens, i.completion_tokens])]; const blob = new Blob(["﻿" + rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "账单.csv"; a.click(); };
  const refunds = (data?.items ?? []).filter((i) => i.quota < 0).length;
  return (
    <AccountDialog open={open} onOpenChange={onOpenChange} overlayClassName={overlayClassName} contentClassName={contentClassName} title="消费记录" description="查看您的模型使用消费明细" className="w-[min(calc(100%-32px),600px)]">
      <AccountTabs value={tab} options={TABS} onChange={setTab} inline />
      <div className="pt-[17.6px]">
        <section aria-label="当前可用" className="mb-[12px] rounded-[10px] border border-primary/22 bg-primary/7 px-[13px] py-[11px]">
          <div className="flex items-center gap-[7px]"><span className="font-mono text-[19px] font-[660] leading-[30.4px]">{fmtCny(avail)}</span></div>
          <div role="presentation" className="mt-[11px] flex h-[9px] overflow-hidden rounded-full bg-foreground/10"><div className="bg-muted-foreground/50" style={{ width: `${topped ? (used / topped) * 100 : 0}%` }} /><div className="bg-primary" style={{ width: `${topped ? (avail / topped) * 100 : 0}%` }} /></div>
          <div className="mt-[8.8px] flex flex-wrap gap-x-[17.6px] gap-y-[4.4px] text-[11px] font-medium leading-[17.6px] text-muted-foreground">
            <span>总充值 <span className="font-mono text-foreground">{fmtCny(topped)}</span></span>
            <span className="flex items-center gap-[6.6px]"><i className="h-[9px] w-[9px] rounded-[2px] bg-muted-foreground/50" />总消耗 <span className="font-mono">{fmtCny(used)}</span></span>
            <span className="flex items-center gap-[6.6px]"><i className="h-[9px] w-[9px] rounded-[2px] bg-primary" />当前可用 <span className="font-mono">{fmtCny(avail)}</span></span>
          </div>
          <div className="mt-[5px] flex items-center gap-[6px] text-[11px] font-medium leading-[17.6px] text-muted-foreground"><Info className="h-[13px] w-[13px] shrink-0" /><span>当前可用</span></div>
        </section>
        <dl className="mb-[14px] grid grid-cols-2 gap-px overflow-hidden rounded-[10px] bg-foreground/[0.06] sm:grid-cols-4">
          {[["总消耗", fmtCny(quotaToUsd(stat?.quota ?? 0))], ["总次数", String(total)], ["成功", String((data?.items ?? []).length - refunds)], ["退款", String(refunds)]].map(([k, v]) => <div key={k} className="bg-card px-[11px] py-[10px]"><dt className="text-[10.5px] font-medium leading-[16.8px] text-muted-foreground">{k}</dt><dd className="mt-[3px] font-mono text-[15px] font-[640] leading-[24px]">{v}</dd></div>)}
        </dl>
        {tab !== "topup" && <AccountTabs value={kind} options={KIND} onChange={setKind} inline wrap={false} className="mb-[9px]" />}
        <div className="flex flex-wrap items-center gap-[8px]">
          <PillSelect value={range} options={RANGE} onChange={setRange} className={cn(accountPillCls, "px-[11px] text-[13.2px] leading-[17.6px]")} />
          <PillSelect value={status} options={STATUS} onChange={setStatus} className={cn(accountPillCls, "px-[11px] text-[13.2px] leading-[17.6px]")} />
          <div className="relative min-w-[160px] flex-1"><Search className="pointer-events-none absolute left-[10px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="全部模型" aria-label="按模型筛选" className={cn(accountPillCls, "w-full py-[7px] pl-[30px] pr-[11px]")} /></div>
          <button type="button" onClick={exportCsv} className={cn(accountPillCls, "inline-flex items-center gap-[6px] bg-transparent px-[11px] py-[7px] text-muted-foreground transition-colors hover:text-foreground")}><Download className="h-[15px] w-[15px]" />导出账单</button>
        </div>
        <div className="pt-[4.4px]">
          {isLoading && <Empty>加载中…</Empty>}
          {!isLoading && tab === "where" && (
            <div className="space-y-[12px] pt-[12px]">
              <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-4">{(["chat", "image", "video", "audio"] as const).map((k) => { const I = KIND_ICON[k]; return <div key={k} className="rounded-[10px] border border-border/60 px-[11px] py-[10px]"><div className="flex items-center gap-[4px] text-[10.5px] text-muted-foreground"><I className="h-[12px] w-[12px]" />{KIND_LABEL[k]}</div><div className="mt-[3px] font-mono text-[15px] font-[640]">{fmtCny(quotaToUsd(byKind[k]))}</div></div>; })}</div>
              {byModel.map(([m, c]) => <div key={m} className="flex items-center gap-[12px] text-[13.2px]"><span className="w-[180px] truncate font-mono">{m}</span><span className="h-[8px] flex-1 overflow-hidden rounded-full bg-foreground/10"><span className="block h-full bg-primary" style={{ width: `${byModel[0] ? (c.quota / byModel[0][1].quota) * 100 : 0}%` }} /></span><span className="w-[88px] text-right font-mono">{fmtCny(quotaToUsd(c.quota))}</span><span className="w-[44px] text-right text-[11px] text-muted-foreground">{c.n} 次</span></div>)}
              {byModel.length === 0 && <Empty>没有更多记录了</Empty>}
            </div>
          )}
          {!isLoading && tab !== "where" && <>
            {items.map((i) => { const k = kindOf(i.model_name); const I = KIND_ICON[k]; let other: Record<string, unknown> = {}; try { other = i.other ? JSON.parse(i.other) : {}; } catch {} const lane = (i.group && i.group !== "default") ? i.group : (other.group as string) || "auto"; return (
              <div key={i.id} className="flex items-start justify-between gap-[12px] border-b border-border/60 py-[11px] last:border-0">
                <div className="min-w-0"><div className="flex items-center gap-[8px] font-mono text-[13.2px]"><I className="h-[15px] w-[15px] shrink-0 text-muted-foreground" /><span className="truncate">{i.model_name || (i.type === 1 ? "充值" : "系统")}</span>{lane !== "auto" && <span className="text-muted-foreground">· {lane}</span>}</div>
                  <div className="mt-[4px] flex flex-wrap items-center gap-[6px] text-[11px] text-muted-foreground"><span className="rounded-[4px] bg-primary/10 px-[6px] py-px text-primary">{tab === "topup" ? "充值" : KIND_LABEL[k]}</span><span className="rounded-[4px] bg-primary/10 px-[6px] py-px text-primary">{lane === "auto" ? "稳定优先" : "指定渠道"}</span><span>· {ts(i.created_at)}</span>{i.prompt_tokens > 0 && <span>· {i.prompt_tokens} → {i.completion_tokens} tokens</span>}{i.use_time ? <span>· {i.use_time}s</span> : null}</div></div>
                <div className="flex shrink-0 items-center gap-[8px]"><span className={cn("font-mono text-[13.2px]", i.type === 1 && "text-success")}>{i.type === 1 ? "+" : "-"}{fmtCny(Math.abs(quotaToUsd(i.quota)))}</span><span className={cn("rounded-full px-[8px] py-px text-[10.5px]", i.quota < 0 ? "bg-warning/15 text-warning" : "bg-success/10 text-success")}>{i.type === 1 ? "已到账" : i.quota < 0 ? "已退款" : "扣费成功"}</span></div>
              </div>
            ); })}
            {page >= pages && <Empty>{items.length ? "没有更多记录了" : tab === "topup" ? "暂无充值记录" : "没有更多记录了"}</Empty>}
            {pages > 1 && <div className="flex items-center justify-between pt-[8px] text-[11px] text-muted-foreground"><span>共 {total} 条 · 每页 20</span><span className="flex items-center gap-[4px]"><button type="button" className={cn(accountPillCls, "grid w-[35px] place-items-center bg-transparent disabled:opacity-40")} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="上一页"><ChevronLeft className="h-[14px] w-[14px]" /></button><span>{page} / {pages}</span><button type="button" className={cn(accountPillCls, "grid w-[35px] place-items-center bg-transparent disabled:opacity-40")} disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="下一页"><ChevronRight className="h-[14px] w-[14px]" /></button></span></div>}
          </>}
        </div>
      </div>
      {/* 原先这里链到 console 里不存在的 /logs（点了被兜底路由弹回）。真实明细本弹窗已按页拉取，
          需要全量可继续点「加载更多」，不再放死链。 */}
    </AccountDialog>
  );
}
