"use client";
import { useState } from "react";
import { Coins, Copy, CreditCard, Crown, Globe2, Link2, Loader2, Package, Save, SlidersHorizontal, Ticket, TicketCheck, TicketPlus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { openCashier, pickScanUrl, requestPay } from "@/lib/pay";
import { useResellerSection, useSaveSection } from "@/lib/reseller/client";
import { useSelf } from "@/lib/queries";
import { useRecruitOrders, type RecruitOrder } from "@/lib/recruit-orders";
import { cn, uid } from "@/lib/utils";
import { SectionHero, VaultPanel } from "@/components/reseller/common";
import { EmptyPanel, ErrorBanner, Kpi, cardCls, fieldCls } from "@/components/reseller/legacy/frame";
import { Funnel, InviteRecords, useCustomers } from "@/components/reseller/legacy/views";
import { useFinance } from "@/components/reseller/finance/finance";

export const PACKAGE = { key: "STANDARD", name: "标准加盟", desc: "标准加盟 · 商业起步首选", price: 1199, status: "已上线" };
/** 加盟套餐基础费用（⚡）；代理商在此之上设置招商加价，下级实付 = 基础费用 + 加价 */
export const BASE_FEE = 699;
export const MARKUP_MAX = 2000;
/** 加盟订单：形状以服务端为准（见 lib/recruit-orders），这里保留 Order 别名供表格组件沿用 */
export type Order = RecruitOrder;
const PAID = new Set(["已支付", "已完成", "已开通"]);

/** 邀请码 / 链接 / 招商加价：两版招商页共用 */
function useRecruit() {
  const self = useSelf(); const { data: recruit } = useResellerSection("recruit"); const save = useSaveSection();
  const [draft, setDraft] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const code = self.data?.aff_code ?? ""; const invite = code ? `${origin}/signup?ref=${code}` : "";
  const registered = self.data?.aff_count ?? 0; const clicks = recruit?.clicks ?? 0;
  const markup = recruit?.markup ?? 500; const draftNum = draft === null ? markup : Math.max(0, Math.min(MARKUP_MAX, Number(draft) || 0));
  const copy = async () => { if (!invite) { toast.error("暂无邀请链接"); return; } try { await navigator.clipboard.writeText(invite); toast.success("已复制邀请链接"); } catch { toast.error("复制失败，请手动复制"); } };
  const saveMarkup = async () => {
    setSaving(true);
    try { await save("recruit", { markup: draftNum, clicks }, "reseller.recruit.markup"); setDraft(null); toast.success(`已保存，用户实付 ⚡${BASE_FEE + draftNum}`); }
    catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setSaving(false); }
  };
  return { self, code, invite, registered, clicks, markup, draft, setDraft, draftNum, saving, copy, saveMarkup };
}

