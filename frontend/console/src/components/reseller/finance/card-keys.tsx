"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy, CopyCheck, Search, Ticket, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyBox, Field, Zap, dateTimeFull, inputCls } from "@/components/reseller/common";
import { useResellerMe } from "@/lib/reseller/client";

interface CardKey { id: number; key: string; name: string; amount: number; status: number; createdAt: number; redeemedAt: number; expiredAt: number; usedUserId: number; expired: boolean }
const STATUS: Record<number, [string, string]> = { 1: ["未使用", "bg-success/10 text-success"], 2: ["已禁用", "bg-muted text-muted-foreground"], 3: ["已使用", "bg-primary-tint text-primary"] };
const legacyField = "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-primary/50";
const PAGE = 20;

/** 整批复制：一行一张卡密 */
async function copyKeys(keys: string[], what: string) {
  if (!keys.length) { toast.error("没有可复制的卡密"); return; }
  try { await navigator.clipboard.writeText(keys.join("\n")); toast.success(`已复制${what} ${keys.length} 张卡密`); } catch { toast.error("复制失败，请检查浏览器剪贴板权限"); }
}

/** 卡密：new-api 兑换码批量生成 + 列表；variant="legacy" 为旧版菜单「卡密管理」布局
 *  生成后可一键复制整批；列表可勾选（跨页保留勾选）后复制所选 */
