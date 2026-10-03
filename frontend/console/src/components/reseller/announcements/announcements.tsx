"use client";
/**
 * 官方公告 —— **可编辑**（造物那边是只读静态 JSON，XOi 这里做成闭环）。
 *
 * 数据链路：控制台 PUT /api/admin/announcements → 后端写 backend/data/web/announcements.json
 *          → 主站（Vue）读 /announcements.json（同目录静态伺服）→ 最新一条 id 变化即亮未读红点。
 * 所以：保存后**不用重构建、不用重启**，用户刷新主站就能看到；红点也自然出现。
 *
 * 未读判定提醒：主站按「最新一条的 id ≠ localStorage 记录」判未读 —— 编辑既有公告请**保持 id 不变**，
 * 否则老公告会重新变未读（末尾 `id` 只读展示就是这个原因）。新建时后端自动生成 id。
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Megaphone, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SectionHero, VaultPanel } from "@/components/reseller/common";
import { ErrorBanner, EmptyPanel } from "@/components/reseller/legacy/frame";
import { cn } from "@/lib/utils";

type AnnType = "notice" | "update" | "maintenance";
type Ann = { id: string; title: string; content: string; type?: AnnType; published_at?: string };
type ListResp = { items: Ann[] };

const TYPES: Array<{ key: AnnType; label: string }> = [
  { key: "notice", label: "公告" },
  { key: "update", label: "更新" },
  { key: "maintenance", label: "维护" },
];
const typeLabel = (t?: string) => TYPES.find((x) => x.key === t)?.label ?? "公告";
const TYPE_TONE: Record<string, string> = {
  notice: "border-primary/40 bg-primary/10 text-primary",
  update: "border-emerald-500/35 bg-emerald-500/10 text-emerald-600",
  maintenance: "border-amber-500/35 bg-amber-500/10 text-amber-600",
};

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60";
const btnCls = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-50";

const today = () => new Date().toISOString().slice(0, 10);

export function AnnouncementsView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-announcements"], queryFn: () => api<ListResp>("/api/admin/announcements") });
  const [items, setItems] = useState<Ann[]>([]);
  const [draft, setDraft] = useState<Ann | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data?.items && !dirty) setItems(q.data.items);
  }, [q.data, dirty]);

  const save = useMutation({
    mutationFn: (list: Ann[]) => api<ListResp>("/api/admin/announcements", { method: "PUT", body: JSON.stringify({ items: list }) }),
    onSuccess: (res) => {
      toast.success("公告已保存，主站刷新即可看到（未读红点会自动亮起）");
      setItems(res.items ?? items);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: (e) => toast.error(`保存失败：${(e as Error).message}`),
  });

  const sorted = useMemo(
    () => [...items].sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? ""))),
    [items],
  );

  const commit = (list: Ann[]) => { setItems(list); setDirty(true); };

  const upsertDraft = () => {
    if (!draft) return;
    if (!draft.title.trim()) { toast.error("标题不能为空"); return; }
    const exists = items.some((i) => i.id === draft.id && draft.id);
    commit(exists ? items.map((i) => (i.id === draft.id ? draft : i)) : [...items, { ...draft, id: draft.id || "" }]);
    setDraft(null);
    toast.success(exists ? "已更新（记得点保存）" : "已加入列表（记得点保存）");
  };

  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero
        badge="官方公告"
        icon={<Megaphone />}
        title="官方公告"
        subtitle="面向用户与代理的站内公告：保存后主站「通知公告」即时可见"
        right={
          <div className="flex items-center gap-2">
            <button type="button" className={btnCls} onClick={() => setDraft({ id: "", title: "", content: "", type: "notice", published_at: today() })}>
              <Plus size={13} />新建公告
            </button>
            <button type="button" disabled={!dirty || save.isPending} className={cn(btnCls, "border-primary/60 bg-primary text-primary-foreground hover:bg-primary-strong")} onClick={() => save.mutate(items)}>
              {save.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{dirty ? "保存更改" : "已保存"}
            </button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-3 pb-24">
        {q.isError ? <ErrorBanner error={q.error} suffix="公告加载失败" onRetry={() => q.refetch()} /> : null}

        {draft ? (
          <VaultPanel title={draft.id ? "编辑公告" : "新建公告"} right={<button type="button" className={btnCls} onClick={() => setDraft(null)}><X size={13} />取消</button>}>
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_160px]">
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-muted-foreground">标题</span>
                  <input className={inputCls} maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如：v1.3 更新说明" />
                </label>
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-muted-foreground">类型</span>
                  <select className={inputCls} value={draft.type ?? "notice"} onChange={(e) => setDraft({ ...draft, type: e.target.value as AnnType })}>
                    {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-muted-foreground">发布日期</span>
                  <input type="date" className={inputCls} value={draft.published_at ?? ""} onChange={(e) => setDraft({ ...draft, published_at: e.target.value })} />
                </label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-muted-foreground">正文（支持换行，纯文本）</span>
                <textarea className={cn(inputCls, "min-h-[200px] resize-y leading-relaxed")} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="写点什么…" />
              </label>
              {draft.id ? <p className="text-[11px] text-muted-foreground">公告 id：<span className="font-mono">{draft.id}</span>（保持不变则老公告不会重新变未读）</p> : null}
              <div><button type="button" className={cn(btnCls, "border-primary/60 bg-primary text-primary-foreground hover:bg-primary-strong")} onClick={upsertDraft}><Save size={13} />{draft.id ? "更新到列表" : "加入列表"}</button></div>
            </div>
          </VaultPanel>
        ) : null}

        <VaultPanel title={`公告列表（${items.length}）`} right={dirty ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600"><AlertTriangle size={12} />有未保存的修改</span> : null}>
          {!sorted.length && !q.isLoading ? (
            <EmptyPanel icon={<Megaphone />} title="还没有公告" desc="点右上角「新建公告」写第一条，保存后主站通知红点会自动亮起。" />
          ) : (
            <ul className="flex flex-col gap-3">
              {sorted.map((a) => (
                <li key={a.id || a.title} className="rounded-xl border border-border/45 bg-muted/35 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", TYPE_TONE[a.type ?? "notice"] ?? TYPE_TONE.notice)}>{typeLabel(a.type)}</span>
                    <h3 className="text-sm font-bold text-foreground">{a.title}</h3>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{a.published_at || "—"}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <button type="button" className={btnCls} onClick={() => setDraft(a)}><Pencil size={12} />编辑</button>
                      <button type="button" className={cn(btnCls, "text-rose-600 hover:bg-rose-500/10")} onClick={() => { commit(items.filter((i) => i.id !== a.id)); toast.success("已移除（记得点保存）"); }}><Trash2 size={12} />删除</button>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{a.content.length > 220 ? `${a.content.slice(0, 220)}…` : a.content}</p>
                </li>
              ))}
            </ul>
          )}
        </VaultPanel>
      </div>
    </div>
  );
}