const tagCls = "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]";
function KV({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return <div className="group/row -mx-2 flex items-baseline justify-between gap-3 rounded-lg border-b border-border/30 px-2 pb-3 transition-colors duration-150 last:border-0 last:pb-0 hover:bg-muted/40"><span className="text-sm text-muted-foreground transition-colors group-hover/row:text-foreground/80">{k}</span><span className={cn("font-mono text-base font-bold tabular-nums", strong ? "text-primary" : "text-foreground")}>{v}</span></div>;
}

/** 新版菜单「招商合作」：招商业务面板（vault 样式） */
export function AdminRecruitView() {
  const r = useRecruit(); const orders = useRecruitOrders();
  const rate = r.clicks ? `${Math.min(100, (r.registered / r.clicks) * 100).toFixed(1)}%` : r.registered ? "100.0%" : "0.0%";
  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="招商合作" icon={<Users />} title="招商业务面板" subtitle="管理加盟套餐 / 邀请下游代理 / 实时追踪佣金到账" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <ErrorBanner error={r.self.error} />
        <VaultPanel title="邀请漏斗" icon={<Users />} right={<span className={cn(tagCls, "border-primary/30 bg-primary/10 text-primary")}>邀请码：{r.code || "—"}</span>}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div>
              <div className="rounded-lg border border-border/45 bg-muted/40 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">专属邀请链接</div><div className="mt-2 break-all font-mono text-sm font-bold text-foreground">{r.invite || "暂无邀请链接"}</div></div>
              <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={r.copy} className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-strong"><Copy size={14} />复制链接</button><span className="text-xs font-semibold text-muted-foreground">分享给目标受众以提升转化。</span></div>
            </div>
            <div className="space-y-3"><KV k="独立点击" v={r.clicks} strong /><KV k="已注册" v={r.registered} /><KV k="付费客户" v={0} /><KV k="活跃客户" v={0} /><KV k="注册率" v={rate} /></div>
          </div>
        </VaultPanel>
        <VaultPanel title="我的招商加价">
          <p className="mb-4 text-xs text-muted-foreground">用户经你的链接申请代理时, 你设置的加价即你的收益. 范围 ⚡0-⚡{MARKUP_MAX}.</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1"><label htmlFor="rc-markup" className="text-xs font-medium text-muted-foreground">加价金额 (⚡)</label><input id="rc-markup" type="number" min={0} max={MARKUP_MAX} step={1} value={r.draft ?? String(r.markup)} onChange={(e) => r.setDraft(e.target.value)} className={cn(fieldCls, "mt-1.5 font-mono")} /></div>
            <div className="flex min-w-[180px] flex-col gap-1 rounded-md border border-border/40 bg-muted/40 px-3 py-2"><span className="font-mono text-lg font-bold tabular-nums text-foreground">用户实付: ⚡{BASE_FEE + r.draftNum}</span></div>
            <Button onClick={r.saveMarkup} disabled={r.saving || r.draft === null || r.draftNum === r.markup} className="gap-2">{r.saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}保存</Button>
          </div>
        </VaultPanel>
        <VaultPanel title="加盟套餐" icon={<Crown />} right={<span className={cn(tagCls, "border-border text-muted-foreground")}>1 个套餐</span>}>
          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-[18px] border border-border/55 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--primary)_7%,transparent),transparent_60%)] p-5">
              <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Package size={18} className="text-primary" /><h3 className="text-xl font-black tracking-[-0.04em] text-foreground">{PACKAGE.name}</h3></div><p className="mt-1 text-xs font-semibold text-muted-foreground">{PACKAGE.desc}</p></div><span className={cn(tagCls, "border-success/30 bg-success/10 text-success")}>{PACKAGE.status}</span></div>
              <div className="mt-6 font-mono text-[2.3rem] font-black leading-none tracking-[-0.08em] text-foreground">⚡{(BASE_FEE + r.markup).toFixed(2)}</div>
              <div className="mt-1 text-xs font-semibold text-muted-foreground">买家支付</div>
              <div className="my-5 h-px bg-border/45" />
              <div className="space-y-3"><KV k="基础费用" v={`⚡${BASE_FEE.toFixed(2)}`} /><KV k="我的佣金" v={`⚡${r.markup.toFixed(2)}`} strong /></div>
              <p className="mt-6 text-center text-xs font-semibold text-muted-foreground">下级经你的邀请链接购买即此价 — 用上方邀请链接招募</p>
            </article>
          </div>
        </VaultPanel>
        <VaultPanel title="我的订单" icon={<TicketPlus />}>
          {orders.items.length === 0 ? <EmptyPanel title="暂无加盟订单" desc="邀请下游代理购买后, 订单将显示在这里" /> : <OrdersTable orders={orders.items} />}
        </VaultPanel>
      </div>
    </div>
  );
}

function OrdersTable({ orders }: { orders: Order[] }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground"><tr><th className="px-3 py-2 font-medium">套餐</th><th className="px-3 py-2 font-medium">金额</th><th className="px-3 py-2 font-medium">支付方式</th><th className="px-3 py-2 font-medium">二级域名</th><th className="px-3 py-2 font-medium">状态</th><th className="px-3 py-2 font-medium">时间</th></tr></thead>
      <tbody>{orders.map((o) => <tr key={o.id} className="border-t border-border/60"><td className="px-3 py-2.5">{o.pkg}</td><td className="px-3 py-2.5 tabular-nums">⚡{o.amount.toFixed(2)}</td><td className="px-3 py-2.5">{o.method}</td><td className="px-3 py-2.5">{o.subdomain || "—"}</td><td className="px-3 py-2.5"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{o.status}</span></td><td className="px-3 py-2.5 text-muted-foreground">{o.updatedAt ? new Date(o.updatedAt).toLocaleString("zh-CN") : ""}</td></tr>)}</tbody></table></div>
  );
}

const Tile = ({ children }: { children: React.ReactNode }) => <span className="inline-flex size-8 items-center justify-center rounded-xl bg-primary/[0.16] text-primary [&_svg]:size-4">{children}</span>;

