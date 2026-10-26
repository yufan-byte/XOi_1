"use client";
// 在线充值：电脑端点「立即充值」不再跳走，直接在弹框里出付款码（参考站 09-17 更新），轮询余额到账后提示并关闭
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { ArrowLeft, Check, CreditCard, ExternalLink, Loader2, MessageCircle, Ticket } from "lucide-react";
import { AccountDialog, AccountTabs } from "./account-dialog-shell";
import { toast } from "sonner";
import { api, getSelf } from "@/lib/api";
import { cn, QUOTA_PER_UNIT, fmtPoints } from "@/lib/utils";
import { openCashier, pickScanUrl, requestPay, type PayOrder } from "@/lib/pay";
import presets from "@/data/topup_presets.json";
import { usePublicSettings } from "@/components/signup/use-public-settings";

const AMOUNTS: number[] = (presets as unknown as { data: { amounts_cny: number[] } }).data.amounts_cny;
const METHODS = [
  { key: "alipay", name: "支付宝", badge: "推荐", desc: "通过所选渠道使用支付宝支付。", icon: CreditCard, tone: "primary" },
  { key: "wxpay", name: "微信支付", badge: "快速", desc: "即将跳转到支付渠道。", icon: MessageCircle, tone: "success" },
  { key: "stripe", name: "信用卡（Stripe）", badge: "快速", desc: "在安全收银台完成支付。", icon: CreditCard, tone: "primary" },
] as const;

/* 参考站 omni-tile / omni-fld / omni-btn-primary 实测值 */
const tile = (on: boolean) => cn("relative min-h-[58px] rounded-[10px] border px-[6px] py-[8px] text-[14px] font-[620] leading-[22.4px] tabular-nums transition-colors", on ? "border-primary/62 bg-primary/12 text-primary" : "border-border bg-foreground/[0.03] text-foreground hover:border-primary/35");
const label = "flex items-center gap-[5px] text-[11.5px] font-[560] leading-[18.4px] text-muted-foreground";
const submitBtn = "inline-flex items-center gap-[7px] rounded-xl border border-primary/55 bg-primary px-[18px] py-[9px] text-[13px] font-semibold leading-[16.25px] text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-50";

// PayResp / pickScanUrl / requestPay / openCashier 已抽到 @/lib/pay（招商加盟页共用同一入口）
interface Order extends PayOrder {}
const POLL_MS = 3000; const POLL_MAX_MS = 15 * 60_000;

