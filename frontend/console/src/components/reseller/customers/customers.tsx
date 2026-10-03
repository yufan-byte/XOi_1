"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, TrendingUp, UserCheck, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useResellerScope } from "@/lib/reseller/client";
import { cn } from "@/lib/utils";
import { SectionHero, VaultPanel, fmtZap, dateCn, dateTimeShort } from "@/components/reseller/common";
import { CustomerDrawer } from "./detail";

export interface CustomerRow { id: number; username: string; displayName: string; email: string; role: number; kind: "user" | "agent"; balance: number; topup: number; consume: number; joinedAt: number; activeAt: number; active: boolean; online: boolean; sleeping: boolean; isNew: boolean; tags: string[]; note: string; /** 所属代理（站长视角才有意义）与来源 */ agentId?: number | null; source?: string | null }
const SOURCE_LABEL: Record<string, string> = { domain: "专属网址", invite: "邀请码", card: "卡密" };
interface ListData { items: CustomerRow[]; stats: { total: number; active: number; new30: number; consume: number }; leaderboard: { id: number; username: string; consume: number }[] }

const chipCls = (on: boolean, neutral = false) => cn("rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors duration-150", on ? (neutral ? "border-foreground/25 bg-card text-foreground" : "border-primary/30 bg-primary/10 text-primary") : "border-border/60 bg-card text-foreground hover:border-border/80");
const tagCls = "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]";

