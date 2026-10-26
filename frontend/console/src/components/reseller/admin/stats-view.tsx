"use client";
/**
 * 平台管理 · 收益总览（管理员核心职责之一：每天用户跑了多少）
 *
 * 数据来自 GET /api/admin/stats/daily?days=N —— 网关同库聚合四条线：
 * 消耗（logs type=2）/ 在线充值（topups）/ 卡密核销（redemptions）/ 新增用户（users）。
 * 充值 + 卡密核销 = 真金白银的进账口径；消耗 = 平台成本口径（跑模型花了多少额度）。
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Coins, Download, RefreshCw, Ticket, TrendingUp, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { SectionHero } from "@/components/reseller/common";
import { ErrorBanner, Kpi } from "@/components/reseller/legacy/frame";
import { cn } from "@/lib/utils";

const btnCls = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-50";
const thCls = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground";
const tdCls = "px-3 py-2 align-middle text-[13px] text-foreground/90";
const rowCls = "border-t border-border/40 hover:bg-muted/40";

type DayRow = { day: string; consumeCny: number; requests: number; topupCny: number; topupCount: number; redeemedCny: number; redeemedCount: number; newUsers: number; poolConsume?: number };
type StatsResp = { today: string; days: DayRow[]; totals: Omit<DayRow, "day"> };
const RANGES = [7, 30, 90];
const money = (n: number) => `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DailyStatsView() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["admin-stats", days], queryFn: () => api<StatsResp>(`/api/admin/stats/daily?days=${days}`) });
  const list = q.data?.days ?? [];
  const totals = q.data?.totals;
  const today = list[0];

  const maxConsume = Math.max(...list.map((r) => r.consumeCny), 0.01);
  /** 走势图用时间正序；表格用倒序（最新在上） */
  const asc = [...list].reverse();
  const exportCsv = () => {
    const head = "日期,用户消耗(元),池垫付(元),请求数,充值(元),充值笔数,卡密核销(元),核销张数,新增用户";
    const lines = asc.map((r) => [r.day, r.consumeCny.toFixed(2), (r.poolConsume ?? 0).toFixed(2), r.requests, r.topupCny.toFixed(2), r.topupCount, r.redeemedCny.toFixed(2), r.redeemedCount, r.newUsers].join(","));
    const blob = new Blob(["\uFEFF" + [head, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `收益总览-近${days}天-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="平台管理" icon={<TrendingUp />} title="收益总览" subtitle="每天用户跑了多少：消耗（成本口径）、在线充值 + 卡密核销（进账口径）、新增用户，全部来自网关真源" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {RANGES.map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)}
                className={cn("rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                近 {d} 天
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={btnCls} onClick={exportCsv} disabled={!list.length}><Download size={13} />导出 CSV</button>
            <button type="button" className={btnCls} onClick={() => q.refetch()}><RefreshCw size={13} />刷新</button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label={`区间消耗（含今日）`} value={money(totals?.consumeCny ?? 0)} icon={<Coins size={14} />} />
          <Kpi label="区间充值进账" value={money(totals?.topupCny ?? 0)} accent icon={<TrendingUp size={14} />} />
          <Kpi label="区间卡密核销" value={money(totals?.redeemedCny ?? 0)} icon={<Ticket size={14} />} />
          <Kpi label="区间新增用户" value={totals?.newUsers ?? 0} icon={<UserPlus size={14} />} />
        </div>

        {q.isError ? <ErrorBanner error={q.error} suffix="收益统计加载失败" onRetry={() => q.refetch()} /> : null}

        {/* 每日消耗走势：纯 CSS 柱状，无图表库依赖 */}
        <div className="rounded-2xl border border-border/50 bg-muted/35 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">每日消耗走势</div>
            {today ? <div className="text-xs text-muted-foreground">今日（{today.day}）消耗 <b className="tabular-nums text-foreground">{money(today.consumeCny)}</b> · {today.requests} 次请求</div> : null}
          </div>
          {q.isLoading ? <div className="mt-4 h-36 rounded-xl shimmer" /> : (
            <div className="mt-4 flex h-36 items-end gap-[3px]">
              {asc.map((r) => (
                <div key={r.day} className="group relative flex h-full flex-1 items-end" title={`${r.day}：消耗 ${money(r.consumeCny)} · 充值 ${money(r.topupCny)} · 核销 ${money(r.redeemedCny)}`}>
                  <div className="w-full rounded-t-[3px] bg-primary/75 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(2, (r.consumeCny / maxConsume) * 100)}%` }} />
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{asc[0]?.day ?? ""}</span><span>{asc[asc.length - 1]?.day ?? ""}</span></div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/50 bg-muted/35">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead><tr className="bg-muted/50">
                <th className={thCls}>日期</th><th className={thCls}>用户消耗</th><th className={thCls}>池垫付</th><th className={thCls}>请求数</th>
                <th className={thCls}>充值进账</th><th className={thCls}>充值笔数</th>
                <th className={thCls}>卡密核销</th><th className={thCls}>核销张数</th><th className={thCls}>新增用户</th>
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.day} className={cn(rowCls, r.day === q.data?.today && "bg-primary/[0.04]")}>
                    <td className={cn(tdCls, "font-medium tabular-nums")}>{r.day}{r.day === q.data?.today ? <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">今天</span> : null}</td>
                    <td className={cn(tdCls, "tabular-nums")}>{money(r.consumeCny)}</td>
                    <td className={cn(tdCls, "tabular-nums text-muted-foreground")}>{r.poolConsume ? money(r.poolConsume) : "—"}</td>
                    <td className={cn(tdCls, "tabular-nums text-muted-foreground")}>{r.requests.toLocaleString()}</td>
                    <td className={cn(tdCls, "tabular-nums text-success")}>{r.topupCny > 0 ? money(r.topupCny) : "—"}</td>
                    <td className={cn(tdCls, "tabular-nums text-muted-foreground")}>{r.topupCount}</td>
                    <td className={cn(tdCls, "tabular-nums text-primary")}>{r.redeemedCny > 0 ? money(r.redeemedCny) : "—"}</td>
                    <td className={cn(tdCls, "tabular-nums text-muted-foreground")}>{r.redeemedCount}</td>
                    <td className={cn(tdCls, "tabular-nums text-muted-foreground")}>{r.newUsers ? <span className="inline-flex items-center gap-1"><Activity size={12} />{r.newUsers}</span> : "—"}</td>
                  </tr>
                ))}
                {!q.isLoading && !list.length ? (
                  <tr><td className={cn(tdCls, "py-10 text-center text-muted-foreground")} colSpan={9}>暂无数据（网关库未配置或还没有用量）</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">口径说明：「用户消耗」来自网关扣费流水（type=2）且**不含管理员账号**——管理员即平台积分池，其垫付成本单列「池垫付」；充值进账只算支付成功的订单；卡密核销按面额记入核销当日。单表结构异常时该列会显示为空，不影响其他列。</p>
      </div>
    </div>
  );
}
