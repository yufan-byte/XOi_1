"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as D from "@radix-ui/react-dialog";
import { Check, CircleDollarSign, Copy, Mail, NotebookPen, Plus, Snowflake, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useResellerSection, useSaveSection } from "@/lib/reseller/client";
import { cn } from "@/lib/utils";
import { Zap, dateSlash, dateTimeShort, dateTimeFull, inputCls } from "@/components/reseller/common";
import type { CustomerRow } from "./customers";

interface Detail extends CustomerRow { frozen: number; topModel: string; records: { id: number; at: number; type: number; model: string; amount: number; tokens: number }[] }
const PRESET = ["高潜客户", "已成交", "待跟进", "重点维护", "已流失"];

function Metric({ icon, label, children, tone }: { icon: React.ReactNode; label: string; children: React.ReactNode; tone: string }) {
  return <div className={cn("rounded-2xl border border-t-2 bg-gradient-to-b to-card p-4", tone)}><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-2 text-xl">{children}</div></div>;
}

/** 客户详情（右侧面板）：指标 / 标签备注（持久化到 reseller.customers）/ 明细 / 客户信息 */
export function CustomerDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ["reseller", "customer", id], queryFn: () => api<Detail>(`/api/reseller/customers?id=${id}`), enabled: id != null });
  const metas = useResellerSection("customers"); const save = useSaveSection(); const qc = useQueryClient();
  const [tags, setTags] = useState<string[]>([]); const [note, setNote] = useState(""); const [custom, setCustom] = useState(""); const [busy, setBusy] = useState(false);
  const d = q.data;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开新客户时用服务端备注初始化表单
  useEffect(() => { if (d) { setTags(d.tags); setNote(d.note); setCustom(""); } }, [d]);
  const allTags = [...PRESET, ...tags.filter((t) => !PRESET.includes(t))];
  const toggle = (t: string) => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const addTag = () => { const t = custom.trim(); if (!t) return; if (t.length > 20) { toast.error("标签最多 20 个字"); return; } if (!tags.includes(t)) setTags([...tags, t]); setCustom(""); };
  const submit = async () => {
    if (!d) return; setBusy(true);
    try { await save("customers", { ...(metas.data ?? {}), [String(d.id)]: { tags, note } }, "customer.note.update"); qc.invalidateQueries({ queryKey: ["reseller", "customers-list"] }); toast.success("备注已保存"); }
    catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  const copyId = async () => { try { await navigator.clipboard.writeText(`#${d?.id}`); toast.success("已复制客户编号"); } catch { toast.error("复制失败"); } };
  return (
    <D.Root open={id != null} onOpenChange={(v) => !v && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md animate-in fade-in-0" />
        <D.Content className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(680px,100vw)] flex-col border-l bg-card shadow-pop outline-none animate-in slide-in-from-right-4">
          <div className="flex items-start justify-between gap-3 border-b bg-gradient-to-b from-primary-tint/60 to-card px-8 py-6">
            <div className="min-w-0"><D.Title className="truncate text-2xl font-bold">{d?.displayName || d?.username || "客户详情"}</D.Title><D.Description className="mt-1 font-mono text-sm text-muted-foreground">#{id} · {d?.email || "—"}</D.Description></div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={d?.email ? `mailto:${d.email}` : undefined} aria-disabled={!d?.email} onClick={(e) => { if (!d?.email) { e.preventDefault(); toast.info("该客户未绑定邮箱"); } }} className="chip h-10 gap-2"><Mail size={16} />发送电子邮件</a>
              <D.Close className="icon-btn h-10 w-10 border hover:bg-muted" aria-label="关闭"><X size={18} /></D.Close>
            </div>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-8 py-6">
            {q.isLoading || !d ? (q.isError ? <div className="text-sm text-danger">加载失败：{(q.error as Error).message}</div> : <div className="h-64 rounded-2xl shimmer" />) : (<>
              <div className="flex flex-wrap gap-2 text-xs tracking-wider">
                <span className="rounded-md border border-primary/30 bg-primary-tint px-2.5 py-1 text-primary">STARTER 客户</span>
                {d.active ? <span className="rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-success">活跃</span> : <span className="rounded-md border bg-muted px-2.5 py-1 text-muted-foreground">沉睡</span>}
                <span className="rounded-md border border-primary/30 bg-primary-tint px-2.5 py-1 text-primary">加入时间 {dateSlash(d.joinedAt)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Metric tone="border-t-primary from-primary-tint/50" icon={<CircleDollarSign size={14} />} label="当前余额"><Zap v={d.balance} /></Metric>
                <Metric tone="border-t-pink-500 from-pink-50" icon={<Snowflake size={14} />} label="冻结中"><Zap v={d.frozen} /></Metric>
                <Metric tone="border-t-success from-success/10" icon={<CircleDollarSign size={14} />} label="累计充值"><Zap v={d.topup} /></Metric>
                <Metric tone="border-t-warning from-[#fff8e6]" icon={<CircleDollarSign size={14} />} label="累计消费"><Zap v={d.consume} /></Metric>
                <Metric tone="border-t-primary from-primary-tint/50" icon={<Sparkles size={14} />} label="常用模型"><span className="font-mono text-base">{d.topModel || "—"}</span></Metric>
              </div>
              <section className="rounded-2xl border p-6">
                <div className="flex items-center gap-2 text-lg font-semibold"><NotebookPen size={18} className="text-primary" />客户备注</div>
                <div className="mt-5 text-sm text-muted-foreground">标签</div>
                <div className="mt-2 flex flex-wrap gap-2">{allTags.map((t) => <button key={t} onClick={() => toggle(t)} aria-pressed={tags.includes(t)} className={cn("chip h-9", tags.includes(t) && "chip-active")}>{t}</button>)}</div>
                <div className="mt-3 flex gap-2"><input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="自定义标签" className={inputCls} /><button onClick={addTag} className="chip h-11 shrink-0 gap-1.5 px-5"><Plus size={16} />添加</button></div>
                <div className="mt-5 text-sm text-muted-foreground">备注</div>
                <textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="记录该客户的跟进情况、偏好、联系方式等(仅你可见)" className="mt-2 h-24 w-full resize-y rounded-xl border bg-card px-4 py-3 text-sm outline-none focus:border-primary/50" />
                <div className="mt-1 text-right text-xs text-muted-foreground">{note.length} / 2000</div>
                <div className="mt-3 flex justify-end"><button disabled={busy} onClick={submit} className="chip h-11 gap-2 px-5 disabled:opacity-50"><Check size={16} />保存备注</button></div>
              </section>
              <section className="rounded-2xl border p-6">
                <div className="text-lg font-semibold">充值/消费明细</div>
                {d.records.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">暂无充值/消费记录</div> : (
                  <ul className="mt-3 divide-y">{d.records.map((r) => <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm"><span className={cn("rounded-md px-2 py-0.5 text-xs", r.type === 1 ? "bg-success/10 text-success" : "bg-[#fff8e6] text-warning")}>{r.type === 1 ? "充值" : "消费"}</span><span className="min-w-0 flex-1 truncate">{r.type === 1 ? "余额充值" : r.model}{r.type === 2 && r.tokens > 0 && <span className="ml-2 text-xs text-muted-foreground">{r.tokens} tokens</span>}</span><span className="text-xs text-muted-foreground">{dateTimeFull(r.at)}</span><span className={cn("w-24 text-right font-mono", r.type === 1 ? "text-success" : "")}>{r.type === 1 ? "+" : "-"}⚡{r.amount.toFixed(3)}</span></li>)}</ul>
                )}
              </section>
              <section className="rounded-2xl border p-6">
                <div className="text-lg font-semibold">客户信息</div>
                <dl className="mt-3 divide-y text-sm">
                  <div className="flex justify-between py-3"><dt className="text-muted-foreground">最近活跃</dt><dd>{dateTimeShort(d.activeAt)}</dd></div>
                  <div className="flex justify-between py-3"><dt className="text-muted-foreground">加入时间</dt><dd>{dateSlash(d.joinedAt)}</dd></div>
                  <div className="flex items-center justify-between py-3"><dt className="text-muted-foreground">客户编号</dt><dd className="flex items-center gap-2 font-mono">#{d.id}<button onClick={copyId} className="icon-btn h-8 w-8 hover:bg-muted" aria-label="复制"><Copy size={14} /></button></dd></div>
                </dl>
              </section>
            </>)}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