export function CardKeysTab({ wallet, variant }: { wallet: number; variant?: "legacy" }) {
  const qc = useQueryClient(); const list = useQuery({ queryKey: ["reseller", "card-keys"], queryFn: () => api<CardKey[]>("/api/reseller/redemption") });
  /** 平台（站长/管理员）发码 = 发行凭证，不从任何钱包扣款，因此不校验、也不显示钱包余额。
   *  代理发码才是「从自己钱包按面值买下再转卖」，那才需要余额校验。 */
  const me = useResellerMe(); const isPlatform = me.data?.scope === "platform";
  const [count, setCount] = useState(""); const [amount, setAmount] = useState(""); const [days, setDays] = useState("30"); const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [kw, setKw] = useState("");
  /** 本次生成的整批卡密（刷新页面即清空） */
  const [lastBatch, setLastBatch] = useState<string[]>([]);
  /** 勾选的卡密（按 key 记，翻页 / 搜索不清空） */
  const [sel, setSel] = useState<string[]>([]); const [page, setPage] = useState(1);
  const total = (Number(count) || 0) * (Number(amount) || 0);
  const submit = async () => {
    const c = Math.floor(Number(count)), a = Number(amount), dd = Math.floor(Number(days));
    if (!(c >= 1 && c <= 100)) { toast.error("数量需为 1-100"); return; }
    if (!(a > 0)) { toast.error("请输入金额"); return; }
    if (!(dd >= 1 && dd <= 365)) { toast.error("有效天数需为 1-365"); return; }
    if (!isPlatform && total > wallet) { toast.error("代理钱包余额不足"); return; }
    if (isPlatform && total > 100000) { toast.error("单批面额合计不能超过 ¥100000"); return; }
    setBusy(true);
    try {
      const r = await api<{ keys: string[] }>("/api/reseller/redemption", { method: "POST", body: JSON.stringify({ count: c, amount: a, days: dd, name }) });
      setLastBatch(r.keys); setPage(1);
      toast.success(`已生成 ${r.keys.length} 张卡密`, { action: { label: "一键复制整批", onClick: () => void copyKeys(r.keys, "本批") } });
      setCount(""); setAmount(""); setName(""); qc.invalidateQueries({ queryKey: ["reseller", "card-keys"] }); qc.invalidateQueries({ queryKey: ["self"] });
    }
    catch (e) { toast.error(`生成失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  const rows = useMemo(() => { const k = kw.trim().toLowerCase(); return (list.data ?? []).filter((r) => !k || r.key.toLowerCase().includes(k) || r.name.toLowerCase().includes(k)); }, [list.data, kw]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE)); const cur = Math.min(page, pages); const pageRows = rows.slice((cur - 1) * PAGE, cur * PAGE);
  const pageAll = pageRows.length > 0 && pageRows.every((r) => sel.includes(r.key));
  const togglePage = () => setSel(pageAll ? sel.filter((k) => !pageRows.some((r) => r.key === k)) : [...sel, ...pageRows.filter((r) => !sel.includes(r.key)).map((r) => r.key)]);
  const toggle = (k: string) => setSel(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]);
  const copy = async (k: string) => { try { await navigator.clipboard.writeText(k); toast.success("已复制卡密"); } catch { toast.error("复制失败"); } };
  const search = (v: string) => { setKw(v); setPage(1); };
  const isLegacy = variant === "legacy"; const field = isLegacy ? legacyField : inputCls;

  /** 本次生成的整批：一键整批复制 */
  const batchPanel = lastBatch.length > 0 && (
    <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><CopyCheck size={16} className="text-success" />本次生成 {lastBatch.length} 张卡密</div>
        <div className="flex items-center gap-2"><Button size="sm" onClick={() => void copyKeys(lastBatch, "本批")}><Copy size={14} />一键复制整批</Button><button type="button" onClick={() => setLastBatch([])} className="icon-btn h-8 w-8 hover:bg-muted" aria-label="收起"><X size={14} /></button></div>
      </div>
      <textarea readOnly value={lastBatch.join("\n")} rows={Math.min(6, lastBatch.length)} aria-label="本次生成的卡密" onFocus={(e) => e.currentTarget.select()} className="mt-3 w-full resize-y rounded-xl border bg-card px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none" />
      <p className="mt-1.5 text-[11px] text-muted-foreground">一行一张，可直接粘贴发给客户；刷新页面后这里会清空，之后请在下方列表勾选复制。</p>
    </div>
  );
  /** 列表工具条：跨页勾选 + 复制所选 */
  const selBar = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-4 py-2 text-xs">
      <span className="text-muted-foreground">已选 <b className="text-foreground">{sel.length}</b> 张{sel.length > 0 && pages > 1 ? "（含其它页）" : ""} · 勾选后可跨页复制</span>
      <span className="flex items-center gap-1.5">
        <button type="button" disabled={!sel.length} onClick={() => void copyKeys(rows.filter((r) => sel.includes(r.key)).map((r) => r.key).concat(sel.filter((k) => !rows.some((r) => r.key === k))), "所选")} className="chip h-8 px-3 text-xs text-primary hover:bg-muted disabled:opacity-50"><Copy size={13} />复制所选</button>
        <button type="button" disabled={!sel.length} onClick={() => setSel([])} className="chip h-8 px-3 text-xs hover:bg-muted disabled:opacity-50">清除选择</button>
      </span>
    </div>
  );
  const pager = pages > 1 && (
    <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
      <span>第 {cur} / {pages} 页 · 共 {rows.length} 条</span>
      <span className="flex items-center gap-1"><button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} className="icon-btn h-8 w-8 hover:bg-muted disabled:opacity-40" aria-label="上一页"><ChevronLeft size={14} /></button><button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} className="icon-btn h-8 w-8 hover:bg-muted disabled:opacity-40" aria-label="下一页"><ChevronRight size={14} /></button></span>
    </div>
  );
  const table = (
    <table className="w-full min-w-[760px] text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label="全选本页" checked={pageAll} onChange={togglePage} className="size-4 accent-[var(--primary)]" /></th><th className="px-4 py-2.5 font-medium">卡密</th><th className="px-4 py-2.5 font-medium">批次备注</th><th className="px-4 py-2.5 text-right font-medium">面值</th><th className="px-4 py-2.5 font-medium">状态</th><th className="px-4 py-2.5 font-medium">创建时间</th><th className="px-4 py-2.5 font-medium">过期时间</th></tr></thead>
      <tbody>{pageRows.map((r) => { const [label, tone] = STATUS[r.status] ?? ["未知", "bg-muted"]; const expired = r.expired; const on = sel.includes(r.key); return (
        <tr key={r.id} className={cn("border-t border-border/60", on && "bg-primary/[0.04]")}><td className="px-4 py-2.5"><input type="checkbox" aria-label={`选择 ${r.key}`} checked={on} onChange={() => toggle(r.key)} className="size-4 accent-[var(--primary)]" /></td><td className="px-4 py-2.5"><span className="font-mono text-xs">{r.key}</span><button onClick={() => copy(r.key)} className="icon-btn ml-1 inline-grid h-7 w-7 align-middle hover:bg-muted" aria-label="复制"><Copy size={13} /></button></td><td className="px-4 py-2.5">{r.name}</td><td className="px-4 py-2.5 text-right"><Zap v={r.amount} /></td><td className="px-4 py-2.5"><span className={cn("rounded-md px-2 py-0.5 text-xs", expired ? "bg-danger/10 text-danger" : tone)}>{expired ? "已过期" : label}</span></td><td className="px-4 py-2.5 text-muted-foreground">{dateTimeFull(r.createdAt)}</td><td className="px-4 py-2.5 text-muted-foreground">{r.expiredAt ? dateTimeFull(r.expiredAt) : "永不过期"}</td></tr>
      ); })}</tbody></table>
  );
  const listBox = list.isLoading ? <div className="m-4 h-24 rounded-xl shimmer" /> : rows.length === 0 ? (
    isLegacy ? <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"><Ticket size={28} className="text-muted-foreground" /><p className="text-sm font-medium text-foreground">暂无卡密</p><p className="max-w-md text-xs leading-5 text-muted-foreground">卡密配额由平台运营开通后, 你可批量生成卡密分发给客户。请联系平台运营或前往管理后台申请。</p></div>
      : <EmptyBox className="m-4" title="暂无卡密" desc="卡密配额由平台运营开通后, 你可批量生成卡密分发给客户。请联系平台运营或前往管理后台申请。" />
  ) : <>{selBar}<div className="overflow-x-auto">{table}</div>{pager}</>;

  if (isLegacy) return (
    <>
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1"><h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Wallet size={16} className="text-primary" />生成卡密</h2><p className="max-w-prose text-xs leading-5 text-muted-foreground">{isPlatform ? "平台发码直接从网关生成，不扣任何钱包余额；面额即用户兑换后到账的金额。单批面额合计上限 ¥100000。" : "生成的卡密面值将从你的代理钱包余额扣除。余额不足时无法生成。生成后可一键复制整批。"}</p></div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2">{isPlatform ? <><span className="text-[11px] text-muted-foreground">平台发行</span><span className="text-sm font-semibold text-primary">不扣钱包</span></> : <><span className="text-[11px] text-muted-foreground">代理钱包可用余额</span><Zap v={wallet} className="font-mono text-sm font-semibold text-foreground" /></>}</div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-card/60 p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><label htmlFor="ck-count" className="text-sm font-medium leading-none">数量</label><input id="ck-count" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} placeholder="最多 100" className={field} /></div>
            <div className="flex flex-col gap-1.5"><label htmlFor="ck-amount" className="text-sm font-medium leading-none">金额</label><input id="ck-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金额" className={field} /></div>
            <div className="flex flex-col gap-1.5"><label htmlFor="ck-days" className="text-sm font-medium leading-none">有效天数</label><input id="ck-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} placeholder="最多 365 天" className={field} /></div>
          </div>
          <div className="flex flex-col gap-1.5"><label htmlFor="ck-name" className="text-sm font-medium leading-none">批次备注</label><input id="ck-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="可填写批次备注" className={field} /></div>
          <div className="flex flex-col items-stretch gap-3 border-t border-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>预估合计</span><Zap v={total} className="font-mono text-base font-semibold text-foreground" /></div>
            <Button type="submit" disabled={busy}>提交</Button>
          </div>
        </form>
        {batchPanel}
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">卡密列表</h2>
          <div className="flex items-center gap-2"><div className="relative w-full max-w-xs"><Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={kw} onChange={(e) => search(e.target.value)} placeholder="搜索卡密" aria-label="搜索卡密" className={cn(field, "pl-8")} /></div><span className="whitespace-nowrap text-[11px] text-muted-foreground">{rows.length} 条</span></div>
        </div>
        {list.isError && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{(list.error as Error).message}</div>}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">{listBox}</div>
      </section>
    </>
  );

  return (
    <div className="space-y-4">
      <section className="pane p-6">
        <div className="text-base font-semibold">生成卡密</div>
        <p className="mt-1 text-sm text-muted-foreground">{isPlatform ? "平台发码直接从网关生成，不扣任何钱包余额；面额即用户兑换后到账的金额。单批面额合计上限 ¥100000。" : "生成的卡密面值将从你的代理钱包余额扣除。余额不足时无法生成。生成后可一键复制整批。"}</p>
        <div className="mt-4 rounded-xl bg-primary-tint px-4 py-3 text-sm">{isPlatform ? <>平台发行 <span className="ml-2 font-semibold text-primary">不扣钱包余额</span></> : <>代理钱包可用余额 <Zap v={wallet} className="ml-2 font-semibold text-primary" /></>}</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="数量"><input type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} placeholder="最多 100" className={inputCls} /></Field>
          <Field label="金额"><input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金额" className={inputCls} /></Field>
          <Field label="有效天数"><input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} placeholder="最多 365 天" className={inputCls} /></Field>
          <Field label="批次备注"><input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="可填写批次备注" className={inputCls} /></Field>
        </div>
        <div className="mt-4 flex items-center justify-between"><span className="text-sm text-muted-foreground">预估合计 <Zap v={total} className="ml-2 text-lg font-semibold text-foreground" /></span><Button disabled={busy} onClick={submit}>提交</Button></div>
        {batchPanel && <div className="mt-4">{batchPanel}</div>}
      </section>
      <section className="pane p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs text-muted-foreground">{rows.length} 条</div><div className="text-base font-semibold">卡密列表</div></div><label className="flex h-10 w-full max-w-xs items-center gap-2 rounded-xl border bg-card px-3"><Search size={15} className="text-muted-foreground" /><input value={kw} onChange={(e) => search(e.target.value)} placeholder="搜索卡密" className="w-full bg-transparent text-sm outline-none" /></label></div>
        {list.isError ? <div className="mt-4 text-sm text-danger">加载失败：{(list.error as Error).message}</div> : <div className="mt-4 overflow-hidden rounded-2xl border">{listBox}</div>}
      </section>
    </div>
  );
}
