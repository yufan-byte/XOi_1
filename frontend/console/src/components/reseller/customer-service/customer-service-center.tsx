"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Copy, CreditCard, Headset, ImageIcon, LifeBuoy, MessagesSquare, Plus, Save, Settings2, ShieldCheck, Trash2, Upload, Users, Wallet, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useResellerSection, useSaveSection } from "@/lib/reseller/client";
import { DEFAULT_DATA, type ContactWechat, type CustomerService, type GroupLink } from "@/lib/reseller/types";
import { cn, uid } from "@/lib/utils";
import { ImagePicker, PHOTO_TYPES, SAFE_LINK, copyText, readImage } from "@/components/reseller/site/ui";
import { ErrorBanner, Kpi, LegacyHead, cardCls, fieldCls } from "@/components/reseller/legacy/frame";

export type Tab = "wechat" | "groups" | "tickets";
const input = "h-11 w-full rounded-xl border bg-card px-4 text-[15px] outline-none focus:border-primary/50";
export const PLATFORMS: Record<string, string> = { wechat: "微信", qq: "QQ", telegram: "Telegram", other: "其他" };
const TABS: { value: Tab; label: string }[] = [{ value: "wechat", label: "客服微信" }, { value: "groups", label: "群链接" }, { value: "tickets", label: "工单" }];

/** 客户服务：客服微信 / 群链接（?tab=groups）/ 工单（?tab=tickets）；fixedTab = 旧版菜单「站内运营」子页 */
export function CustomerServiceCenter({ fixedTab }: { fixedTab?: Tab } = {}) {
  const sp = useSearchParams(); const router = useRouter(); const path = usePathname();
  const t = fixedTab ?? sp.get("tab"); const tab: Tab = t === "groups" ? "groups" : t === "tickets" ? "tickets" : "wechat";
  const { data, isLoading, error } = useResellerSection("customerService");
  const setTab = (v: Tab) => router.replace(v === "wechat" ? path : `${path}?tab=${v}`, { scroll: false });
  if (isLoading) return <div className="h-[60vh] rounded-2xl shimmer" />;
  const initial = { ...DEFAULT_DATA.customerService, ...(data ?? {}) };
  return <CsBody key={data ? "loaded" : "default"} initial={initial} error={error} tab={tab} setTab={setTab} legacy={!!fixedTab} />;
}