/** 我的客户：页头 / 统计条 / 消费排行榜 / 筛选 + 搜索 / 客户卡片 → 详情抽屉 */
export function CustomersView({ hero = true }: { hero?: boolean } = {}) {
  const scope = useResellerScope();
  const q = useQuery({ queryKey: ["reseller", "customers-list"], queryFn: () => api<ListData>("/api/reseller/customers"), staleTime: 15_000 });
  const [kind, setKind] = useState<"all" | "user" | "agent">("all"); const [act, setAct] = useState<"all" | "online" | "sleep">("all"); const [kw, setKw] = useState(""); const [open, setOpen] = useState<number | null>(null);
  const items = useMemo(() => {
    const k = kw.trim().toLowerCase().replace(/^#/, "");
    return (q.data?.items ?? []).filter((c) => (kind === "all" || c.kind === kind) && (act === "all" || (act === "online" ? c.online : c.sleeping)) && (!k || String(c.id) === k || c.username.toLowerCase().includes(k) || c.displayName.toLowerCase().includes(k) || c.email.toLowerCase().includes(k)));
  }, [q.data, kind, act, kw]);
  const s = q.data?.stats; const board = (q.data?.leaderboard ?? []).slice(0, 10);
  const stats = [[Users, "text-sky-500", "客户总数", String(s?.total ?? 0)], [UserCheck, "text-emerald-500", "活跃客户", String(s?.active ?? 0)], [UserPlus, "text-amber-500", "近30天新增", String(s?.new30 ?? 0)], [TrendingUp, "text-primary", "累计消费", `⚡${fmtZap(s?.consume ?? 0)}`]] as const;
  return (
    <div className="flex min-h-full flex-col gap-3">
      {hero && <SectionHero badge="客户运营" icon={<Users />} title="我的客户" subtitle="查看客户列表、注册时间、最近活跃和消费贡献。" />}
      <div className="flex flex-1 flex-col gap-3 pb-24">
        {q.isError && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{(q.error as Error).message} <button className="ml-2 text-primary underline" onClick={() => q.refetch()}>重试</button></div>}
        <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border/45 bg-card/40 px-5 py-3">
          {stats.map(([I, tone, k, v]) => <span key={k} className="inline-flex items-center gap-1.5 text-xs"><I size={14} className={tone} /><span className="font-semibold text-muted-foreground">{k}</span><span className="font-mono font-black tabular-nums text-foreground">{v}</span></span>)}
        </section>
        <VaultPanel title="消费排行榜">
          {board.length ? (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {board.map((c, i) => <button key={c.id} type="button" onClick={() => setOpen(c.id)} className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-left hover:border-border/80"><span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums", i < 3 ? "bg-amber-500/20 text-amber-500" : "bg-muted text-muted-foreground")}>{i + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.username}</span><span className="font-mono text-sm font-black tabular-nums text-foreground">⚡{fmtZap(c.consume)}</span></button>)}
            </div>
          ) : <div className="py-4 text-center text-xs text-muted-foreground">{q.isLoading ? "加载中…" : "暂无客户"}</div>}
        </VaultPanel>
        <VaultPanel>
          <div className="flex flex-wrap items-center gap-2">
            {([["all", "全部"], ["user", "用户"], ["agent", "代理"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={chipCls(kind === v)}>{l}</button>)}
            <span className="mx-2 h-4 w-px bg-border" aria-hidden />
            {([["all", "全部"], ["online", "在线"], ["sleep", "沉睡 >7d"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={act === v} onClick={() => setAct(v)} className={chipCls(act === v, true)}>{l}</button>)}
            <div className="ml-auto flex items-center gap-2"><Search size={16} className="text-muted-foreground" /><input type="search" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="按 #用户号、手机号、姓名或邮箱搜索" aria-label="按 #用户号、手机号、姓名或邮箱搜索" className="h-9 w-64 min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground hover:border-border focus-visible:border-primary/50" /></div>
          </div>
        </VaultPanel>
        {q.isLoading ? <div className="h-48 rounded-[22px] shimmer" /> : items.length === 0 ? (q.isError ? null : <div className="rounded-[16px] border border-border/50 py-12 text-center text-sm text-muted-foreground">暂无匹配客户</div>) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c) => (
              <button key={c.id} type="button" onClick={() => setOpen(c.id)} className="rounded-[22px] border border-border/55 bg-card p-4 text-left transition-colors hover:border-border/75 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{(c.displayName || c.username || "?").slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 leading-tight">
                      <div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground"><span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">#{c.id}</span><span aria-hidden className="shrink-0 text-muted-foreground/50">·</span><span className="truncate">{c.username}</span></div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.email || "—"}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    <span className={cn(tagCls, "border-primary/30 bg-primary/10 text-primary")}>{c.kind === "agent" ? "代理" : "用户"}</span>
                    {c.active ? <span className={cn(tagCls, "border-emerald-500/30 bg-emerald-500/10 text-emerald-600")}>活跃</span> : <span className={cn(tagCls, "border-border bg-muted text-muted-foreground")}>沉睡</span>}
                    {c.isNew && <span className={cn(tagCls, "border-amber-500/30 bg-amber-500/10 text-amber-500")}>新客户</span>}
                    {c.source && <span title={c.agentId ? `代理 #${c.agentId} 的客户` : undefined} className={cn(tagCls, "border-border bg-muted text-muted-foreground")}>{scope === "platform" && c.agentId ? `代理#${c.agentId} · ` : "来自"}{SOURCE_LABEL[c.source] ?? c.source}</span>}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">{([["当前余额", c.balance], ["累计充值", c.topup], ["累计消费", c.consume]] as const).map(([k, v]) => <div key={k} className="rounded-[14px] border border-border/45 bg-card px-2.5 py-2"><div className="truncate text-[10px] font-semibold text-muted-foreground">{k}</div><div className="mt-1 font-mono text-sm font-black tabular-nums text-foreground">⚡{fmtZap(v)}</div></div>)}</div>
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/35 pt-2.5 text-xs text-muted-foreground"><span>加入: <span className="text-foreground">{dateCn(c.joinedAt)}</span></span><span>最近活跃: <span className="text-foreground">{dateTimeShort(c.activeAt)}</span></span></div>
              </button>
            ))}
          </section>
        )}
      </div>
      <CustomerDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
