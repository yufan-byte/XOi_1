"use client";
// 内容审核（站长）：用户提交上架的 Skill 在这里通过 / 驳回；已上架的也能下架。
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ShieldCheck, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type ServerSkill } from "@/lib/skills-client";

interface WorkRow { id: string; title: string; description: string; workType: string; category: string; coverUrl: string; coverKind: string; status: "pending" | "published" | "rejected"; author?: string; payload?: { node_count?: number } }
const W_LABEL: Record<WorkRow["status"], string> = { pending: "待审核", published: "已上架", rejected: "未通过" };
const TYPE_LABEL: Record<string, string> = { canvas: "无限画布", image: "图片", video: "视频" };

interface Resp { items: ServerSkill[]; canManage: boolean }
const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium transition-colors disabled:opacity-50";

export function SkillReview() {
  const qc = useQueryClient(); const [busy, setBusy] = useState<string | null>(null); const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["reseller", "skill-review"], queryFn: () => api<Resp>("/api/skills/review"), retry: false });
  const act = async (s: ServerSkill, action: "approve" | "reject" | "unlist") => {
    let note = "";
    if (action === "reject") { const r = window.prompt(`驳回「${s.name}」，原因（作者可见，可留空）：`); if (r === null) return; note = r; }
    if (action === "unlist" && !window.confirm(`把「${s.name}」从市场下架？作者仍然可以自己用。`)) return;
    setBusy(s.id);
    try { await api("/api/skills/review", { method: "POST", body: JSON.stringify({ id: s.id, action, note }) }); qc.invalidateQueries({ queryKey: ["reseller", "skill-review"] }); toast.success({ approve: "已上架", reject: "已驳回", unlist: "已下架" }[action]); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const items = data?.items ?? []; const can = !!data?.canManage;
  const pending = items.filter((x) => x.status === "pending").length;
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck size={16} className="text-primary" />Skill 审核{pending > 0 && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">{pending} 待审</span>}</h3>
        <span className="text-xs text-muted-foreground">Skill 市场只由站长发布；这里可以下架已上架的内容{!can && " · 只有站长可以操作"}</span>
      </div>
      <div className="mt-4 divide-y divide-border/50 rounded-lg border border-border/50">
        {isLoading && <div className="px-4 py-6 text-center text-sm text-muted-foreground">加载中…</div>}
        {error && <div className="px-4 py-6 text-center text-sm text-danger">{(error as Error).message}</div>}
        {!isLoading && !error && items.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">市场里还没有上架的 Skill</div>}
        {items.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="truncate hover:underline">{s.name}</button>
                  <span className={cn("rounded-full px-2 py-px text-[10.5px] font-semibold", s.status === "published" ? "bg-success/10 text-success" : "bg-warning/15 text-warning")}>{STATUS_LABEL[s.status]}</span>
                  {s.author && <span className="text-xs text-muted-foreground">@{s.author}</span>}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.description}</div>
              </div>
              {can && <div className="flex shrink-0 gap-1.5">
                {s.status !== "published" && <button type="button" disabled={!!busy} onClick={() => void act(s, "approve")} className={cn(btn, "border-primary bg-primary text-white hover:brightness-110")}><Check size={13} />通过</button>}
                {s.status === "pending" && <button type="button" disabled={!!busy} onClick={() => void act(s, "reject")} className={cn(btn, "hover:border-danger/50 hover:text-danger")}><X size={13} />驳回</button>}
                {s.status === "published" && <button type="button" disabled={!!busy} onClick={() => void act(s, "unlist")} className={cn(btn, "hover:border-danger/50 hover:text-danger")}><Undo2 size={13} />下架</button>}
              </div>}
            </div>
            {open === s.id && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-5">{s.body || "（没有正文）"}</pre>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** 灵感广场作品审核 */
export function WorkReview() {
  const qc = useQueryClient(); const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["reseller", "work-review"], queryFn: () => api<{ items: WorkRow[]; canManage: boolean }>("/api/works/review"), retry: false });
  const act = async (w: WorkRow, action: "approve" | "reject" | "unlist") => {
    let note = "";
    if (action === "reject") { const r = window.prompt(`驳回「${w.title}」，原因（作者可见，可留空）：`); if (r === null) return; note = r; }
    if (action === "unlist" && !window.confirm(`把「${w.title}」从广场下架？`)) return;
    setBusy(w.id);
    try { await api("/api/works/review", { method: "POST", body: JSON.stringify({ id: w.id, action, note }) }); qc.invalidateQueries({ queryKey: ["reseller", "work-review"] }); toast.success({ approve: "已上架", reject: "已驳回", unlist: "已下架" }[action]); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const items = data?.items ?? []; const can = !!data?.canManage; const pending = items.filter((x) => x.status === "pending").length;
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck size={16} className="text-primary" />灵感广场作品{pending > 0 && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">{pending} 待审</span>}</h3>
        <span className="text-xs text-muted-foreground">通过后所有人都能看到并复刻</span>
      </div>
      <div className="mt-4 divide-y divide-border/50 rounded-lg border border-border/50">
        {isLoading && <div className="px-4 py-6 text-center text-sm text-muted-foreground">加载中…</div>}
        {error && <div className="px-4 py-6 text-center text-sm text-danger">{(error as Error).message}</div>}
        {!isLoading && !error && items.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">还没有待审核的作品</div>}
        {items.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {w.coverUrl && (w.coverKind === "video"
                ? <video src={w.coverUrl} muted playsInline preload="metadata" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
                // eslint-disable-next-line @next/next/no-img-element -- 用户发布的任意站内/外链封面
                : <img src={w.coverUrl} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />)}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="truncate">{w.title}</span>
                  <span className={cn("rounded-full px-2 py-px text-[10.5px] font-semibold", w.status === "published" ? "bg-success/10 text-success" : "bg-warning/15 text-warning")}>{W_LABEL[w.status]}</span>
                  <span className="rounded-md border border-border/50 px-1.5 py-px text-[10.5px] text-muted-foreground">{TYPE_LABEL[w.workType] ?? w.workType}</span>
                  {w.author && <span className="text-xs text-muted-foreground">@{w.author}</span>}
                </div>
                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{w.description || "（没有简介）"}{w.payload?.node_count ? ` · ${w.payload.node_count} 个节点` : ""}</div>
              </div>
            </div>
            {can && <div className="flex shrink-0 gap-1.5">
              {w.status !== "published" && <button type="button" disabled={!!busy} onClick={() => void act(w, "approve")} className={cn(btn, "border-primary bg-primary text-white hover:brightness-110")}><Check size={13} />通过</button>}
              {w.status === "pending" && <button type="button" disabled={!!busy} onClick={() => void act(w, "reject")} className={cn(btn, "hover:border-danger/50 hover:text-danger")}><X size={13} />驳回</button>}
              {w.status === "published" && <button type="button" disabled={!!busy} onClick={() => void act(w, "unlist")} className={cn(btn, "hover:border-danger/50 hover:text-danger")}><Undo2 size={13} />下架</button>}
            </div>}
          </div>
        ))}
      </div>
    </section>
  );
}