function CsBody({ initial, error, tab, setTab, legacy }: { initial: CustomerService; error: unknown; tab: Tab; setTab: (t: Tab) => void; legacy?: boolean }) {
  const [cs, setCs] = useState(initial);
  const banner = <ErrorBanner error={error} suffix="（以下为默认配置）" />;
  if (legacy) {
    if (tab === "groups") return <GroupsTab cs={cs} setCs={setCs} legacy banner={banner} />;
    if (tab === "tickets") return <>{banner}<TicketsTab /></>;
    return (
      <>
        {banner}
        <section className={cn(cardCls, "p-5")}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"><Headset size={14} />{cs.contacts.filter((c) => c.name).length} 个客服联系方式</div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">添加客服联系方式 (微信号 + 二维码), 显示在你的白标站, 客户可直接联系你的客服.</p>
        </section>
        <section className={cn(cardCls, "p-4 sm:p-5")}><ContactsTab cs={cs} setCs={setCs} /></section>
      </>
    );
  }
  return (
    <div className="w-full space-y-6 py-2">
      {banner}
      <nav role="tablist" aria-label="客户服务标签" className="flex items-center gap-1 border-b border-border/40">
        {TABS.map((x) => <button key={x.value} type="button" role="tab" aria-selected={tab === x.value} onClick={() => setTab(x.value)} className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors", tab === x.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{x.label}</button>)}
      </nav>
      <div role="tabpanel">
        {tab === "wechat" && <ContactsTab cs={cs} setCs={setCs} />}
        {tab === "groups" && <GroupsTab cs={cs} setCs={setCs} />}
        {tab === "tickets" && <TicketsTab />}
      </div>
    </div>
  );
}

const blankContact = (): ContactWechat => ({ id: uid(), name: "", wechat: "", qr: "" });

/** 二维码选择（参考站：h-20 虚线方框 + 上传按钮 + 说明） */
function QrPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (f?: File) => { if (!f) return; try { onChange(await readImage(f, PHOTO_TYPES)); } catch (e) { toast.error((e as Error).message); } finally { if (ref.current) ref.current.value = ""; } };
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-dashed border-border/50 bg-muted/20 text-muted-foreground">{value ? <img src={value} alt="二维码" className="h-full w-full object-contain" /> : <ImageIcon size={22} />}</div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2"><Button type="button" variant="secondary" className="h-8 w-fit gap-1.5 px-3 text-xs" onClick={() => ref.current?.click()}><Upload size={14} />{value ? "重新上传" : "上传二维码"}</Button>{value && <button type="button" onClick={() => onChange("")} className="text-xs text-muted-foreground hover:text-danger">移除</button>}</div>
        <span className="text-[11px] text-muted-foreground">可选, 上传后客户可扫码</span>
      </div>
      <input ref={ref} type="file" accept={PHOTO_TYPES.join(",")} className="sr-only" aria-label="上传二维码" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

function ContactsTab({ cs, setCs }: { cs: CustomerService; setCs: (c: CustomerService) => void }) {
  const save = useSaveSection();
  const [rows, setRows] = useState<ContactWechat[]>(cs.contacts.length ? cs.contacts : [blankContact()]); const [busy, setBusy] = useState(false);
  const patch = (id: string, p: Partial<ContactWechat>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const count = rows.filter((r) => r.name.trim()).length;
  const submit = async () => {
    const kept = rows.map((r) => ({ ...r, name: r.name.trim(), wechat: r.wechat.trim() })).filter((r) => r.name || r.wechat || r.qr);
    if (kept.some((r) => !r.name)) { toast.error("请填写客服名称"); return; }
    setBusy(true);
    try { const next = { ...cs, contacts: kept }; await save("customerService", next, "reseller.cs.contacts"); setCs(next); setRows(kept.length ? kept : [blankContact()]); toast.success("客服联系方式已保存"); }
    catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  const label = "text-[11px] font-semibold text-muted-foreground";
  return (
    <div className="space-y-4">
      <p className="text-xs leading-5 text-muted-foreground">添加客服联系方式 (微信号 + 二维码), 显示在你的白标站, 客户可直接联系你的客服.</p>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <article key={r.id} className="rounded-lg border border-border/50 bg-card/40 p-4 transition-colors focus-within:border-border">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="space-y-1"><label htmlFor={`cs-name-${r.id}`} className={label}>客服名称<span className="text-danger">*</span></label><input id={`cs-name-${r.id}`} value={r.name} maxLength={30} onChange={(e) => patch(r.id, { name: e.target.value })} placeholder="如: 微信客服 / 商务对接" className={fieldCls} /></div>
              <div className="flex items-end justify-end pb-0.5"><button type="button" onClick={() => setRows((x) => (x.length > 1 ? x.filter((y) => y.id !== r.id) : [blankContact()]))} aria-label={`删除 客服 ${i + 1}`} title="删除" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-danger"><Trash2 size={16} /></button></div>
            </div>
            <div className="mt-3 space-y-3">
              <div className="space-y-1"><label htmlFor={`cs-wx-${r.id}`} className={label}>微信号</label><input id={`cs-wx-${r.id}`} value={r.wechat} maxLength={40} onChange={(e) => patch(r.id, { wechat: e.target.value })} placeholder="如: wxid_xxxxxx" className={fieldCls} /></div>
              <div className="space-y-1.5"><span className={label}>二维码 (微信客服扫码加好友)</span><QrPicker value={r.qr} onChange={(qr) => patch(r.id, { qr })} /></div>
            </div>
          </article>
        ))}
        <button type="button" onClick={() => setRows((x) => [...x, blankContact()])} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"><Plus size={14} />添加客服</button>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Headset size={14} />{count} 个客服联系方式</span>
        <Button disabled={busy} onClick={submit} className="gap-2"><Save size={15} />保存</Button>
      </div>
    </div>
  );
}

const blankGroup = (): GroupLink => ({ id: uid(), name: "", platform: "wechat", url: "", qr: "", note: "" });

function GroupsTab({ cs, setCs, legacy, banner }: { cs: CustomerService; setCs: (c: CustomerService) => void; legacy?: boolean; banner?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const empty = legacy ? (
    <section className={cn(cardCls, "flex flex-col items-center justify-center px-6 py-16 text-center")}>
      <span className="mb-4 grid size-16 place-items-center rounded-full border border-border bg-muted text-muted-foreground"><MessagesSquare size={26} /></span>
      <h3 className="text-base font-semibold text-foreground">还没有客户群</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">还没添加客户群。点「立即添加」录入群名和邀请链接 / 二维码，就能一键复制分享给客户加入。</p>
      <Button className="mt-5 gap-2" onClick={() => setOpen(true)}><Plus size={16} />立即添加</Button>
    </section>
  ) : (
    <div className="pane flex flex-col items-center px-6 py-16 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary-tint text-primary"><Users size={28} /></span>
      <div className="mt-4 text-xl font-semibold">还没有客户群</div>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">还没添加客户群。点「立即添加」录入群名和邀请链接 / 二维码，就能一键复制分享给客户加入。</p>
      <button type="button" onClick={() => setOpen(true)} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 font-medium text-white hover:bg-primary-strong"><Plus size={16} />立即添加</button>
    </div>
  );
  const list = (
    <ul className="grid gap-4 md:grid-cols-2">
      {cs.groups.map((g) => (
        <li key={g.id} className={cn(cardCls, "flex gap-4 p-5")}>
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted/40 text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {g.qr ? <img src={g.qr} alt={`${g.name} 二维码`} className="h-full w-full object-contain" /> : <ImageIcon size={24} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="truncate font-semibold">{g.name}</span><span className="rounded-md bg-muted px-1.5 py-px text-xs text-muted-foreground">{PLATFORMS[g.platform] ?? "其他"}</span></div>
            {g.note && <p className="mt-1 text-sm text-muted-foreground">{g.note}</p>}
            {g.url ? <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{g.url}</p> : <p className="mt-1 text-xs text-muted-foreground">扫码加入</p>}
            <button type="button" onClick={() => copyText(g.url ? `${g.name}：${g.url}` : g.name, g.url ? "已复制群链接" : "已复制群名")} className="chip mt-3 h-9 gap-1.5 hover:bg-muted"><Copy size={14} />复制</button>
          </div>
        </li>
      ))}
    </ul>
  );
  const dialog = <Dialog open={open} onOpenChange={setOpen}>{open && <GroupsDialog cs={cs} setCs={setCs} close={() => setOpen(false)} />}</Dialog>;
  if (legacy) return (
    <div className="w-full space-y-5">
      <LegacyHead variant="plain" title="交流群" subtitle="管理客户社群入口，一键复制分享给客户。" right={<Button variant="secondary" className="gap-2" onClick={() => setOpen(true)}><Settings2 size={16} />管理群链接</Button>} />
      {banner}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Kpi label="群组数" value={cs.groups.length} icon={<MessagesSquare />} /></section>
      {cs.groups.length === 0 ? empty : list}
      {dialog}
    </div>
  );
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Users size={16} />{cs.groups.length} 个客户群</div>
      {cs.groups.length === 0 ? empty : <><div className="mb-4 flex justify-end"><button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium hover:bg-muted"><Settings2 size={16} />管理群链接</button></div>{list}</>}
      {dialog}
    </div>
  );
}

function GroupsDialog({ cs, setCs, close }: { cs: CustomerService; setCs: (c: CustomerService) => void; close: () => void }) {
  const save = useSaveSection();
  const [rows, setRows] = useState<GroupLink[]>(cs.groups.length ? cs.groups : [blankGroup()]); const [busy, setBusy] = useState(false);
  const patch = (id: string, p: Partial<GroupLink>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const kept = rows.map((r) => ({ ...r, name: r.name.trim(), url: r.url.trim(), note: r.note.trim() })).filter((r) => r.name || r.url || r.qr || r.note);
  const submit = async () => {
    for (const r of kept) {
      if (!r.name) { toast.error("请填写群名"); return; }
      if (!r.url && !r.qr) { toast.error(`「${r.name}」需填写邀请链接或上传群二维码（至少一个）`); return; }
      if (r.url && !SAFE_LINK.test(r.url)) { toast.error(`「${r.name}」的邀请链接需以 https:// 或 weixin:// 开头`); return; }
    }
    setBusy(true);
    try { const next = { ...cs, groups: kept }; await save("customerService", next, "reseller.cs.groups"); setCs(next); toast.success("群链接已保存"); close(); }
    catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  return (
    <DialogContent title="管理群链接" description="添加、删除或修改你的客户群链接。保存后可在本页一键复制，分享给客户加入社群。" className="w-[min(94vw,760px)]">
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <label className="text-sm font-medium">群名 <span className="text-danger">*</span><input value={r.name} maxLength={40} onChange={(e) => patch(r.id, { name: e.target.value })} placeholder="如:VIP 客服群" className={cn(input, "mt-1.5 font-normal")} /></label>
              <label className="text-sm font-medium">平台<select value={r.platform} onChange={(e) => patch(r.id, { platform: e.target.value })} className={cn(input, "mt-1.5 font-normal")}>{Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            </div>
            <label className="mt-3 block text-sm font-medium">邀请链接<input value={r.url} onChange={(e) => patch(r.id, { url: e.target.value })} placeholder="https:// 或 weixin://" className={cn(input, "mt-1.5 font-mono font-normal")} /></label>
            <div className="mt-3 text-sm font-medium">群二维码</div>
            <ImagePicker className="mt-1.5" value={r.qr} onChange={(qr) => patch(r.id, { qr })} label="上传二维码" removeLabel="移除" hint="可选, 微信群常用二维码 (链接或二维码至少一个)" types={PHOTO_TYPES} size={64} />
            <label className="mt-3 block text-sm font-medium">备注<input value={r.note} maxLength={100} onChange={(e) => patch(r.id, { note: e.target.value })} placeholder="可选,展示给客户的辅助说明" className={cn(input, "mt-1.5 font-normal")} /></label>
            <div className="mt-3 flex justify-end"><button type="button" onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-danger hover:bg-danger/10"><Trash2 size={14} />删除该行</button></div>
          </div>
        ))}
        <button type="button" onClick={() => setRows((x) => [...x, blankGroup()])} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm hover:bg-muted"><Plus size={16} />添加一行</button>
      </div>
      <div className="mt-5 flex items-center justify-between border-t pt-4">
        <span className="text-sm text-muted-foreground">{kept.length} 条将保存</span>
        <div className="flex gap-2"><button type="button" onClick={close} className="h-10 rounded-xl border px-5 text-sm hover:bg-muted">取消</button><button type="button" disabled={busy} onClick={submit} className="h-10 rounded-xl bg-primary px-5 text-sm font-medium text-white hover:bg-primary-strong disabled:opacity-60">保存</button></div>
      </div>
    </DialogContent>
  );
}

/** 高频代理商问题：参考站为跳转到对应功能页的链接卡 */
const FAQ = [
  { icon: Wallet, title: "提现遇到问题", sub: "提现审核 / 到账延迟 / 阈值/限额 / 退款流程", href: "/reseller/finance/withdrawals" },
  { icon: CreditCard, title: "客户充值未到账", sub: "支付方式异常 / 订单状态查询 / 重发凭证 / 工单升级", href: "/reseller/finance/income" },
  { icon: Wrench, title: "客户问题处理", sub: "客户标签 / 沉睡客户唤醒 / 高价值维护 / 投诉转单", href: "/reseller/customers/list" },
  { icon: ShieldCheck, title: "账户安全", sub: "密码 / 双因素 / OAuth / 异常登录 / API 风控", href: "/reseller/account/withdrawal" },
];

function TicketsTab() {
  // 平台客服：XOi 走主站「问题反馈」表单（@/lib/support 里的 mc:support 桥）。
  // 原来这里是 router.push("/chat") + 定时派发 mc:support —— 但 console 里既没有 /chat 路由，
  // 也没有 AppShell 接那个事件，等于点了没反应（死链 + 无监听方）。
  const goSupport = () => document.dispatchEvent(new CustomEvent("mc:support"));
  return (
    <div className="space-y-5">
      <section className={cn(cardCls, "p-6")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/[0.16] text-primary"><LifeBuoy size={20} /></span>
            <div className="min-w-0"><div className="text-sm font-semibold text-foreground">工单管理</div><p className="mt-1 text-xs leading-6 text-muted-foreground">客户工单走平台统一客服系统。点击下方按钮查看你的工单。</p></div>
          </div>
          <Button onClick={goSupport}>前往客服 →</Button>
        </div>
      </section>
      <section className="space-y-2.5">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">高频代理商问题, 点击查看完整指南</h2>
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {FAQ.map((f) => { const I = f.icon; return (
            <li key={f.title}>
              <Link href={f.href} className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))]">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary"><I size={16} /></span>
                <div className="min-w-0 flex-1"><div className="text-sm font-medium text-foreground">{f.title}</div><div className="mt-0.5 text-xs leading-5 text-muted-foreground">{f.sub}</div></div>
                <ArrowUpRight size={16} className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </Link>
            </li>
          ); })}
        </ul>
      </section>
    </div>
  );
}
