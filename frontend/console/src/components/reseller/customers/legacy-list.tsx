"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, Crown, Search, TrendingUp, UserCheck, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fmtZap, dateCn, dateTimeShort } from "@/components/reseller/common";
import { Kpi, ErrorBanner, cardCls } from "@/components/reseller/legacy/frame";
import { CustomerDrawer } from "./detail";
import type { CustomerRow } from "./customers";

interface ListData { items: CustomerRow[]; stats: { total: number; active: number; new30: number; consume: number }; leaderboard: { id: number; username: string; consume: number }[] }

const DAY = 86400000;
const pill = "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none";
const pillMuted = "border-border bg-muted text-muted-foreground";
const segBtn = (on: boolean) => cn("rounded-md px-2.5 py-1 text-xs font-medium tabular-nums outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary", on ? "bg-primary/[0.16] text-primary-strong" : "text-muted-foreground hover:text-foreground");
const chip = (on: boolean) => cn("rounded-lg border px-3 py-1.5 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary", on ? "border-primary/[0.46] bg-primary/[0.14] text-primary-strong" : "border-border text-muted-foreground hover:border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] hover:text-foreground");
const md = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
const zapS = (v: number) => `⚡${fmtZap(v)}`;

/** 客户增长：7 / 30 天按日（含今天共 N+1 柱），90 天按 10 日分组（余数并入最后一组） */
function buckets(joined: number[], win: 7 | 30 | 90) {
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = today - win * DAY; const size = win === 90 ? 10 : 1; const n = Math.floor((win + 1) / size);
  return Array.from({ length: n }, (_, i) => {
    const s = start + i * size * DAY; const e = i === n - 1 ? today + DAY : s + size * DAY;
    const label = size === 1 ? md(s) : `${md(s)}-${md(e - DAY)}`;
    return { key: s, label, v: joined.filter((t) => t >= s && t < e).length };
  });
}

