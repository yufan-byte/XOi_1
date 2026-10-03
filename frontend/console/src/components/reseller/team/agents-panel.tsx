"use client";
// 代理审核（站长）：普通用户在 /agent-apply 申请，站长在这里批准 / 驳回 / 冻结；提现申请也在这里登记打款结果。
// 代理是普通账号，只能看到自己的客户和收益（服务端按 lib/reseller/scope.ts 过滤），不再提升为网站管理员。
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Globe, RotateCcw, ShieldCheck, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = "pending" | "approved" | "rejected" | "frozen";
interface AgentRow { id: number; username: string; email: string; status: Status; inviteCode: string | null; domain: string | null; markupPct: number; customers: number; apply: { name?: string; contact?: string; reason?: string }; createdAt: number; reviewNote: string | null }
interface WRow { id: number; agentId: number; username: string; amount: number; account: { type?: string; note?: string }; status: "pending" | "paid" | "rejected"; note: string | null; createdAt: number }
interface Resp { agents: AgentRow[]; withdrawals: WRow[]; canManage: boolean; me: number }

const S_LABEL: Record<Status, [string, string]> = { pending: ["待审核", "bg-warning/15 text-warning"], approved: ["已批准", "bg-success/10 text-success"], rejected: ["已驳回", "bg-muted text-muted-foreground"], frozen: ["已冻结", "bg-danger/10 text-danger"] };
const W_LABEL: Record<WRow["status"], [string, string]> = { pending: ["待打款", "bg-warning/15 text-warning"], paid: ["已打款", "bg-success/10 text-success"], rejected: ["已驳回", "bg-muted text-muted-foreground"] };
const ACC: Record<string, string> = { alipay: "支付宝", wechat: "微信", bank: "银行卡" };
const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium transition-colors disabled:opacity-50";