/** 旧版菜单「招商合作」：KPI + 邀请链接 / 转化漏斗 + 招商加价 + 加盟套餐 + 招募明细 */
export function PartnerView() {
  const r = useRecruit(); const orders = useRecruitOrders(); const cq = useCustomers(); const f = useFinance();
  const [tab, setTab] = useState<"invites" | "orders">("invites");
  const customers = cq.data?.items ?? []; const paidCustomers = customers.filter((c) => c.topup > 0).length; const activeCustomers = customers.filter((c) => c.active && c.consume > 0).length;
  const deals = orders.items.filter((o) => PAID.has(o.status)).length;
  const incomeOf = (id: number) => (f.data?.income ?? []).filter((x) => x.userId === id).reduce((s, x) => s + x.income, 0);
  const pct = (a: number, b: number) => `→ ${b ? Math.min(100, (a / b) * 100).toFixed(1) : "0.0"}%`;
  const tabCls = (on: boolean) => cn("relative inline-flex min-h-11 min-w-11 flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1 text-sm font-semibold whitespace-nowrap transition-[background,border-color,box-shadow,color]", on ? "border-border/60 bg-card text-foreground shadow-sm" : "border-transparent text-foreground/60 hover:text-foreground");
  return (
    <>
      <ErrorBanner error={r.self.error ?? cq.error} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="累计邀请收益" value={`⚡${deals * r.markup}`} icon={<Coins />} accent />
        <Kpi label="邀请注册" value={r.registered} icon={<UserPlus />} />
        <Kpi label="付费转化" value={paidCustomers} icon={<CreditCard />} />
        <Kpi label="加盟成交" value={deals} icon={<TicketCheck />} />
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <section className={cn(cardCls, "flex flex-col p-5 lg:col-span-2")}>
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Tile><Link2 /></Tile><h2 className="text-sm font-semibold text-foreground">专属邀请链接</h2></div><span className="rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-xs font-medium tabular-nums text-muted-foreground">邀请码：{r.code || "—"}</span></div>
          <div className="mt-4 rounded-xl border border-border bg-muted/50 px-4 py-3"><p className="break-all font-mono text-sm text-foreground">{r.invite || "暂无邀请链接"}</p></div>
          <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={r.copy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground outline-none transition-colors duration-150 hover:bg-primary-strong"><Copy size={15} />复制链接</button><span className="text-xs text-muted-foreground">分享给目标受众以提升转化。</span></div>
        </section>
        <section className={cn(cardCls, "p-5")}>
          <h2 className="text-sm font-semibold text-foreground">转化漏斗</h2>
          <div className="mt-5"><Funnel steps={[{ label: "独立点击", value: r.clicks }, { label: "已注册", value: r.registered, rate: pct(r.registered, r.clicks) }, { label: "付费客户", value: paidCustomers, rate: pct(paidCustomers, r.registered) }, { label: "活跃客户", value: activeCustomers }]} /></div>
        </section>
      </section>
      <section className={cn(cardCls, "p-5")}>
        <div className="flex items-center gap-2"><Tile><SlidersHorizontal /></Tile><h2 className="text-sm font-semibold text-foreground">我的招商加价</h2></div>
        <p className="mt-2 text-xs text-muted-foreground">用户经你的链接申请代理时, 你设置的加价即你的收益. 范围 ⚡0-⚡{MARKUP_MAX}.</p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1"><label htmlFor="pt-markup" className="text-xs text-muted-foreground">加价金额 (⚡)</label><input id="pt-markup" type="number" min={0} max={MARKUP_MAX} step={1} value={r.draft ?? String(r.markup)} onChange={(e) => r.setDraft(e.target.value)} className={cn(fieldCls, "mt-1.5 font-mono")} /></div>
          <div className="flex min-w-[180px] flex-col gap-1 rounded-xl border border-border bg-muted/40 px-3 py-2"><span className="font-mono text-lg font-semibold tabular-nums text-foreground">用户实付: ⚡{BASE_FEE + r.draftNum}</span></div>
          <button type="button" onClick={r.saveMarkup} disabled={r.saving || r.draft === null || r.draftNum === r.markup} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-colors duration-150 hover:bg-primary-strong disabled:opacity-50">{r.saving && <Loader2 size={14} className="animate-spin" />}保存</button>
        </div>
      </section>
      <section className={cn(cardCls, "p-5")}>
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Tile><Crown /></Tile><h2 className="text-sm font-semibold text-foreground">加盟套餐</h2></div><span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">1 个套餐</span></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <article className="flex flex-col rounded-2xl border border-border bg-muted/40 p-5 transition-colors duration-150 hover:border-primary/30">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Package size={16} className="text-primary" /><h3 className="truncate text-base font-semibold text-foreground">{PACKAGE.name}</h3></div><p className="mt-1 text-xs text-muted-foreground">{PACKAGE.desc}</p></div><span className="shrink-0 rounded-full border border-primary/35 bg-primary/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{PACKAGE.status}</span></div>
            <div className="mt-5 font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">⚡{(BASE_FEE + r.markup).toFixed(2)}</div>
            <div className="mt-1 text-xs text-muted-foreground">买家支付</div>
            <div className="mt-5 space-y-2 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">基础费用</span><span className="font-medium tabular-nums text-foreground">⚡{BASE_FEE.toFixed(2)}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">我的佣金</span><span className="font-semibold tabular-nums text-primary">⚡{r.markup.toFixed(2)}</span></div>
            </div>
            <div className="mt-auto pt-4"><p className="text-center text-xs text-muted-foreground">下级经你的邀请链接购买即此价 — 用上方邀请链接招募</p></div>
          </article>
        </div>
      </section>
      <section className={cn(cardCls, "p-5")}>
        <h2 className="text-sm font-semibold text-foreground">招募明细</h2>
        <div className="mt-4 flex flex-col gap-2">
          <div role="tablist" className="inline-flex w-fit items-stretch justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
            <button type="button" role="tab" aria-selected={tab === "invites"} onClick={() => setTab("invites")} className={tabCls(tab === "invites")}>邀请记录<span className="ml-1.5 tabular-nums opacity-70">{customers.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")} className={tabCls(tab === "orders")}>加盟订单{orders.items.length > 0 && <span className="ml-1.5 tabular-nums opacity-70">{orders.items.length}</span>}</button>
          </div>
          <div role="tabpanel" className="mt-4 flex-1 outline-none">
            {tab === "invites" ? <InviteRecords items={customers} incomeOf={incomeOf} /> : orders.items.length === 0 ? <EmptyPanel title="暂无加盟订单" desc="邀请下游代理购买后, 订单将显示在这里" /> : <OrdersTable orders={orders.items} />}
          </div>
        </div>
      </section>
    </>
  );
}

/** 未开通代理的普通用户版本：邀请链接 + 加盟套餐下单 */
export function UserRecruitView() {
  const { data: self } = useSelf(); const orders = useRecruitOrders();
  const [buy, setBuy] = useState(false); const [note, setNote] = useState(""); const [sub, setSub] = useState(""); const [method, setMethod] = useState<"alipay" | "wxpay">("alipay"); const [busy, setBusy] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const invite = self?.aff_code ? `${origin}/login?aff=${self.aff_code}` : "";
  const registered = self?.aff_count ?? 0;
  const copy = async () => { if (!invite) { toast.error("暂无邀请链接"); return; } try { await navigator.clipboard.writeText(invite); toast.success("已复制邀请链接"); } catch { toast.error("复制失败，请手动复制"); } };
  const pay = async () => {
    if (sub && !/^[a-z0-9-]{2,30}$/i.test(sub)) { toast.error("二级域名仅支持字母 / 数字 / 连字符"); return; }
    setBusy(true);
    try {
      // 必须走 @/lib/pay 的 requestPay（自读整段响应体）：收银台地址 url 挂在顶层，
      // 用 api() 会被它按 data 解包、丢掉 url → 永远落到「暂未开启在线支付」。
      const r = await requestPay({ amount: PACKAGE.price, payment_method: method, top_up_code: "" });
      const { scan, url, params } = pickScanUrl(r);
      if (url || scan) openCashier({ url, params, scan: scan ?? "" });
      else toast.info("当前环境暂未开启在线支付，请联系客服完成加盟");
      // 订单落服务端（mc_recruit_orders）：换设备/换浏览器不丢，也不再与同机其他账号串单
      await orders.create({ id: uid(), pkg: PACKAGE.name, amount: PACKAGE.price, method: method === "alipay" ? "支付宝" : "微信支付", note, subdomain: sub, status: url || scan ? "待支付" : "待联系" });
      setBuy(false); toast.success("订单已创建，支付完成后代理账号将自动开通");
    } catch (e) { toast.error(`下单失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-full flex-col gap-3">
      <SectionHero badge="招商合作" icon={<Users />} title="招商业务面板" subtitle="管理加盟套餐 / 邀请下游代理 / 实时追踪佣金到账" />
      <div className="flex flex-1 flex-col gap-3 pb-24">
        <VaultPanel title="邀请漏斗" icon={<Users />}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div>
              <div className="rounded-lg border border-border/45 bg-muted/40 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">专属邀请链接</div><div className="mt-2 break-all font-mono text-sm font-bold text-foreground">{invite || "暂无邀请链接"}</div></div>
              <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={copy} className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-strong"><Copy size={14} />复制链接</button><span className="text-xs font-semibold text-muted-foreground">分享给目标受众以提升转化。</span></div>
            </div>
            <div className="space-y-3"><KV k="已注册" v={registered} strong={registered > 0} /><KV k="付费客户" v={0} /><KV k="活跃客户" v={0} /><KV k="注册率" v={registered ? "100.0%" : "0.0%"} /></div>
          </div>
        </VaultPanel>
        <VaultPanel title="加盟套餐" icon={<Crown />} right={<span className={cn(tagCls, "border-border text-muted-foreground")}>1 个套餐</span>}>
          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-[18px] border border-border/55 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--primary)_7%,transparent),transparent_60%)] p-5">
              <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Package size={18} className="text-primary" /><h3 className="text-xl font-black tracking-[-0.04em] text-foreground">{PACKAGE.name}</h3></div><p className="mt-1 text-xs font-semibold text-muted-foreground">{PACKAGE.desc}</p></div><span className={cn(tagCls, "border-success/30 bg-success/10 text-success")}>{PACKAGE.status}</span></div>
              <div className="mt-6 font-mono text-[2.3rem] font-black leading-none tracking-[-0.08em] text-foreground">⚡{PACKAGE.price.toFixed(2)}</div>
              <div className="mt-1 text-xs font-semibold text-muted-foreground">买家支付</div>
              <div className="my-5 h-px bg-border/45" />
              <Button className="w-full" onClick={() => setBuy(true)}>选择</Button>
            </article>
          </div>
        </VaultPanel>
        <VaultPanel title="我的订单" icon={<TicketPlus />}>
          {orders.items.length === 0 ? <EmptyPanel title="暂无加盟订单" desc="邀请下游代理购买后, 订单将显示在这里" /> : <OrdersTable orders={orders.items} />}
        </VaultPanel>
      </div>
      <Dialog open={buy} onOpenChange={setBuy}>
        <DialogContent title={`购买 ${PACKAGE.key} 加盟`} description={`支付 ⚡${PACKAGE.price.toFixed(2)} 成为 代理商中心 代理 (总部直招, 即时开通您的代理账号)`} className="w-[min(92vw,640px)]">
          <div className="space-y-4">
            <label className="block text-sm"><span className="mb-1 block font-medium">备注 (可选)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="您的联系方式 / 业务方向 / 团队规模等..." className="h-11 w-full rounded-xl border px-3 outline-none focus:border-primary" /></label>
            <label className="block text-sm"><span className="mb-1 flex items-center gap-1 font-medium"><Globe2 size={14} />专属二级域名 (选填)</span><input value={sub} onChange={(e) => setSub(e.target.value.trim())} placeholder="例如 myshop (字母/数字/连字符)" className="h-11 w-full rounded-xl border px-3 outline-none focus:border-primary" /><span className="mt-1 block text-xs text-muted-foreground">开通代理后将自动签发该专属域名, 无需单独审批</span></label>
            <div><div className="mb-2 text-sm font-medium">支付方式</div><div className="grid grid-cols-2 gap-3">{([["alipay", "支付宝", "扫码 / 手机网页"], ["wxpay", "微信支付", "扫码"]] as const).map(([k, n, d]) => <button key={k} onClick={() => setMethod(k)} className={cn("rounded-xl border p-3 text-left", method === k ? "border-primary bg-primary-tint" : "hover:bg-muted")}><div className="font-medium">{n}</div><div className="text-xs text-muted-foreground">{d}</div></button>)}</div></div>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setBuy(false)}>取消</Button><Button disabled={busy} onClick={pay} className="gap-2 bg-[#b8860b] hover:bg-[#a0760a]"><Ticket size={14} />立即支付 ⚡{PACKAGE.price.toFixed(2)}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