function GrowthChart({ joined, total }: { joined: number[]; total: number }) {
  const [win, setWin] = useState<7 | 30 | 90>(30);
  const bs = useMemo(() => buckets(joined, win), [joined, win]);
  const max = Math.max(0, ...bs.map((b) => b.v)); const added = bs.reduce((s, b) => s + b.v, 0);
  const cols = { gridTemplateColumns: `repeat(${bs.length}, minmax(0, 1fr))` };
  return (
    <section className={cn(cardCls, "p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><UserPlus className="size-4 text-primary" />客户增长</h2>
          <p className="mt-1 text-xs text-muted-foreground">窗口内新增 {added} · 累计 {total}</p>
        </div>
        <div role="tablist" className="inline-flex rounded-lg border border-border p-0.5">
          {([7, 30, 90] as const).map((w) => <button key={w} type="button" role="tab" aria-selected={win === w} onClick={() => setWin(w)} className={segBtn(win === w)}>{w} 天</button>)}
        </div>
      </div>
      <div className="mt-5">
        <div className="grid gap-2">
          <div className="grid items-end gap-2" style={cols}>
            {bs.map((b, i) => {
              const last = i === bs.length - 1; const tip = `${b.label}: ${b.label} · 新增 ${b.v}`;
              return (
                <button key={b.key} type="button" aria-disabled="true" aria-label={tip} title={tip} className="group relative flex cursor-default flex-col items-center justify-end outline-none" style={{ height: 142 }}>
                  <span className={cn("w-full rounded-t-lg transition-[height,background-color] duration-200 motion-reduce:transition-none", last ? "bg-primary-strong" : "bg-[color-mix(in_srgb,var(--primary)_38%,var(--border))] group-hover:bg-[color-mix(in_srgb,var(--primary)_58%,transparent)]")} style={{ height: `${max > 0 ? Math.max(4, (b.v / max) * 100) : 4}%` }} />
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 text-center text-[11px] text-muted-foreground" style={cols}>{bs.map((b) => <span key={b.key} className="truncate">{b.label}</span>)}</div>
        </div>
      </div>
    </section>
  );
}

function DashedEmpty({ title, desc }: { title: string; desc: string }) {
  return (
    <section className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background/30 px-6 py-14 text-center">
      <Users aria-hidden className="size-9 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{desc}</p>
    </section>
  );
}

/** 旧版菜单「客户列表」：KPI / 客户增长 / 筛选 + 搜索 + 创建用户 / 客户表格 / 消费排行 Top + 近期充值 */
export function LegacyCustomerList() {
  const q = useQuery({ queryKey: ["reseller", "customers-list"], queryFn: () => api<ListData>("/api/reseller/customers"), staleTime: 15_000 });
  const [kind, setKind] = useState<"all" | "user" | "agent" | "team">("all");
  const [act, setAct] = useState<"all" | "online" | "sleep">("all");
  const [kw, setKw] = useState(""); const [open, setOpen] = useState<number | null>(null);
  const all = useMemo(() => q.data?.items ?? [], [q.data]);
  const items = useMemo(() => {
    const k = kw.trim().toLowerCase().replace(/^#/, "");
    return all.filter((c) => (kind === "all" || c.kind === kind) && (act === "all" || (act === "online" ? c.online : c.sleeping)) && (!k || String(c.id) === k || c.username.toLowerCase().includes(k) || c.displayName.toLowerCase().includes(k) || c.email.toLowerCase().includes(k)));
  }, [all, kind, act, kw]);
  const joined = useMemo(() => all.map((c) => c.joinedAt), [all]);
  const s = q.data?.stats; const board = (q.data?.leaderboard ?? []).slice(0, 10);

  return (
    <>
      <ErrorBanner error={q.error} onRetry={() => q.refetch()} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="客户总数" value={kind === "team" ? 0 : items.length} icon={<Users />} />
        <Kpi label="活跃客户" value={s?.active ?? 0} icon={<UserCheck />} />
        <Kpi label="近30天新增" value={s?.new30 ?? 0} icon={<UserPlus />} />
        <Kpi label="累计消费" value={zapS(s?.consume ?? 0)} icon={<Coins />} accent />
      </section>

      <GrowthChart joined={joined} total={s?.total ?? all.length} />

      <section className={cn(cardCls, "flex flex-wrap items-center gap-2 px-4 py-3")}>
        <div className="inline-flex flex-wrap gap-1">
          {([["all", "全部"], ["user", "用户"], ["agent", "代理"], ["team", "团队"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={chip(kind === v)}>{l}</button>)}
        </div>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <div className="inline-flex flex-wrap gap-1">
          {([["all", "全部状态"], ["online", "在线"], ["sleep", "沉睡"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={act === v} onClick={() => setAct(v)} className={chip(act === v)}>{l}</button>)}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <input type="search" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索昵称/用户号/手机号/邮箱" aria-label="搜索昵称/用户号/手机号/邮箱" className="h-9 w-[219px] min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50 md:text-sm" />
          <button type="button" aria-disabled="true" title="暂未开放" className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"><UserPlus className="h-4 w-4" />创建用户</button>
        </div>
      </section>

      {kind === "team" ? <DashedEmpty title="暂无团队" desc="创建团队并添加成员后，可在这里查看各账号的推广数据。" />
        : q.isLoading ? <div className="h-32 rounded-2xl shimmer" />
        : items.length === 0 ? <DashedEmpty title="暂无客户" desc="调整筛选条件, 或通过邀请链接拓展客户。" />
        : (
          <div className={cn(cardCls, "overflow-hidden")}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead><tr className="border-b border-border text-left">{["客户", "角色", "余额", "累计消费", "状态", "加入", "最近活跃"].map((h, i) => <th key={h} className={cn("px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground", (i === 2 || i === 3) && "text-right")}>{h}</th>)}</tr></thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} tabIndex={0} onClick={() => setOpen(c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(c.id); } }} className="cursor-pointer border-b border-border/60 outline-none transition-colors duration-150 last:border-b-0 hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm text-muted-foreground">{(c.displayName || c.username || "?").slice(0, 1).toUpperCase()}</span>
                            <div className="min-w-0 leading-tight">
                              <div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground"><span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">#{c.id}</span><span aria-hidden className="shrink-0 text-muted-foreground/50">·</span><span className="truncate">{c.username}</span></div>
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.email || "—"}</div>
                            </div>
                          </div>
                          <div className="mt-1"><span className={cn(pill, pillMuted)}>直接注册</span></div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className={cn(pill, pillMuted)}>{c.kind === "agent" ? "代理" : "用户"}</span></td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">{zapS(c.balance)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">{zapS(c.consume)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {c.active ? <span className={cn(pill, "border-success/[0.38] bg-success/[0.14] text-success")}>活跃</span> : <span className={cn(pill, pillMuted)}>沉睡</span>}
                          {c.isNew && <span className={cn(pill, "border-primary/[0.38] bg-primary/[0.14] text-primary-strong")}>新客户</span>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateCn(c.joinedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateTimeShort(c.activeAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      <section className="grid gap-4 lg:grid-cols-2">
        <section className={cn(cardCls, "p-5")}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Crown className="size-4 text-primary" />消费排行 Top</h2>
          {board.length ? (
            <ol className="mt-4 grid gap-1.5">
              {board.map((c, i) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setOpen(c.id)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2 text-left outline-none transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/[0.18] text-xs font-semibold tabular-nums text-primary-strong">{i + 1}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{c.username}</p><p className="truncate text-[11px] tabular-nums text-muted-foreground">#{c.id}</p></div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{zapS(c.consume)}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="mt-4 rounded-xl border border-dashed border-border bg-background/30 px-3 py-6 text-center text-xs text-muted-foreground">{q.isLoading ? "加载中…" : "暂无消费记录"}</p>}
        </section>
        <section className={cn(cardCls, "p-5")}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><TrendingUp className="size-4 text-primary" />近期充值</h2>
          <p className="mt-4 rounded-xl border border-dashed border-border bg-background/30 px-3 py-6 text-center text-xs text-muted-foreground">暂无充值记录</p>
        </section>
      </section>

      <CustomerDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
