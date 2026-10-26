"use client";
// 消费记录：对接 new-api /api/log/self（使用消费 / 钱花在哪 / 充值支付），外观与参考站一致
import { useEffect, useMemo, useState } from "react";
import {type DailySpend,checkDailySpendReminder} from '../../../../../src/utils/dailySpend';
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, Info, MessageSquare, Music, Search, Video } from "lucide-react";
import { PillSelect } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useSelf } from "@/lib/queries";
import { cn, quotaToUsd, fmtPoints, yuanToPoints } from "@/lib/utils";
import { AccountDialog, AccountTabs, accountPillCls } from "./account-dialog-shell";
import { usageTitle, usageState, usageSign, usageCsvCell, type UsageSource } from "@/lib/usage-record";

export interface LogItem { id: number; type: number; model_name: string; quota: number; prompt_tokens: number; completion_tokens: number; created_at: number; use_time?: number; is_stream?: boolean; other?: string; content?: string; token_name?: string; group?: string; channel_name?: string; xoi_source?: UsageSource }
const TABS = [["usage", "使用消费"], ["where", "钱花在哪"], ["topup", "充值支付"]] as const;
const RANGE = [{ value: "7", label: "近7天" }, { value: "30", label: "近30天" }, { value: "90", label: "近90天" }, { value: "0", label: "全部" }];
const STATUS = [{ value: "all", label: "全部状态" }, { value: "ok", label: "已记账" }, { value: "refund", label: "退款" }];
const KIND = [["all", "全部"], ["chat", "聊天"], ["image", "图片"], ["video", "视频"], ["audio", "音频"]] as const;
type Kind = (typeof KIND)[number][0];
export function kindOf(m: string): "chat" | "image" | "video" | "audio" { return /tts|speech|voice|music|audio/i.test(m) ? "audio" : /image|flux|mj|seedream|face-repaint/i.test(m) ? "image" : /video|seedance|kling|veo|sora|wan|vidu|pixverse|happyhorse|omni|hailuo|minimax-h3|jimeng/i.test(m) ? "video" : "chat"; }
export const KIND_ICON = { chat: MessageSquare, image: ImageIcon, video: Video, audio: Music };
export const KIND_LABEL = { chat: "聊天", image: "图片", video: "视频", audio: "音频" };
// A text Agent can invoke image/video tools; workflow kind is not call modality.
function recordKind(i: LogItem) { return kindOf(i.model_name); }
export function ts(t: number) { const d = new Date(t * 1000); return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
const Empty = ({ children }: { children: React.ReactNode }) => <div className="px-[13.2px] py-[44px] text-center text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">{children}</div>;
function UsageRow({ item: i }: { item: LogItem }) {
  const k = recordKind(i);
  const Icon = KIND_ICON[k];
  return <details data-usage-record={i.id} className="group border-b border-border/60 last:border-0">
    <summary className="flex cursor-pointer list-none items-start justify-between gap-[12px] rounded-[8px] px-[4px] py-[16px] transition-colors hover:bg-foreground/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
      <div className="flex min-w-0 items-start gap-[10px]">
        <span className="mt-[1px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-foreground/[0.035] text-muted-foreground"><Icon className="h-[15px] w-[15px]" /></span>
        <div className="min-w-0"><div className="truncate text-[13px] font-semibold">{usageTitle(i)}</div>
          <div className="mt-[5px] flex flex-wrap gap-x-[8px] gap-y-[3px] text-[11px] text-muted-foreground"><span className="max-w-[230px] truncate">{i.model_name || "积分账户"}</span><time>{ts(i.created_at)}</time></div>
        </div>
      </div>
      <div className="flex shrink-0 items-start gap-[9px] text-right"><div><div className="font-mono text-[13px] font-semibold">{usageSign(i)}{fmtPoints(Math.abs(quotaToUsd(i.quota)))}</div><div className={cn("mt-[5px] text-[10.5px]", i.quota === 0 ? "text-muted-foreground" : i.quota < 0 || i.type === 1 ? "text-success" : "text-primary")}>{usageState(i)}</div></div><ChevronRight className="mt-[2px] h-[13px] w-[13px] text-muted-foreground transition-transform group-open:rotate-90" /></div>
    </summary>
    <div className="mb-[12px] ml-[44px] rounded-[9px] bg-foreground/[0.025] px-[12px] py-[10px] text-[11px] leading-[1.8] text-muted-foreground">
      <div>列表序号 #{i.id} · {KIND_LABEL[k]}{i.use_time ? ` · 耗时 ${i.use_time} 秒` : ""}</div>
      <div className="break-all">模型：{i.model_name || "—"}</div>
      {i.type !== 1 && <div>输入 {i.prompt_tokens || 0} / 输出 {i.completion_tokens || 0} Tokens</div>}
      {i.xoi_source?.status === "recorded" && i.xoi_source.billingId && <div className="break-all">本轮调用编号：{i.xoi_source.billingId}</div>}
      {i.type !== 1 && i.xoi_source?.status !== "recorded" && <p className="mt-[5px]">{i.xoi_source?.status === "unavailable" ? "功能来源暂时无法核对，请稍后刷新；积分记录不受影响。" : "该记录没有可核验的功能关联，不按模型或时间猜测来源。"}</p>}
      <p className="mt-[5px]">{i.quota === 0 ? "本条实际扣除为 0，不代表其他模型或后续调用免费。" : "按实际用量记账，1 元 = 10 积分。本条记录不代表整项任务已完成。"}</p>
    </div>
  </details>;
}

/** 用户菜单 → 消费记录 */
export function UsageDialog({ open, onOpenChange, overlayClassName, contentClassName, transparentShell = false }: { open: boolean; onOpenChange: (v: boolean) => void; overlayClassName?: string; contentClassName?: string; transparentShell?: boolean }) {
  const { data: self } = useSelf(open);
  // /api/login/self 只返回余额；累计消费必须从 NewAPI 用户资料读取，缺失时显示「—」。
  const { data: detailedSelf } = useQuery({
    queryKey: ["usage-self"],
    enabled: open,
    queryFn: () => api<{ quota?: number; used_quota?: number }>("/api/user/self"),
  });
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("usage"); const [kind, setKind] = useState<Kind>("all"); const [range, setRange] = useState("7"); const [status, setStatus] = useState("all"); const [q, setQ] = useState("");
  // 任一筛选条件变化都回到第 1 页：把页码和当时的筛选条件绑在一起存，条件变了页码自然失效（不用 effect，省一轮级联渲染）
  const filterKey = [kind, range, q, tab, status].join("\u0000"); const [pg, setPg] = useState({ key: filterKey, page: 1 });
  const page = pg.key === filterKey ? pg.page : 1; const setPage = (n: number) => setPg({ key: filterKey, page: n });
  // XOi 的推理统一使用站点为当前用户签发的 NewAPI 令牌，不向浏览器暴露或枚举子令牌。
  // 时间窗在发请求时才取当前时刻（渲染阶段不读时钟）
  const window_ = () => { const now = Math.floor(Date.now() / 1000); return { start: range === "0" ? 0 : now - Number(range) * 86400, end: now + 3600 }; };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["logs", tab, range, q, page], enabled: open,
    queryFn: async () => { const type = tab === "topup" ? 1 : 2; const { start, end } = window_(); const r = await api<{ items?: LogItem[]; total?: number } | LogItem[]>(`/api/log/self?p=${page}&page_size=20&type=${type}&token_name=&model_name=${encodeURIComponent(q.trim())}&start_timestamp=${start}&end_timestamp=${end}&group=`); return Array.isArray(r) ? { items: r, total: r.length } : { items: r.items ?? [], total: r.total ?? (r.items ?? []).length }; },
  });
  const { data: stat } = useQuery({ queryKey: ["logstat", range, q], enabled: open, queryFn: () => { const { start, end } = window_(); return api<{ quota: number; rpm?: number; tpm?: number }>(`/api/log/self/stat?type=2&model_name=${encodeURIComponent(q.trim())}&start_timestamp=${start}&end_timestamp=${end}`); } });
  const items = useMemo(() => (data?.items ?? []).filter((i) => (kind === "all" || recordKind(i) === kind) && (status === "all" || (status === "refund" ? i.quota < 0 : i.quota >= 0))), [data, kind, status]);
  const total = data?.total ?? 0; const pages = Math.max(1, Math.ceil(total / 20));
  const usedQuota = Number(detailedSelf?.used_quota);
  const hasUsed = detailedSelf?.used_quota != null && Number.isFinite(usedQuota);
  const used = hasUsed ? quotaToUsd(usedQuota) : NaN;
  const availableQuota = Number(detailedSelf?.quota ?? self?.quota);
  const avail = Number.isFinite(availableQuota) ? quotaToUsd(availableQuota) : NaN;
  const topped = hasUsed && Number.isFinite(avail) ? used + avail : NaN;
  const usedRatio = Number.isFinite(topped) && topped > 0 ? (used / topped) * 100 : 0;
  const availRatio = Number.isFinite(topped) && topped > 0 ? (avail / topped) * 100 : Number.isFinite(avail) ? 100 : 0;
  const byModel = useMemo(() => { const m = new Map<string, { n: number; quota: number }>(); for (const i of items) { const k = i.model_name || "其他"; const c = m.get(k) ?? { n: 0, quota: 0 }; c.n++; c.quota += i.quota; m.set(k, c); } return [...m.entries()].sort((a, b) => b[1].quota - a[1].quota); }, [items]);
  const byKind = useMemo(() => { const m: Record<string, number> = { chat: 0, image: 0, video: 0, audio: 0 }; for (const i of items) m[recordKind(i)] += i.quota; return m; }, [items]);
  const exportCsv = () => { const rows = [["记录ID", "时间", "功能来源", "本轮调用编号", "模型", "类型", "状态", "消耗(积分，负数为退款)", "输入tokens", "输出tokens"], ...items.map((i) => [i.id, new Date(i.created_at * 1000).toISOString(), usageTitle(i), i.xoi_source?.billingId || "", i.model_name, KIND_LABEL[kindOf(i.model_name)], usageState(i), yuanToPoints(quotaToUsd(i.quota)).toFixed(4), i.prompt_tokens, i.completion_tokens])]; const blob = new Blob(["﻿" + rows.map((r) => r.map(usageCsvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); const url = URL.createObjectURL(blob); a.href = url; a.download = `积分账单-第${page}页.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const refunds = (data?.items ?? []).filter((i) => i.quota < 0).length;
  // 充值支付 tab 的专属汇总（type=1 记录，quota 为到账积分）
  const topupRows = data?.items ?? [];
  const topupTotalPoints = topupRows.reduce((sum, i) => sum + Math.max(0, i.quota), 0);
  const topupCount = topupRows.length;
  const {data:daily,refetch:refreshDaily}=useQuery({queryKey:['daily-spend',self?.id],enabled:open,queryFn:()=>api<DailySpend>('/api/billing/preferences'),staleTime:15000});
  const [dailyAmount,setDailyAmount]=useState('20'),[savingDaily,setSavingDaily]=useState(false),[dailyMessage,setDailyMessage]=useState('');
  useEffect(()=>{if(daily)setDailyAmount(String(daily.dailyWarningYuan));},[daily?.dailyWarningYuan]);
  async function saveDaily(){const yuan=Number(dailyAmount);if(!Number.isFinite(yuan)||yuan<0||yuan>100000){setDailyMessage('请填写0–100000元');return;}setSavingDaily(true);try{await api('/api/billing/preferences',{method:'PUT',body:JSON.stringify({dailyWarningYuan:yuan})});await refreshDaily();setDailyMessage('已保存，仅提醒，不影响生成');void checkDailySpendReminder();}catch{setDailyMessage('保存失败，请重试；生成不受影响');}finally{setSavingDaily(false);}}
  return (
    <AccountDialog open={open} onOpenChange={onOpenChange} overlayClassName={overlayClassName} contentClassName={contentClassName} transparentShell={transparentShell} title="积分明细" description="查看积分到账与模型调用扣除记录" className="w-[min(calc(100%-32px),600px)]">
      <AccountTabs value={tab} options={TABS} onChange={setTab} inline />
      <div className="pt-[17.6px]">
        <section aria-label="当前可用" className="mb-[12px] rounded-[10px] border border-primary/22 bg-primary/7 px-[13px] py-[11px]">
          <div className="flex items-center gap-[7px]"><span className="font-mono text-[19px] font-[660] leading-[30.4px]">{fmtPoints(avail)}</span></div>
          <div role="presentation" className="mt-[11px] flex h-[9px] overflow-hidden rounded-full bg-foreground/10"><div className="bg-muted-foreground/50" style={{ width: `${usedRatio}%` }} /><div className="bg-primary" style={{ width: `${availRatio}%` }} /></div>
          <div className="mt-[8.8px] flex flex-wrap gap-x-[17.6px] gap-y-[4.4px] text-[11px] font-medium leading-[17.6px] text-muted-foreground">
            <span>累计获得 <span className="font-mono text-foreground">{fmtPoints(topped)}</span></span>
            <span className="flex items-center gap-[6.6px]"><i className="h-[9px] w-[9px] rounded-[2px] bg-muted-foreground/50" />累计消耗 <span className="font-mono">{fmtPoints(used)}</span></span>
            <span className="flex items-center gap-[6.6px]"><i className="h-[9px] w-[9px] rounded-[2px] bg-primary" />当前可用 <span className="font-mono">{fmtPoints(avail)}</span></span>
          </div>
          <div className="mt-[5px] flex items-center gap-[6px] text-[11px] font-medium leading-[17.6px] text-muted-foreground"><Info className="h-[13px] w-[13px] shrink-0" /><span>当前可用</span></div>
        </section>
        {tab === "usage" && <>
          <dl className="mb-[14px] grid grid-cols-2 gap-px overflow-hidden rounded-[10px] bg-foreground/[0.06]">
            {[["期间消耗", stat ? fmtPoints(quotaToUsd(stat.quota)) : "—"], ["期间记录", data ? String(total) : "—"], ["本页未扣积分", String((data?.items ?? []).filter(i => i.type === 2 && i.quota === 0).length)], ["本页退款", String(refunds)]].map(([k, v]) => <div key={k} className="bg-card px-[11px] py-[10px]"><dt className="text-[10.5px] font-medium leading-[16.8px] text-muted-foreground">{k}</dt><dd className="mt-[3px] font-mono text-[15px] font-[640] leading-[24px]">{v}</dd></div>)}
          </dl>
          <section aria-label="计费偏好" className="mb-[14px] rounded-[10px] border border-border/60 px-[13px] py-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-x-[12px] gap-y-[8px]">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold leading-[18px]">今日消费提醒</div>
                <p className="mt-[3px] text-[10.5px] leading-relaxed text-muted-foreground">达到设置金额时提醒一次，不暂停、不取消生成。每天按北京时间重新累计；0 表示关闭提醒。</p>
                <p className="mt-[3px] text-[10.5px] text-muted-foreground">今日已消费 {daily?`¥${daily.todayYuan.toFixed(2)}（${daily.todayPoints.toFixed(2)} 积分）`:'读取中…'} · 1 元 = 10 积分</p>
              </div>
              <div className="flex shrink-0 items-center gap-[6px]">
                <input type="number" min="0" max="100000" step="0.01" value={dailyAmount} onChange={(e) => setDailyAmount(e.target.value)} aria-label="今日消费提醒金额（元）" className={cn(accountPillCls, "w-[78px] px-[10px] py-[6px] text-right font-mono")} />
                <span className="text-[11px] text-muted-foreground">元</span>
                <button type="button" onClick={()=>void saveDaily()} disabled={savingDaily} className={cn(accountPillCls,'px-3 py-1.5 text-[11px]')}>{savingDaily?'保存中…':'保存'}</button>
              </div>
            </div>
            {dailyMessage&&<p className="mt-2 text-[11px] text-muted-foreground" role="status">{dailyMessage}</p>}
          </section>
          <AccountTabs value={kind} options={KIND} onChange={setKind} inline wrap={false} className="mb-[9px]" />
          <div className="flex flex-wrap items-center gap-[8px]">
            <PillSelect value={range} options={RANGE} onChange={setRange} className={cn(accountPillCls, "px-[11px] text-[13.2px] leading-[17.6px]")} />
            <PillSelect value={status} options={STATUS} onChange={setStatus} className={cn(accountPillCls, "px-[11px] text-[13.2px] leading-[17.6px]")} />
            <div className="relative min-w-[160px] flex-1"><Search className="pointer-events-none absolute left-[10px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="全部模型" aria-label="按模型筛选" className={cn(accountPillCls, "w-full py-[7px] pl-[30px] pr-[11px]")} /></div>
            <button type="button" onClick={exportCsv} disabled={!items.length} className={cn(accountPillCls, "inline-flex items-center gap-[6px] bg-transparent px-[11px] py-[7px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40")}><Download className="h-[15px] w-[15px]" />导出本页</button>
          </div>
          <p className="mt-[9px] text-[10.5px] leading-relaxed text-muted-foreground">点开记录查看用量明细。类型与状态筛选仅作用于当前页。</p>
        </>}
        {tab === "where" && <p className="mb-[9px] text-[10.5px] leading-relaxed text-muted-foreground">钱花在哪：把使用消费的记录按功能与模型聚合。统计范围同当前时间筛选，仅覆盖已加载的记录。</p>}
        {tab === "topup" && <>
          <dl className="mb-[14px] grid grid-cols-2 gap-px overflow-hidden rounded-[10px] bg-foreground/[0.06]">
            {[["期间到账", fmtPoints(quotaToUsd(topupTotalPoints))], ["期间笔数", String(topupCount)], ["记录类型", "充值 / 卡密兑换"], ["币值换算", "1 元 = 10 积分"]].map(([k, v]) => <div key={k} className="bg-card px-[11px] py-[10px]"><dt className="text-[10.5px] font-medium leading-[16.8px] text-muted-foreground">{k}</dt><dd className="mt-[3px] font-mono text-[15px] font-[640] leading-[24px]">{v}</dd></div>)}
          </dl>
          <div className="flex flex-wrap items-center gap-[8px]">
            <PillSelect value={range} options={RANGE} onChange={setRange} className={cn(accountPillCls, "px-[11px] text-[13.2px] leading-[17.6px]")} />
            <span className="text-[10.5px] text-muted-foreground">积分到账记录：管理员发放卡密后兑换到账，或充值支付成功后到账。</span>
          </div>
        </>}
        <div className="pt-[4.4px]">
          {isLoading && <Empty>加载中…</Empty>}
          {isError && <Empty>账单暂时加载失败，不代表没有消费。<button type="button" onClick={() => void refetch()} className="ml-[6px] text-primary">重新加载</button></Empty>}
          {!isLoading && !isError && tab === "where" && (
            <div className="space-y-[12px] pt-[12px]">
              <p className="text-[11px] text-muted-foreground">当前第 {page} 页汇总，非全量账单统计。</p>
              {Array.from(items.reduce((groups, item) => { const label = usageTitle(item); const entry = groups.get(label) || { count: 0, quota: 0 }; entry.count++; entry.quota += item.quota; groups.set(label, entry); return groups; }, new Map<string, { count: number; quota: number }>())).map(([label, entry]) => <div key={label} className="flex justify-between gap-[12px] border-b border-border/50 pb-[9px] text-[12px]"><span>{label}<span className="ml-[8px] text-muted-foreground">{entry.count} 次</span></span><span className="font-mono">{fmtPoints(quotaToUsd(entry.quota))}</span></div>)}
              <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-4">{(["chat", "image", "video", "audio"] as const).map((k) => { const I = KIND_ICON[k]; return <div key={k} className="rounded-[10px] border border-border/60 px-[11px] py-[10px]"><div className="flex items-center gap-[4px] text-[10.5px] text-muted-foreground"><I className="h-[12px] w-[12px]" />{KIND_LABEL[k]}</div><div className="mt-[3px] font-mono text-[15px] font-[640]">{fmtPoints(quotaToUsd(byKind[k]))}</div></div>; })}</div>
              {byModel.map(([m, c]) => <div key={m} className="flex items-center gap-[12px] text-[13.2px]"><span className="min-w-0 flex-1 truncate">{m}</span><span className="h-[8px] flex-1 overflow-hidden rounded-full bg-foreground/10"><span className="block h-full bg-primary" style={{ width: `${byModel[0]?.[1].quota > 0 ? Math.max(0, c.quota / byModel[0][1].quota * 100) : 0}%` }} /></span><span className="text-right font-mono">{fmtPoints(quotaToUsd(c.quota))}</span><span className="w-[44px] text-right text-[11px] text-muted-foreground">{c.n} 次</span></div>)}
              {byModel.length === 0 && <Empty>没有更多记录了</Empty>}
            </div>
          )}
          {!isLoading && !isError && tab !== "where" && <>
            {items.map((i) => <UsageRow key={i.id} item={i} />)}
            {page >= pages && <Empty>{items.length ? "没有更多记录了" : tab === "topup" ? "暂无充值记录" : "没有更多记录了"}</Empty>}
          </>}
          {pages > 1 && <div className="flex items-center justify-between pt-[8px] text-[11px] text-muted-foreground"><span>共 {total} 条 · 每页 20</span><span className="flex items-center gap-[4px]"><button type="button" className={cn(accountPillCls, "grid w-[35px] place-items-center bg-transparent disabled:opacity-40")} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="上一页"><ChevronLeft className="h-[14px] w-[14px]" /></button><span>{page} / {pages}</span><button type="button" className={cn(accountPillCls, "grid w-[35px] place-items-center bg-transparent disabled:opacity-40")} disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="下一页"><ChevronRight className="h-[14px] w-[14px]" /></button></span></div>}
        </div>
      </div>
      {/* 原先这里链到 console 里不存在的 /logs（点了被兜底路由弹回）。真实明细本弹窗已按页拉取，
          需要全量可继续点「加载更多」，不再放死链。 */}
    </AccountDialog>
  );
}
