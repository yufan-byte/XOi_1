"use client";
// API 密钥：对接 new-api /api/token/（列表 / 新建 / 编辑 / 明文 / 启停 / 删除），外观与参考站一致
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Pop from "@radix-ui/react-popover";
import { Ban, Check, Copy, KeyRound, ListOrdered, Loader2, Pencil, Play, Plug, Plus, RotateCw, Search, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, loadAuth } from "@/lib/api";
import { cn, QUOTA_PER_UNIT } from "@/lib/utils";
import { AccountDialog } from "./account-dialog-shell";
import { ApiKeyForm, type Token } from "./api-key-form";
import { TokenUsageDialog } from "./token-usage-dialog";
import { ClientSetupDialog } from "./client-setup-dialog";

type Status = "active" | "disabled" | "expired" | "exhausted";
type Filter = "all" | Status;
const FILTERS: [Filter, string][] = [["all", "全部"], ["active", "启用"], ["disabled", "禁用"], ["expired", "已过期"], ["exhausted", "已用尽"]];
const STATUS_LABEL: Record<Status, string> = { active: "启用", disabled: "禁用", expired: "已过期", exhausted: "已用尽" };
const STATUS_CLS: Record<Status, string> = { active: "bg-success/10 text-success", disabled: "bg-muted text-muted-foreground", expired: "bg-warning/15 text-warning", exhausted: "bg-danger/10 text-danger" };

