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
import { AlertTriangle, Link2, Loader2, Megaphone, PanelTop, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SectionHero, VaultPanel } from "@/components/reseller/common";
import { ErrorBanner, EmptyPanel } from "@/components/reseller/legacy/frame";
import { cn } from "@/lib/utils";

type AnnType = "notice" | "update" | "maintenance";
type Ann = { id: string; title: string; content: string; type?: AnnType; published_at?: string };
/** 全站顶部横幅：与公告同文件存储，enabled + 文案 + 按钮文案 + 跳转（站内路径或 https 外链，后端白名单校验） */
type SiteBanner = { id?: string; enabled: boolean; text: string; ctaLabel: string; link: string; theme: string };
type ListResp = { items: Ann[]; banner?: SiteBanner | null };

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
const emptyBanner = (): SiteBanner => ({ enabled: false, text: "", ctaLabel: "查看详情", link: "", theme: "brand" });

export function AnnouncementsView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-announcements"], queryFn: () => api<ListResp>("/api/admin/announcements") });
  const [items, setItems] = useState<Ann[]>([]);
  const [banner, setBanner] = useState<SiteBanner>(emptyBanner());
  const [draft, setDraft] = useState<Ann | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data && !dirty) {
      setItems(q.data.items ?? []);
      if (q.data.banner) setBanner({ ...emptyBanner(), ...q.data.banner });
    }
  }, [q.data, dirty]);

  const save = useMutation({
    mutationFn: (payload: { items: Ann[]; banner: SiteBanner }) =>
      api<ListResp>("/api/admin/announcements", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: (res) => {
      toast.success("已保存，主站刷新即可看到（未读红点/顶部横幅即时生效）");
      setItems(res.items ?? items);
      if (res.banner) setBanner({ ...emptyBanner(), ...res.banner });
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
            <button type="button" disabled={!dirty || save.isPending} className={cn(btnCls, "border-primary/60 bg-primary text-primary-foreground hover:bg-primary-strong")} onClick={() => save.mutate({ items, banner })}>
              {save.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{dirty ? "保存更改" : "已保存"}
            </button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-3 pb-24">
        {q.isError ? <ErrorBanner error={q.error} suffix="公告加载失败" onRetry={() => q.refetch()} /> : null}

        {/* 全站顶部横幅：开启后所有用户页面顶部出现，可跳转、可关闭（关闭按横幅 id 记忆） */}
        <VaultPanel title="全站顶部横幅" icon={<PanelTop />} right={<span className="text-[11px] text-muted-foreground">开启后所有用户页面顶部出现 · 关闭后按 id 记忆不再打扰</span>}>
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3 rounded-xl border border-border/45 bg-muted/35 p-3.5">
              <input type="checkbox" className="mt-0.5 size-4" checked={banner.enabled} onChange={(e) => { setBanner({ ...banner, enabled: e.target.checked }); setDirty(true); }} />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">启用横幅</span>
                <span className="text-xs text-muted-foreground">与公告列表独立：这里保存后立即在全站生效，关闭按钮只是用户本地不再显示。</span>
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_150px]">
              <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-muted-foreground">横幅文案（必填，≤120 字）</span>
                <input className={inputCls} maxLength={120} value={banner.text} onChange={(e) => { setBanner({ ...banner, text: e.target.value }); setDirty(true); }} placeholder="例如：新用户首充 ¥7 起，解锁全部热门模型！" />
              </label>
              <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-muted-foreground">按钮文案（≤12 字）</span>
                <input className={inputCls} maxLength={12} value={banner.ctaLabel} onChange={(e) => { setBanner({ ...banner, ctaLabel: e.target.value }); setDirty(true); }} placeholder="立即升级" />
              </label>
              <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-muted-foreground">配色</span>
                <select className={inputCls} value={banner.theme} onChange={(e) => { setBanner({ ...banner, theme: e.target.value }); setDirty(true); }}>
                  <option value="brand">品牌渐变（紫）</option>
                  <option value="dark">深夜黑</option>
                  <option value="green">翡翠绿</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Link2 size={12} />跳转链接（选填；站内路径以 / 开头如 /#/aiAssistant，或 https:// 外链，其余一律拒收）</span>
              <input className={cn(inputCls, "font-mono text-xs")} maxLength={300} value={banner.link} onChange={(e) => { setBanner({ ...banner, link: e.target.value }); setDirty(true); }} placeholder="/#/aiAssistant 或 https://example.com/promo" />
            </label>

            {/* 实时预览 */}
            <div>
              <div className={cn("mb-1 text-[11px] font-semibold text-muted-foreground")}>预览</div>
              <div className={cn("flex items-center justify-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium text-white",
                banner.theme === "dark" ? "bg-[#17181c]" : banner.theme === "green" ? "bg-gradient-to-r from-emerald-600 to-teal-500" : "bg-gradient-to-r from-indigo-500 to-violet-500")}>
                <span className="truncate">{banner.text || "（横幅文案显示在这里）"}</span>
                {banner.ctaLabel ? <span className="shrink-0 rounded-full bg-white/95 px-3 py-0.5 text-[12px] font-bold text-slate-900">{banner.ctaLabel}</span> : null}
              </div>
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">安全边界：后端只接受「/ 开头的站内路径」和「https:// 外链」两种跳转，javascript:/data: 等一律拒收；服务端也不会按这个链接回源请求，无 SSRF 面。</p>
          </div>
        </VaultPanel>

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