/** 在线充值 / 卡密兑换（对接 new-api 的 /api/user/pay 与 /api/user/topup）；外观对齐参考站 460px 毛玻璃弹窗 */
export function TopupDialog({ open, onOpenChange, overlayClassName, contentClassName, transparentShell = false }: { open: boolean; onOpenChange: (v: boolean) => void; overlayClassName?: string; contentClassName?: string; transparentShell?: boolean }) {
  const qc = useQueryClient();
  const { data: st } = usePublicSettings(); // 站长设置：充值档次 / 是否允许自定义金额 / 最低充值
  const tiers = st?.topupTiers?.filter((n) => Number.isFinite(n) && n > 0).length ? st.topupTiers.filter((n) => Number.isFinite(n) && n > 0) : AMOUNTS;
  const allowCustom = st?.allowCustomAmount !== false; const minTopup = st?.minTopup && st.minTopup > 0 ? st.minTopup : 10;
  // new-api 的充值开关：在线支付渠道是否配好、卡密兑换是否开启（站长未确认合规条款时两者都为 false）、卡密购买链接（系统设置 → 充值链接）
  const { data: info } = useQuery({ queryKey: ["topup-info"], enabled: open, staleTime: 60_000, retry: false,
    queryFn: () => api<{ enable_online_topup?: boolean; enable_stripe_topup?: boolean; enable_creem_topup?: boolean; enable_waffo_topup?: boolean; enable_redemption?: boolean; topup_link?: string }>("/api/user/topup/info").catch(() => null) });
  const online = !!(info?.enable_online_topup || info?.enable_stripe_topup || info?.enable_creem_topup || info?.enable_waffo_topup);
  const redemptionOn = info?.enable_redemption !== false; const shopLink = /^https?:\/\//.test(info?.topup_link ?? "") ? info!.topup_link! : "";
  const [picked0, setTab] = useState<"pay" | "redeem">("pay");
  // 没接在线支付渠道时不摆「在线支付」页签：用户点进去选完金额才被告知「暂未开启」，是白走一趟
  const tab: "pay" | "redeem" = info && !online ? "redeem" : picked0; const [picked, setAmt] = useState<number>(AMOUNTS[0]); const [custom, setCustom] = useState(""); const [method, setMethod] = useState("alipay"); const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [customOpen, setCustomOpen] = useState(false);
  const [order, setOrder] = useState<Order | null>(null); const [expired, setExpired] = useState(false);
  // 顶栏常驻挂载：弹框关掉时在渲染阶段丢掉付款码（放 effect 里会多一轮级联渲染）
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (!open) { setOrder(null); setExpired(false); } }
  const amt = tiers.includes(picked) ? picked : tiers[0];
  const amount = custom && allowCustom ? Number(custom) || 0 : amt;
  const pay = async () => {
    if (amount < minTopup) { toast.error(`最低充值 ¥${minTopup}`); return; } setBusy(true);
    try {
      // 下单前的余额，之后只要涨了就算到账。读不到就不能下单：兜底成 0 的话，第一次轮询拿到真实余额
      // 就会判成「支付已确认，¥X 已到账」并关窗——用户其实一分钱没付。
      const me0 = await getSelf().catch(() => null);
      if (!me0) { toast.error("读取余额失败，请稍后重试"); return; }
      const startQuota = me0.quota;
      const r = await requestPay({ amount, payment_method: method, top_up_code: "" });
      const { scan, url, params } = pickScanUrl(r ?? {});
      if (!scan) { toast.info("当前环境暂未开启在线支付，请使用卡密兑换或联系客服"); return; }
      // 实付金额（含手续费 / 折扣）由 /api/user/amount 给；拿不到就按档位金额显示
      const money = await api<number | string>("/api/user/amount", { method: "POST", body: JSON.stringify({ amount, top_up_code: "" }) }).then((v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }).catch(() => null);
      const dataUrl = await QRCode.toDataURL(scan, { width: 440, margin: 1, errorCorrectionLevel: "M" });
      setExpired(false); setOrder({ dataUrl, scan, amount, money, method, url, params, startQuota });
    } catch (e) { toast.error(`当前环境暂未开启在线支付：${(e as Error).message}`); } finally { setBusy(false); }
  };
  // 出码后每 3 秒查一次余额，涨了就提示到账并关闭；15 分钟没动静视为付款码过期
  useEffect(() => {
    if (!order || !open) return;
    const startedAt = Date.now(); let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try { const me = await getSelf(); if (me.quota > order.startQuota) { stopped = true; qc.invalidateQueries({ queryKey: ["self"] }); qc.invalidateQueries({ queryKey: ["logs"] }); toast.success(`支付已确认，${fmtPoints((me.quota - order.startQuota) / QUOTA_PER_UNIT)}已到账`); setOrder(null); onOpenChange(false); return; } } catch { /* 网络抖动，下一轮再查 */ }
      if (Date.now() - startedAt > POLL_MAX_MS) { stopped = true; setExpired(true); }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [order, open, qc, onOpenChange]);
  const redeem = async () => {
    const key = code.trim(); if (!key) return; setBusy(true);
    try { const r = await api<number>("/api/user/topup", { method: "POST", body: JSON.stringify({ key }) }); toast.success(`兑换成功${typeof r === "number" ? `，已入账 ${fmtPoints(r / QUOTA_PER_UNIT)}` : ""}`); setCode(""); qc.invalidateQueries({ queryKey: ["self"] }); onOpenChange(false); }
    catch (e) { toast.error(`兑换失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  const methodName = METHODS.find((m) => m.key === method)?.name;
  if (order) {
    const scanHint = order.method === "alipay" ? "请使用支付宝扫一扫" : order.method === "wxpay" ? "请使用微信扫一扫" : "请用手机扫码打开收银台";
    return (
      <AccountDialog open={open} onOpenChange={onOpenChange} title="扫码支付" description="支付完成后自动到账，可关闭本窗口稍后在账单中查看" className="w-[min(calc(100%-32px),460px)]" overlayClassName={overlayClassName} contentClassName={contentClassName} transparentShell={transparentShell}>
        <div className="flex flex-col items-center pt-[17.6px]">
          <div className={cn("relative rounded-[14px] border border-border bg-white p-[10px]", expired && "opacity-40")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={order.dataUrl} alt="付款码" width={220} height={220} className="block h-[220px] w-[220px]" />
          </div>
          {expired && <button type="button" onClick={() => { setOrder(null); setExpired(false); }} className="mt-[-24px] rounded-full border border-border bg-card px-[12px] py-[5px] text-[12px] font-medium shadow-sm">付款码已过期，重新获取</button>}
          <p className="mt-[13px] text-[13px] font-[580] leading-[20.8px] text-foreground">{scanHint}</p>
          <p className="mt-[3px] font-mono text-[19px] font-[660] leading-[30.4px]">到账 {fmtPoints(order.amount)}</p>
          <p className="text-[11px] leading-[17.6px] text-muted-foreground">支付 ¥{(order.money ?? order.amount).toFixed(2)} · 1 元 = 10 积分</p>
          {order.money != null && Math.abs(order.money - order.amount) > 0.004 && <p className="text-[11px] leading-[17.6px] text-muted-foreground">充值 ¥{order.amount.toFixed(2)}，含渠道手续费</p>}
          <p className="mt-[8px] flex items-center gap-[6px] text-[11.5px] leading-[17.6px] text-muted-foreground">{!expired && <Loader2 className="h-[13px] w-[13px] animate-spin" />}{expired ? "长时间未支付，请重新获取付款码" : "等待支付确认…"}</p>
          <button type="button" onClick={() => openCashier(order)} className="mt-[13px] inline-flex items-center gap-[5px] text-[12px] font-medium text-primary underline-offset-2 hover:underline"><ExternalLink className="h-[13px] w-[13px]" />扫码遇到问题？在新窗口打开支付页面</button>
        </div>
        <div className="mt-[15px] flex justify-between gap-[9px] border-t border-foreground/[0.06] pt-[15px]">
          <button type="button" onClick={() => { setOrder(null); setExpired(false); }} className="inline-flex items-center gap-[6px] rounded-full border border-border px-[16px] py-[9px] text-[13px] font-semibold leading-[16.25px] text-muted-foreground hover:bg-muted"><ArrowLeft className="h-[14px] w-[14px]" />返回充值选项</button>
          <button type="button" onClick={() => onOpenChange(false)} className={submitBtn}>稍后查看</button>
        </div>
      </AccountDialog>
    );
  }
  return (
    <AccountDialog open={open} onOpenChange={onOpenChange} title={info && !online ? "卡密兑换积分" : "积分充值"} description={info && !online ? "购买卡密后在这里兑换，积分即时到账" : "1 元 = 10 积分，底层由 NewAPI 统一结算"} className="w-[min(calc(100%-32px),460px)]" overlayClassName={overlayClassName} contentClassName={contentClassName} transparentShell={transparentShell}>
      {st?.topupGuide && st.topupGuideText && (
        <div className="mt-[15px] flex flex-wrap items-center gap-3 rounded-[10px] border border-primary/30 bg-primary/8 px-3 py-2.5 text-[12px]">
          <span className="flex-1">{st.topupGuideText}</span>
          {st.topupGuideButton && (st.topupGuideUrl ? <a href={st.topupGuideUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white">{st.topupGuideButton}</a> : <button onClick={() => document.dispatchEvent(new CustomEvent("mc:support"))} className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white">{st.topupGuideButton}</button>)}
        </div>
      )}
      {(!info || online) && <AccountTabs inline value={tab} options={[["pay", "在线支付"], ["redeem", "卡密兑换"]] as const} onChange={setTab} />}
      {tab === "pay" ? (
        <div className="space-y-[13px] pt-[17.6px]">
          <div className="flex flex-col gap-[6px]">
            <label className={label}>选择积分档位<span className="text-primary">*</span></label>
            <div className="grid grid-cols-4 gap-[8px]">
              {tiers.map((a) => { const on = amount === a && !custom; return <button key={a} type="button" aria-pressed={on} onClick={() => { setAmt(a); setCustom(""); setCustomOpen(false); }} className={cn(tile(on), "flex flex-col items-center justify-center leading-tight")}>{on && <Check className="absolute right-[5px] top-[5px] h-3 w-3" />}<strong className="text-[14px]">{fmtPoints(a)}</strong><small className="mt-1 text-[10px] font-normal text-muted-foreground">支付 ¥{a.toFixed(0)}</small></button>; })}
              {allowCustom && !customOpen && <button type="button" onClick={() => setCustomOpen(true)} className={cn(tile(false), "text-[12px] font-[560] leading-[19.2px]")}>自定义金额</button>}
              {allowCustom && customOpen && <label className={cn(tile(!!custom), "flex items-center justify-center px-2")}><input autoFocus value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))} placeholder={`≥${minTopup}`} aria-label="自定义金额" className="w-full bg-transparent text-center text-[13px] outline-none" /></label>}
            </div>
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className={label}>选择支付方式</label>
            <div className="flex flex-col gap-[7px]">
              {METHODS.map((m) => { const on = method === m.key; return (
                <button key={m.key} type="button" aria-pressed={on} onClick={() => setMethod(m.key)} className={cn("flex h-[69.2px] w-full items-center gap-[10px] rounded-[10px] border px-[12px] py-[10px] text-left transition-colors", on ? "border-primary/62 bg-primary/8" : "border-border bg-foreground/[0.03] hover:border-primary/35")}>
                  <span className={cn("grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px]", m.tone === "success" ? "bg-success/18 text-success" : "bg-primary/20 text-primary")}><m.icon className="h-4 w-4" /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[8px]"><span className="flex items-center gap-[7px] text-[13px] font-[580] leading-[20.8px] text-foreground">{m.name}<span className="rounded-full bg-primary/18 px-[7px] py-[1.5px] text-[9.5px] font-[620] leading-[15.2px] text-primary">{m.badge}</span></span><span className="truncate text-[11px] leading-[17.6px] text-muted-foreground">{m.desc}</span></span>
                  <span className={cn("grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border-[1.5px]", on ? "border-primary" : "border-border")}>{on && <span className="h-[7px] w-[7px] rounded-full bg-primary" />}</span>
                </button>
              ); })}
            </div>
            <span className="text-[11px] leading-[17.6px] text-muted-foreground">使用 {methodName} 支付 ¥{amount.toFixed(2)}，到账 {fmtPoints(amount)}</span>
          </div>
          <div className="flex justify-end gap-[9px] border-t border-foreground/[0.06] pt-[15px]"><button type="button" disabled={busy || amount <= 0} onClick={pay} className={submitBtn}>{busy ? <><Loader2 className="h-[14px] w-[14px] animate-spin" />正在生成付款码…</> : <>充值<span className="font-mono">{fmtPoints(amount)}</span></>}</button></div>
        </div>
      ) : (
        <div className="space-y-[13px] pt-[17.6px]">
          {/* 卡密充值两步走：① 去站长的卡密商店购买 ② 回来粘贴兑换。链接取自 new-api「充值链接」，换店不用发版。
              兑换功能没开启时连购买入口也不给——否则用户买了卡密回来兑不了。 */}
          {!redemptionOn ? (
            <p className="rounded-[10px] border border-warning/40 bg-warning/10 px-3 py-2.5 text-[12px] leading-[19px] text-foreground/85">卡密兑换暂未开放，请联系客服充值。</p>
          ) : !shopLink ? (
            /* 没有配置XOi自己的卡密商店时，引导联系客服购买（2026-09-19：原链接指向卖 ccdan 卡密的店，用户买了兑不了） */
            <div className="flex items-center gap-3 rounded-[10px] border border-primary/30 bg-primary/[0.06] px-3 py-2.5">
              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">1</span>
              <span className="min-w-0 flex-1 text-[12px] leading-[19px]"><b className="block text-[13px] font-[600]">购买积分卡密</b><span className="text-muted-foreground">联系客服购买 XOi 卡密，兑换后按 1 元 = 10 积分到账。</span></span>
              <button type="button" onClick={() => { onOpenChange(false); document.dispatchEvent(new CustomEvent("mc:support")); }} className="inline-flex h-[32px] shrink-0 items-center gap-1 rounded-full bg-primary px-3.5 text-[12px] font-semibold text-white transition-[filter] hover:brightness-110">联系客服</button>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-[10px] border border-primary/30 bg-primary/[0.06] px-3 py-2.5">
              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">1</span>
              <span className="min-w-0 flex-1 text-[12px] leading-[19px]"><b className="block text-[13px] font-[600]">购买卡密</b><span className="text-muted-foreground">在XOi卡密商店选面值、扫码付款，付完即得卡密；只能兑换XOi卡密。</span></span>
              <a href={shopLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-[32px] shrink-0 items-center gap-1 rounded-full bg-primary px-3.5 text-[12px] font-semibold text-white transition-[filter] hover:brightness-110">去购买<ExternalLink className="h-3 w-3" /></a>
            </div>
          )}
          <div className="flex flex-col gap-[6px]">
            <label className={label}>{redemptionOn && <span className="mr-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-primary text-[10px] font-bold text-white">2</span>}卡密兑换<span className="text-primary">*</span></label>
            <label className="flex h-[46.4px] items-center gap-2 rounded-[10px] border border-border bg-foreground/[0.03] px-3 focus-within:border-primary/50"><Ticket className="h-4 w-4 text-muted-foreground" /><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="请输入卡密（支持空格分隔）" className="w-full bg-transparent text-[13px] outline-none" /></label>
            <p className="text-[11px] leading-[17.6px] text-muted-foreground">把购买到的卡密粘贴到这里；兑换后余额立即同步到您的钱包，每张卡密只能用一次。如需开具发票，请联系客服。</p>
          </div>
          <div className="flex justify-end gap-[9px] border-t border-foreground/[0.06] pt-[15px]"><button type="button" disabled={busy || !code.trim() || !redemptionOn} onClick={redeem} className={submitBtn}>立即兑换</button></div>
        </div>
      )}
    </AccountDialog>
  );
}