const fmtDate = (s: number) => { const d = new Date(s * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmtYuan = (q: number) => `¥${(q / QUOTA_PER_UNIT).toFixed(2)}`;
const maskKey = (k: string) => `sk-${k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : k}`;
/** 后端只在部分场景写入 3/4，其余按过期时间和剩余额度在前端推导 */
const statusOf = (t: Token): Status => {
  if (t.status === 2) return "disabled";
  if (t.status === 3) return "expired";
  if (t.status === 4) return "exhausted";
  if (t.expired_time > 0 && t.expired_time * 1000 < Date.now()) return "expired";
  if (!t.unlimited_quota && t.remain_quota <= 0) return "exhausted";
  return "active";
};

/** 浏览器剪贴板异常不是给人看的，翻成可操作的中文提示 */
const copyErrMsg = (e: unknown) => {
  const { name, message } = (e ?? {}) as { name?: string; message?: string };
  if (name === "NotAllowedError" || name === "SecurityError") return "浏览器拒绝了复制操作，请点开密钥后手动复制";
  return message || "复制失败，请点开密钥后手动复制";
};

function Act({ label, icon: I, onClick, danger, disabled, spin, title }: { label: string; icon: typeof Copy; onClick: () => void; danger?: boolean; disabled?: boolean; spin?: boolean; title?: string }) {
  return <button type="button" title={title ?? label} aria-label={label} disabled={disabled} onClick={onClick} className={cn("inline-flex h-[28px] items-center gap-[4.4px] rounded-[4px] border border-border/60 px-[8.8px] text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50", danger && "text-danger")}><I className={cn("h-[13px] w-[13px]", spin && "animate-spin")} />{label}</button>;
}

/** 用户菜单 → API 密钥 */
export function ApiKeysDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState(""); const [filter, setFilter] = useState<Filter>("all");
  const [form, setForm] = useState<{ token: Token | null } | null>(null); const [usage, setUsage] = useState<Token | null>(null);
  const [revealed, setRevealed] = useState<Record<number, string>>({}); const [revealId, setRevealId] = useState<number | null>(null);
  const [setup, setSetup] = useState<Token | null>(null);   // 一键接入：把这把密钥配进 CC Switch 等客户端
  const [confirm, setConfirm] = useState<Token | null>(null); const [busy, setBusy] = useState<number | null>(null); const [copied, setCopied] = useState<number | null>(null);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["tokens"], enabled: open && !!loadAuth(), queryFn: async () => { const r = await api<{ items?: Token[] } | Token[] | null>("/api/token/?p=1&size=100"); return Array.isArray(r) ? r : (r?.items ?? []); } });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tokens"] });
  // 顶栏常驻挂载，弹窗关掉组件也不卸载：open 转 false 时在渲染阶段丢掉缓存的明文密钥（放 effect 里会触发级联渲染）
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (!open) { setRevealed({}); setRevealId(null); setCopied(null); } }
  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (data ?? []).map((t) => ({ t, status: statusOf(t) })).filter((x) => filter === "all" || x.status === filter)
      .filter((x) => !kw || x.t.name.toLowerCase().includes(kw) || x.t.key.toLowerCase().includes(kw));
  }, [data, filter, q]);
  const fetchKey = async (t: Token) => {
    if (revealed[t.id]) return revealed[t.id];
    const k = await api<string | { key?: string | null } | null>(`/api/token/${t.id}/key`, { method: "POST", body: "{}" });
    const raw = typeof k === "string" ? k : k?.key; // data 为 null / 缺 key 时别让 TypeError 的英文原文冒到中文 toast 里
    if (!raw) throw new Error("未能获取密钥明文，请稍后重试");
    const sk = raw.startsWith("sk-") ? raw : `sk-${raw}`;
    setRevealed((m) => ({ ...m, [t.id]: sk })); return sk;
  };
  /** 一次点击完成「取明文 + 复制」。Safari 只认与点击同一个任务里发起的写入，所以把网络请求塞进 ClipboardItem 的 promise，而不是 await 之后再 writeText */
  const copy = async (t: Token) => {
    setBusy(t.id);
    try {
      const cached = revealed[t.id];
      if (cached || typeof ClipboardItem === "undefined") await navigator.clipboard.writeText(cached ?? (await fetchKey(t)));
      else {
        const p = fetchKey(t);
        try { await navigator.clipboard.write([new ClipboardItem({ "text/plain": p.then((k) => new Blob([k], { type: "text/plain" })) })]); }
        catch { await navigator.clipboard.writeText(await p); } // 不接受 promise 形式的浏览器：退回 writeText（此时密钥已取回）
      }
      setCopied(t.id); setTimeout(() => setCopied((c) => (c === t.id ? null : c)), 1500);
    } catch (e) { toast.error(copyErrMsg(e)); } finally { setBusy(null); }
  };
  const openReveal = async (t: Token, v: boolean) => {
    setRevealId(v ? t.id : null); if (!v || revealed[t.id]) return;
    setBusy(t.id); try { await fetchKey(t); } catch (e) { toast.error((e as Error).message); setRevealId(null); } finally { setBusy(null); }
  };
  const toggle = async (t: Token, s: Status) => {
    const next = s === "disabled" ? 1 : 2; setBusy(t.id);
    try { await api("/api/token/?status_only=true", { method: "PUT", body: JSON.stringify({ id: t.id, status: next }) }); toast.success(next === 1 ? "密钥已启用" : "密钥已禁用"); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async (t: Token) => {
    setBusy(t.id);
    try { await api(`/api/token/${t.id}`, { method: "DELETE" }); setRevealed((m) => { const n = { ...m }; delete n[t.id]; return n; }); toast.success("密钥已删除"); setConfirm(null); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <AccountDialog open={open} onOpenChange={onOpenChange} title="API 密钥" description="创建、编辑和删除访问凭据" className="w-[min(calc(100%-2rem),680px)]">
      <div className="flex flex-wrap items-center gap-[8px] pt-[15px]">
        <div className="relative w-[131px] min-w-0 flex-1 sm:flex-none"><Search className="pointer-events-none absolute left-[10px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称或前缀" aria-label="搜索名称或前缀" className="h-[35px] w-full rounded-full border border-border bg-foreground/[0.03] py-[7px] pl-[30px] pr-[11px] text-[12px] font-medium leading-[19.2px] outline-none focus:ring-2 focus:ring-ring/30" /></div>
        <div role="tablist" className="flex h-[40px] gap-[2px] rounded-full border border-foreground/[0.06] bg-foreground/[0.06] p-[3px]">{FILTERS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn("flex h-[32px] items-center rounded-full px-[12px] py-[6px] text-[12.5px] font-[560] leading-5 transition-colors", filter === k ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,20,31,0.08)]" : "text-muted-foreground hover:text-foreground")}>{l}</button>)}</div>
        <button type="button" onClick={() => setForm({ token: null })} className="ml-auto inline-flex h-[31px] items-center gap-[6px] rounded-full border border-primary/55 bg-primary/88 px-[14px] py-[7px] text-[12px] font-semibold leading-[15px] text-white transition-[filter] hover:brightness-110"><Plus className="h-[15px] w-[15px]" />创建密钥</button>
      </div>
      <div className="pt-[13.2px]">
        {isLoading && <div className="flex flex-col items-center gap-[8.8px] px-[13.2px] py-[44px] text-[13.2px] text-muted-foreground">加载中...</div>}
        {!isLoading && isError && <div className="flex flex-col items-center gap-[8.8px] px-[13.2px] py-[44px] text-center text-muted-foreground">
          <TriangleAlert className="h-[26px] w-[26px] text-danger opacity-80" />
          <p className="text-[13.2px] leading-[17.6px]">密钥列表加载失败{error?.message ? `：${error.message}` : ""}</p>
          <button type="button" onClick={() => void refetch()} className="inline-flex h-[28px] items-center gap-[4.4px] rounded-[4px] border border-border/60 px-[11px] text-[11px] font-medium transition-colors hover:bg-muted"><RotateCw className="h-[13px] w-[13px]" />重试</button>
        </div>}
        {!isLoading && !isError && rows.length === 0 && <div className="flex flex-col items-center gap-[8.8px] px-[13.2px] py-[44px] text-muted-foreground"><KeyRound className="h-[26px] w-[26px] opacity-60" /><p className="text-[13.2px] leading-[17.6px]">{q || filter !== "all" ? "没有匹配的密钥" : "还没有 API 密钥"}</p></div>}
        {!isLoading && !isError && rows.length > 0 && <div className="max-h-[52vh] divide-y divide-border/60 overflow-y-auto rounded-[10px] border border-border/60">
          {rows.map(({ t, status: s }) => {
            const models = t.model_limits ? t.model_limits.split(",").filter(Boolean) : [];
            const ips = t.allow_ips ? t.allow_ips.split("\n").map((x) => x.trim()).filter(Boolean) : [];
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-[12px] px-[13.2px] py-[11px]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-[8px] text-[13.2px] font-semibold">
                    <span className="truncate">{t.name}</span>
                    <span className={cn("rounded-full px-[8px] py-px text-[10.5px]", STATUS_CLS[s])}>{STATUS_LABEL[s]}</span>
                    <span className="rounded-full bg-muted px-[8px] py-px text-[10.5px] font-medium text-muted-foreground">{t.group || "default"}{t.group === "auto" && t.cross_group_retry ? " · 跨组重试" : ""}</span>
                  </div>
                  <div className="mt-[3px] flex items-center gap-[6px]">
                    <Pop.Root open={revealId === t.id} onOpenChange={(v) => openReveal(t, v)}>
                      <Pop.Trigger className="break-all rounded-[4px] font-mono text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{maskKey(t.key)}</Pop.Trigger>
                      <Pop.Portal><Pop.Content align="start" sideOffset={6} className="z-[70] w-[min(88vw,380px)] rounded-[10px] border border-border bg-card p-[11px] shadow-[0_12px_32px_-12px_rgba(20,20,31,0.35)] animate-in fade-in-0 zoom-in-95">
                        <p className="mb-[6.6px] text-[11.5px] font-medium text-muted-foreground">完整密钥</p>
                        <div className="flex items-center gap-[6px]">
                          <input readOnly value={revealed[t.id] ?? "加载中..."} aria-label="完整密钥" onFocus={(e) => e.currentTarget.select()} className="h-[32px] min-w-0 flex-1 rounded-[6px] border border-border bg-muted/50 px-[8.8px] font-mono text-[11.5px] outline-none" />
                          <Act label="复制" icon={copied === t.id ? Check : Copy} disabled={busy === t.id} onClick={() => copy(t)} />
                        </div>
                      </Pop.Content></Pop.Portal>
                    </Pop.Root>
                  </div>
                  <div className="mt-[3px] text-[11.5px] text-muted-foreground">
                    额度 {t.unlimited_quota ? "不限" : `剩余 ${fmtYuan(t.remain_quota)}`}{t.used_quota ? ` · 已用 ${fmtYuan(t.used_quota)}` : ""} · 模型 {models.length ? `${models.length} 个受限` : "不限"} · IP {ips.length ? `${ips.length} 条白名单` : "不限"}
                  </div>
                  <div className="mt-[2px] text-[11.5px] text-muted-foreground">创建 {fmtDate(t.created_time)} · 最后使用 {t.accessed_time && t.accessed_time > 0 ? fmtDate(t.accessed_time) : "从未"} · {t.expired_time === -1 ? "长期有效" : `到期 ${fmtDate(t.expired_time)}`}</div>
                </div>
                <div className="flex flex-wrap gap-[4px]">
                  <Act label={copied === t.id ? "已复制" : "复制"} icon={busy === t.id ? Loader2 : copied === t.id ? Check : Copy} spin={busy === t.id} disabled={busy === t.id} onClick={() => copy(t)} />
                  <Act label="一键接入" icon={Plug} onClick={() => setSetup(t)} title="配进 CC Switch / Claude Code / Cherry Studio 等客户端" />
                  <Act label="使用明细" icon={ListOrdered} onClick={() => setUsage(t)} />
                  <Act label="编辑" icon={Pencil} disabled={busy === t.id} onClick={() => setForm({ token: t })} />
                  <Act label={s === "disabled" ? "启用" : "禁用"} icon={s === "disabled" ? Play : Ban} disabled={busy === t.id || s === "expired" || s === "exhausted"} title={s === "expired" ? "已过期：请先编辑密钥延长有效期" : s === "exhausted" ? "额度已用尽：请先编辑密钥补充额度" : undefined} onClick={() => toggle(t, s)} />
                  <Act label="删除" icon={Trash2} danger disabled={busy === t.id} onClick={() => setConfirm(t)} />
                </div>
              </div>
            );
          })}
        </div>}
      </div>
      {!isError && <div className="pt-[13.2px] text-[11.5px] font-medium leading-[18.4px] text-muted-foreground">共 {(data ?? []).length} 个密钥</div>}
      {form && <ApiKeyForm token={form.token} onOpenChange={(v) => !v && setForm(null)} onSaved={refresh} />}
      <TokenUsageDialog token={usage} onOpenChange={(v) => !v && setUsage(null)} />
      <ClientSetupDialog open={!!setup} onOpenChange={(v) => !v && setSetup(null)} tokenName={setup?.name ?? ""} getKey={() => (setup ? fetchKey(setup) : Promise.reject(new Error("没有选中密钥")))} />
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        {confirm && <DialogContent title="删除 API 密钥" description={`此操作不可撤销。使用 ${confirm.name} 的应用将停止工作。`} className="w-[min(92vw,420px)]">
          <div className="flex justify-end gap-[8px]"><Button variant="secondary" onClick={() => setConfirm(null)}>取消</Button><Button variant="danger" disabled={busy === confirm.id} onClick={() => remove(confirm)}>删除</Button></div>
        </DialogContent>}
      </Dialog>
    </AccountDialog>
  );
}