export function AgentsPanel() {
  const qc = useQueryClient(); const [busy, setBusy] = useState<string | null>(null); const [tab, setTab] = useState<"agents" | "withdrawals">("agents");
  const { data, isLoading, error } = useQuery({ queryKey: ["reseller", "agents"], queryFn: () => api<Resp>("/api/reseller/agents"), retry: false });
  const post = async (key: string, body: object, ok: string) => {
    setBusy(key);
    try { await api("/api/reseller/agents", { method: "POST", body: JSON.stringify(body) }); toast.success(ok); qc.invalidateQueries({ queryKey: ["reseller", "agents"] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const review = (a: AgentRow, action: "approve" | "reject" | "freeze" | "unfreeze") => {
    const who = a.apply.name || a.username;
    let note = "";
    if (action === "reject") { const r = window.prompt(`驳回「${who}」的申请，原因（对方可见，可留空）：`); if (r === null) return; note = r; }
    if (action === "freeze" && !window.confirm(`冻结「${who}」？冻结后其客户按平台原价计费，对方不能调价、生成卡密和提现。`)) return;
    void post(`a${a.id}`, { kind: "agent", userId: a.id, action, note }, { approve: `已批准 ${who} 成为代理`, reject: "已驳回", freeze: "已冻结", unfreeze: "已解除冻结" }[action]);
  };
  // 分配专属域名：在该域名注册的新用户自动归到这个代理。DNS 要先解析到本服务器，证书由 Caddy 在第一次访问时自动签发。
  const assignDomain = (a: AgentRow) => {
    const who = a.apply.name || a.username;
    const r = window.prompt(`给「${who}」分配专属域名（如 abc.zwyq.ccdan.live，需先把 DNS 解析到本服务器）。\n留空并确定 = 收回域名；之前在该域名注册的客户仍归属不变。`, a.domain ?? "");
    if (r === null || r.trim() === (a.domain ?? "")) return;
    void post(`d${a.id}`, { kind: "domain", userId: a.id, domain: r.trim() }, r.trim() ? `已把 ${r.trim()} 分配给 ${who}` : `已收回 ${who} 的专属域名`);
  };
  const settle = (w: WRow, action: "paid" | "rejected") => {
    if (action === "paid" && !window.confirm(`确认已线下向 ${w.username} 打款 ¥${w.amount.toFixed(2)}？`)) return;
    let note = ""; if (action === "rejected") { const r = window.prompt("驳回原因（可留空）："); if (r === null) return; note = r; }
    void post(`w${w.id}`, { kind: "withdrawal", id: w.id, action, note }, action === "paid" ? "已登记打款" : "已驳回提现，金额退回对方可提余额");
  };
  const agents = data?.agents ?? []; const ws = data?.withdrawals ?? []; const can = !!data?.canManage;
  const pendingA = agents.filter((a) => a.status === "pending").length; const pendingW = ws.filter((w) => w.status === "pending").length;
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck size={16} className="text-primary" />代理审核</h3>
        <div role="tablist" className="flex gap-1 rounded-lg border p-0.5 text-xs">
          {([["agents", `代理 ${pendingA ? `（${pendingA} 待审）` : ""}`], ["withdrawals", `提现 ${pendingW ? `（${pendingW} 待处理）` : ""}`]] as const).map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={cn("h-7 rounded-md px-3", tab === v ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted")}>{l}</button>)}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">用户在「成为代理」页提交申请。批准后对方拿到专属邀请码，还可以给他分配专属域名（在该域名注册的新用户都归他）；代理只能看到自己的客户和收益，不会获得网站管理员权限。{!can && " 只有站长可以审核。"}</p>
      <div className="mt-4 divide-y divide-border/50 rounded-lg border border-border/50">
        {isLoading && <div className="px-4 py-6 text-center text-sm text-muted-foreground">加载中…</div>}
        {error && <div className="px-4 py-6 text-center text-sm text-danger">{(error as Error).message}</div>}
        {tab === "agents" && !isLoading && !error && agents.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">还没有人申请成为代理</div>}
        {tab === "agents" && agents.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="truncate">{a.apply.name || a.username}</span><span className={cn("rounded-full px-2 py-px text-[10.5px] font-semibold", S_LABEL[a.status][1])}>{S_LABEL[a.status][0]}</span>{a.inviteCode && <span className="font-mono text-[11px] text-muted-foreground">邀请码 {a.inviteCode}</span>}{a.domain && <a href={`https://${a.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"><Globe size={11} />{a.domain}</a>}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">ID {a.id} · {a.username}{a.email ? ` · ${a.email}` : ""} · 联系方式 {a.apply.contact || "—"}</div>
              {a.apply.reason && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">渠道：{a.apply.reason}</div>}
              {a.status !== "pending" && <div className="mt-0.5 text-xs text-muted-foreground">加价 {a.markupPct}% · 客户 {a.customers} 人{a.reviewNote ? ` · 备注：${a.reviewNote}` : ""}</div>}
            </div>
            {can && <div className="flex shrink-0 gap-1.5">
              {a.status === "pending" && <><button type="button" disabled={!!busy} onClick={() => review(a, "approve")} className={cn(btn, "border-primary bg-primary text-white hover:brightness-110")}><Check size={13} />批准</button><button type="button" disabled={!!busy} onClick={() => review(a, "reject")} className={cn(btn, "hover:border-danger/50 hover:text-danger")}><X size={13} />驳回</button></>}
              {(a.status === "approved" || a.status === "frozen") && <button type="button" disabled={!!busy} onClick={() => assignDomain(a)} className={cn(btn, "hover:border-primary/50 hover:text-primary")}><Globe size={13} />{a.domain ? "改域名" : "分配域名"}</button>}
              {a.status === "approved" && <button type="button" disabled={!!busy} onClick={() => review(a, "freeze")} className={cn(btn, "hover:border-danger/50 hover:text-danger")}><Ban size={13} />冻结</button>}
              {a.status === "frozen" && <button type="button" disabled={!!busy} onClick={() => review(a, "unfreeze")} className={cn(btn, "hover:border-primary/50 hover:text-primary")}><RotateCcw size={13} />解冻</button>}
            </div>}
          </div>
        ))}
        {tab === "withdrawals" && !isLoading && !error && ws.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">还没有提现申请</div>}
        {tab === "withdrawals" && ws.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><Wallet size={14} className="text-primary" /><span>{w.username}</span><span className="font-mono">¥{w.amount.toFixed(2)}</span><span className={cn("rounded-full px-2 py-px text-[10.5px] font-semibold", W_LABEL[w.status][1])}>{W_LABEL[w.status][0]}</span></div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleString("zh-CN")} · {ACC[w.account.type ?? ""] ?? w.account.type ?? "收款账号"}{w.account.note ? ` · ${w.account.note}` : ""}{w.note ? ` · ${w.note}` : ""}</div>
            </div>
            {can && w.status === "pending" && <div className="flex shrink-0 gap-1.5"><button type="button" disabled={!!busy} onClick={() => settle(w, "paid")} className={cn(btn, "border-primary bg-primary text-white hover:brightness-110")}><Check size={13} />已打款</button><button type="button" disabled={!!busy} onClick={() => settle(w, "rejected")} className={cn(btn, "hover:border-danger/50 hover:text-danger")}><X size={13} />驳回</button></div>}
          </div>
        ))}
      </div>
    </section>
  );
}
