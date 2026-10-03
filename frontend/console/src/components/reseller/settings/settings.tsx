"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronRight, Coins, Copy, Globe2, Handshake, Megaphone, Plus, ScrollText, Ticket, Trash2, UserCog, Wallet } from "lucide-react";
import { CurrentPanel, ErrorBanner, MiniSwitch, RowsCard, SaveRow, SetRow } from "@/components/reseller/legacy/frame";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useResellerAll, useSaveSection } from "@/lib/reseller/client";
import { useApp } from "@/store/app";
import { DEFAULT_DATA, type AuditEntry, type SettingsConfig } from "@/lib/reseller/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dateTimeFull } from "@/components/reseller/common";

function Card({ icon, title, desc, children }: { icon: React.ReactNode; title?: string; desc?: string; children: React.ReactNode }) {
  if (!title) return <section className="rounded-[16px] border border-border/50 bg-card p-5">{children}</section>;
  return <section><header className="mb-3"><h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><span className="text-muted-foreground [&_svg]:size-4">{icon}</span>{title}</h2>{desc && <p className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</p>}</header><div>{children}</div></section>;
}
/** 参考站设置行：左 200px 标题说明｜右 控件 */
function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 border-b border-border/30 py-3 last:border-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center sm:gap-4"><div className="min-w-0"><div className="text-sm font-medium text-foreground">{title}</div>{desc && <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{desc}</div>}</div><div className="min-w-0 sm:w-full">{children}</div></div>;
}
/** 左右等宽二选一按钮（On / Off） */
function Seg({ value, onChange, labels = ["On", "Off"] }: { value: boolean; onChange: (v: boolean) => void; labels?: [string, string] }) {
  const b = (on: boolean) => cn("rounded-md border px-3 py-2 text-xs font-semibold transition-all duration-150 hover:-translate-y-0.5", on ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 bg-card text-foreground");
  return <div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={value} onClick={() => onChange(true)} className={b(value)}>{labels[0]}</button><button type="button" aria-pressed={!value} onClick={() => onChange(false)} className={b(!value)}>{labels[1]}</button></div>;
}
const fieldCls = "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/50";
const LinkCard = ({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) => (
  <Link href={href} className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-card/30 px-4 py-3 text-sm transition-colors hover:bg-muted/40"><div className="flex min-w-0 items-center gap-3"><span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span><div className="min-w-0"><div className="font-medium text-foreground">{title}</div><div className="mt-0.5 text-xs leading-5 text-muted-foreground">{desc}</div></div></div><ChevronRight size={16} className="shrink-0 text-muted-foreground" /></Link>
);

/** 充值档次规则：1-20 档，至少 1 档 ≥¥10，任一 ≤¥10000，整数不重复（留空 = 平台默认） */
export function validateTiers(tiers: number[]) {
  if (tiers.length === 0) return null;
  if (tiers.length > 20) return "自定义档次最多 20 档";
  if (tiers.some((t) => !Number.isInteger(t) || t <= 0)) return "档次需为正整数";
  if (new Set(tiers).size !== tiers.length) return "档次不能重复";
  if (tiers.some((t) => t > 10000)) return "单个档次不能超过 ¥10000";
  if (!tiers.some((t) => t >= 10)) return "至少需要 1 档 ≥ ¥10";
  return null;
}

export type SettingsPart = "push" | "withdrawal" | "topup" | "invite" | "signup" | "become" | "other";
/** 账户设置；only= 仅渲染某一张卡片（旧版菜单「账号管理」子页） */
export function AccountSettings({ only }: { only?: SettingsPart } = {}) {
  const show = (k: SettingsPart) => !only || only === k;
  const all = useResellerAll(); const save = useSaveSection();
  const [s, setS] = useState<SettingsConfig>(DEFAULT_DATA.settings); const [tiers, setTiers] = useState<string[]>([]); const [busy, setBusy] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 用服务端配置初始化表单
  useEffect(() => { if (all.data) { const v = { ...DEFAULT_DATA.settings, ...all.data.settings }; setS(v); setTiers(v.topupTiers.map(String)); } }, [all.data]);
  const set = <K extends keyof SettingsConfig>(k: K, v: SettingsConfig[K]) => setS((x) => ({ ...x, [k]: v }));
  const persist = async (key: string, next: SettingsConfig, action: string, ok: string) => {
    setBusy(key); try { await save("settings", next, action); toast.success(ok); } catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setBusy(""); }
  };
  const saveNotify = () => { if (s.notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.notifyEmail)) { toast.error("请输入有效的通知邮箱"); return; } persist("notify", s, "settings.notify.update", "通知规则已保存"); };
  const saveTiers = () => {
    const nums = tiers.map((t) => t.trim()).filter(Boolean).map(Number); const err = validateTiers(nums); if (err) { toast.error(err); return; }
    if (!(s.minTopup >= 0) || !Number.isInteger(s.minTopup)) { toast.error("最低充值额需为非负整数"); return; }
    const next = { ...s, topupTiers: nums }; setS(next); persist("tiers", next, "settings.topup_tiers.update", "充值档次已保存");
  };
  const saveInvite = () => { if (!(s.inviteRate >= 0 && s.inviteRate <= 12)) { toast.error("返利比例需在 0-12% 之间"); return; } persist("invite", s, "settings.user_invite.update", "用户邀请设置已保存"); };
  if (all.isLoading) return <div className="h-96 rounded-[16px] shimmer" />;
  if (only) return <LegacyAccount part={only} s={s} set={set} tiers={tiers} setTiers={setTiers} busy={busy} error={all.error} saved={{ ...DEFAULT_DATA.settings, ...all.data?.settings }} onSave={{ push: saveNotify, topup: saveTiers, invite: saveInvite, signup: () => persist("signup", s, "settings.signup.update", "注册页设置已保存"), become: () => persist("become", s, "settings.become_reseller.update", "成为代理入口设置已保存") }} />;
  return (
    <div className="space-y-10">
      {all.isError && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{(all.error as Error).message}（以下为默认配置）</div>}
      {show("push") && <Card icon={<Bell size={18} />} title={only ? undefined : "推送设置"} desc={only ? undefined : "把关键运营通知集中起来，避免注册和佣金消息沉在私人邮箱。"}>
        <Row title="通知邮箱" desc="财务与运营通知都会发到这里。"><input type="email" aria-label="通知邮箱" value={s.notifyEmail} onChange={(e) => set("notifyEmail", e.target.value)} placeholder="ops@example.com" className={fieldCls} /></Row>
        <Row title="新注册通知" desc="每当新的下游客户完成注册时发送通知。"><Seg value={s.notifyRegister} onChange={(v) => set("notifyRegister", v)} /></Row>
        <Row title="佣金变动通知" desc="当佣金入账或被调整时推送提醒。"><Seg value={s.notifyCommission} onChange={(v) => set("notifyCommission", v)} /></Row>
        <div className="mt-4 flex flex-wrap items-center gap-2"><Button className="h-auto rounded-md px-3.5 py-2 text-xs font-bold" disabled={busy === "notify"} onClick={saveNotify}>{only ? "保存" : "保存通知规则"}</Button></div>
      </Card>}

      {show("withdrawal") && !only && <Card icon={<Wallet size={18} />} title={only ? undefined : "提现设置"} desc={only ? undefined : "绑定财务审核、当日提现和异常处理所使用的收款账户。"}>
        <LinkCard href="/reseller/finance?tab=payout-accounts" icon={<Wallet size={18} />} title="收款账号管理" desc="统一在「财务管理 → 收款账号」绑定支付宝/银行卡/微信收款方式" />
      </Card>}

      {show("topup") && <Card icon={<Coins size={18} />} title={only ? undefined : "充值档次"} desc={only ? undefined : "设置白标用户充值页的金额档次与最低充值额 (留空用平台默认)"}>
        <Row title="最低充值额" desc="用户单次充值不得低于此金额 (¥, 0 = 不限制)"><div className="flex items-center gap-1.5"><span className="text-sm text-muted-foreground">¥</span><input type="number" min={0} step={1} aria-label="最低充值额" value={s.minTopup} onChange={(e) => set("minTopup", Number(e.target.value))} placeholder="0" className={fieldCls} /></div></Row>
        <Row title="允许自填金额" desc="关闭后用户只能选下方档次, 不能输入任意金额"><Seg value={s.allowCustomAmount} onChange={(v) => set("allowCustomAmount", v)} /></Row>
        <Row title="自定义档次" desc="用户充值页显示的金额按钮 (留空用平台默认档次)">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {tiers.map((t, i) => <label key={i} className="flex h-8 items-center gap-1 rounded-md border border-border/60 bg-card pl-2.5 pr-1 text-xs"><span className="text-muted-foreground">¥</span><input type="number" min={1} max={10000} value={t} onChange={(e) => setTiers((x) => x.map((v, j) => (j === i ? e.target.value : v)))} className="w-16 bg-transparent outline-none" /><button type="button" onClick={() => setTiers((x) => x.filter((_, j) => j !== i))} className="grid size-6 place-items-center rounded hover:bg-muted" aria-label="删除档次"><Trash2 size={12} /></button></label>)}
              <button type="button" disabled={tiers.length >= 20} onClick={() => setTiers((t) => [...t, ""])} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-50"><Plus size={14} />添加档次</button>
            </div>
            {tiers.length === 0 && <p className="text-[11px] text-muted-foreground">未设档次, 白标用户用平台默认档次</p>}
            <p className="text-[11px] text-muted-foreground">平台规则: 自定义需 1-20 档, 至少 1 档 ≥¥10, 任一 ≤¥10000, 整数不重复</p>
          </div>
        </Row>
        <Row title="充值引导" desc="在用户充值弹窗里自定义说明文案, 并加一个引导按钮"><Seg value={!!s.topupGuide} onChange={(v) => set("topupGuide", v)} labels={["开启", "关闭"]} /></Row>
        {s.topupGuide && <div className="grid gap-3 md:grid-cols-3"><input value={s.topupGuideText ?? ""} maxLength={80} onChange={(e) => set("topupGuideText", e.target.value)} placeholder="弹窗说明（默认：快速给账户充值）" className={fieldCls} /><input value={s.topupGuideButton ?? ""} maxLength={12} onChange={(e) => set("topupGuideButton", e.target.value)} placeholder="引导按钮文字" className={fieldCls} /><input value={s.topupGuideUrl ?? ""} onChange={(e) => set("topupGuideUrl", e.target.value)} placeholder="按钮链接 https://" className={fieldCls} /></div>}
        <div className="mt-4 flex flex-wrap items-center gap-2"><Button className="h-auto rounded-md px-3.5 py-2 text-xs font-bold" disabled={busy === "tiers"} onClick={saveTiers}>{only ? "保存" : "保存充值档次"}</Button></div>
      </Card>}

      {show("invite") && <Card icon={<Megaphone size={18} />} title={only ? undefined : "用户邀请"} desc={only ? undefined : "开启后，你站点下的每位用户都会获得专属邀请码；好友充值时，邀请人可获得返利。返利从你的利润里发放，平台费用不变。"}>
        <Row title="开启用户邀请" desc="开启后用户面出现「我的推广」入口，用户可分享邀请码。"><Seg value={s.userInvite} onChange={(v) => set("userInvite", v)} labels={["开启", "关闭"]} /></Row>
        <Row title="返利比例" desc="邀请人从好友每次充值中获得的比例，最高 12%。"><div className="flex items-center gap-1.5"><input type="number" min={0} max={12} step="0.5" aria-label="返利比例" value={s.inviteRate} onChange={(e) => set("inviteRate", Number(e.target.value))} placeholder="0" className={cn(fieldCls, "w-32")} /><span className="text-sm text-muted-foreground">%</span><span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">上限 12%</span></div></Row>
        <Row title="返利形式" desc="选择邀请人获得的奖励形式。">
          <div role="radiogroup" aria-label="返利形式" className="grid grid-cols-2 gap-2">
            {([["credits", "算力 ⚡", "直接进入邀请人余额，可用于消费"], ["cash", "现金佣金", "进入可提现佣金余额（7 天到账冷却）"]] as const).map(([v, t, dsc]) => <button key={v} type="button" role="radio" aria-checked={s.inviteReward === v} onClick={() => set("inviteReward", v)} className={cn("rounded-md border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55", s.inviteReward === v ? "border-primary/55 bg-primary/10 text-foreground" : "border-border/55 bg-card text-muted-foreground hover:border-border hover:text-foreground")}><div className="text-sm font-semibold">{t}</div><div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{dsc}</div></button>)}
          </div>
        </Row>
        <Row title="邀请链接域名" desc="用户「我的推广」页复制到的分享链接，使用哪种域名前缀。">
          <div role="radiogroup" aria-label="邀请链接域名" className="grid grid-cols-2 gap-2">
            {([["subdomain", "二级域名", "使用平台分配给你的二级域名前缀", false], ["custom", "独立域名", "尚未开通独立域名", true]] as const).map(([v, t, dsc, off]) => { const on = (s.inviteDomain ?? "subdomain") === v; return <button key={v} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => set("inviteDomain", v)} className={cn("rounded-md border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55", on ? "border-primary/55 bg-primary/10 text-foreground" : "border-border/55 bg-card text-muted-foreground hover:border-border hover:text-foreground")}><div className="text-sm font-semibold">{t}</div><div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{dsc}</div></button>; })}
          </div>
        </Row>
        <div className="mt-4 rounded-md border border-border/40 bg-card/30 p-3.5"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">用户面预览</div><p className="mt-2 text-sm leading-6 text-foreground">分享你的邀请码，好友充值你即可获得 {Number.isFinite(s.inviteRate) ? s.inviteRate : 0}% 返利（{s.inviteReward === "credits" ? "算力" : "现金佣金"}）。</p></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><Button className="h-auto rounded-md px-3.5 py-2 text-xs font-bold" disabled={busy === "invite"} onClick={saveInvite}>保存</Button></div>
      </Card>}

      {show("signup") && <Card icon={<Ticket size={18} />} title={only ? undefined : "注册页邀请码"} desc={only ? undefined : "控制面向客户的注册页是否显示手填邀请码框。跟「用户邀请」推广员裂变分佣是两回事，互不影响。"}>
        <Row title="在注册页显示邀请码框" desc="关闭后注册页不再显示手填邀请码框；通过邀请链接（?ref）、子域或白标品牌自动带入的归因仍然生效，拉新归属不受影响。"><Seg value={s.showInviteCodeOnSignup} onChange={(v) => set("showInviteCodeOnSignup", v)} /></Row>
        <div className="mt-4 flex flex-wrap items-center gap-2"><Button className="h-auto rounded-md px-3.5 py-2 text-xs font-bold" disabled={busy === "signup"} onClick={() => persist("signup", s, "settings.signup.update", "注册页设置已保存")}>{only ? "保存" : "保存注册页设置"}</Button></div>
      </Card>}

      {show("become") && only && <Card icon={<Handshake size={18} />} title={only ? undefined : "成为代理入口"} desc={only ? undefined : "控制顶栏「成为代理」入口的显隐；关闭后普通访客/用户不再看到该按钮，已经是代理的用户不受影响。"}>
        <Row title="在顶栏显示「成为代理」入口" desc="关闭后普通访客/用户的顶栏不再显示「成为代理」按钮；已经是代理的用户仍可从顶栏进入「代理商中心」。"><Seg value={s.showBecomeReseller ?? true} onChange={(v) => set("showBecomeReseller", v)} /></Row>
        <Row title="点击「成为代理」时直接弹出客服弹窗" desc="开启后，代理站里的用户点击顶栏「成为代理」不再跳转申请页，而是直接弹出你在「站内运营 · 客服微信」配置的客服（名称 / 联系方式 / 二维码）。"><Seg value={!!s.becomeResellerPopup} onChange={(v) => set("becomeResellerPopup", v)} /></Row>
        <div className="mt-4 flex flex-wrap items-center gap-2"><Button className="h-auto rounded-md px-3.5 py-2 text-xs font-bold" disabled={busy === "become"} onClick={() => persist("become", s, "settings.become_reseller.update", "成为代理入口设置已保存")}>保存</Button></div>
      </Card>}

      {!only && <Card icon={<ScrollText size={18} />} title="其它配置">
        <div className="grid gap-2 md:grid-cols-3">
          <LinkCard href="/reseller/site/info" icon={<Globe2 size={18} />} title="网站配置" desc="品牌名 / 客服电话 / 邮箱 / 公司信息 / ICP / 自定义域名" />
          <LinkCard href="/reseller/models?tab=pricing" icon={<Ticket size={18} />} title="价格设置" desc="直客加价 / 下游加价 / 邀请奖励 / 新用户赠金" />
          <LinkCard href="/reseller/recruit" icon={<Handshake size={18} />} title="开通下游代理商" desc="团队转售 / 长期佣金 / 多级结构" />
        </div>
      </Card>}
    </div>
  );
}

/** 「当前生效」条目（读取已保存的配置） */
function effectiveItems(v: SettingsConfig, part: SettingsPart, affCode: string): [string, string][] {
  return part === "push" ? [["通知邮箱", v.notifyEmail || "未设置"], ["注册通知", v.notifyRegister ? "开" : "关"], ["分佣通知", v.notifyCommission ? "开" : "关"]]
    : part === "topup" ? [["最低充值", v.minTopup ? `¥${v.minTopup}` : "未设置"], ["档位数量", `${v.topupTiers.length} 档`], ["允许自填", v.allowCustomAmount ? "允许" : "不允许"], ["弹窗说明", v.topupGuideText || "快速给账户充值 (默认)"], ["引导按钮", v.topupGuide && v.topupGuideButton ? v.topupGuideButton : "未开启"]]
    : part === "invite" ? [["裂变开关", v.userInvite ? "开启" : "关闭"], ["分佣比例", `${v.inviteRate}%`], ["发放形式", v.inviteReward === "credits" ? "算力" : "现金"], ["链接域名", v.inviteDomain === "custom" ? "独立域名" : "二级域名"]]
    : part === "signup" ? [["邀请码框", v.showInviteCodeOnSignup ? "显示" : "隐藏"], ["我的邀请码", affCode || "—"]]
    : part === "become" ? [["成为代理入口", v.showBecomeReseller ?? true ? "显示" : "隐藏"], ["点击方式", v.becomeResellerPopup ? "弹出客服" : "跳转申请页"]] : [];
}

type LegacySave = Record<"push" | "topup" | "invite" | "signup" | "become", () => void>;
const radioCls = (on: boolean) => cn("rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55", on ? "border-primary bg-primary/10 text-foreground" : "border-border/60 bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground");

/** 旧版菜单「账号管理」子页：当前生效 + 设置行卡（开关）+ 保存（参考站 max-w-3xl 布局） */
function LegacyAccount({ part, s, set, tiers, setTiers, busy, error, saved, onSave }: { part: SettingsPart; s: SettingsConfig; set: <K extends keyof SettingsConfig>(k: K, v: SettingsConfig[K]) => void; tiers: string[]; setTiers: React.Dispatch<React.SetStateAction<string[]>>; busy: string; error: unknown; saved: SettingsConfig; onSave: LegacySave }) {
  const affCode = useApp((st) => (st.user as { aff_code?: string } | null)?.aff_code ?? "");
  const busyKey = part === "push" ? "notify" : part === "topup" ? "tiers" : part;
  const copyCode = async () => { if (!affCode) return; try { await navigator.clipboard.writeText(affCode); toast.success("已复制"); } catch { toast.error("复制失败"); } };
  const save = onSave[part as keyof LegacySave];
  return (
    <>
      <ErrorBanner error={error} suffix="（以下为默认配置）" />
      <CurrentPanel items={effectiveItems(saved, part, affCode)} />
      {part === "signup" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
          <div className="min-w-0"><p className="text-sm font-medium text-foreground">我的专属邀请码</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">分享此码，新用户注册即自动归因到你名下。</p></div>
          <span className="group inline-flex items-center gap-1.5"><span className="font-mono text-xs text-muted-foreground">{affCode || "—"}</span><button type="button" onClick={copyCode} disabled={!affCode} aria-label="复制邀请码" className="inline-flex size-6 items-center justify-center rounded-lg border border-transparent text-muted-foreground/70 outline-none transition-colors duration-150 hover:border-border hover:text-primary disabled:opacity-40"><Copy size={13} /></button></span>
        </div>
      )}
      <RowsCard>
        {part === "push" && <>
          <SetRow title="通知邮箱" desc="财务与运营通知都会发到这里。"><input type="email" aria-label="通知邮箱" value={s.notifyEmail} onChange={(e) => set("notifyEmail", e.target.value)} placeholder="ops@example.com" className={legacyField} /></SetRow>
          <SetRow title="新注册通知" desc="每当新的下游客户完成注册时发送通知。"><MiniSwitch label="新注册通知" checked={s.notifyRegister} onCheckedChange={(v) => set("notifyRegister", v)} /></SetRow>
          <SetRow title="佣金变动通知" desc="当佣金入账或被调整时推送提醒。"><MiniSwitch label="佣金变动通知" checked={s.notifyCommission} onCheckedChange={(v) => set("notifyCommission", v)} /></SetRow>
        </>}
        {part === "topup" && <>
          <SetRow title="最低充值额" desc="用户单次充值不得低于此金额 (¥, 0 = 不限制)"><div className="flex flex-col gap-1.5"><div className="flex items-center gap-1.5"><span className="text-sm text-muted-foreground">¥</span><input type="number" min={0} step={1} aria-label="最低充值额" value={s.minTopup || ""} onChange={(e) => set("minTopup", Number(e.target.value))} placeholder="0" className={cn(legacyField, "w-40")} /></div></div></SetRow>
          <SetRow title="允许自填金额" desc="关闭后用户只能选下方档次, 不能输入任意金额"><MiniSwitch label="允许自填金额" checked={s.allowCustomAmount} onCheckedChange={(v) => set("allowCustomAmount", v)} /></SetRow>
          <SetRow title="自定义档次" desc="用户充值页显示的金额按钮 (留空用平台默认档次)">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {tiers.map((t, i) => <label key={i} className="flex h-8 items-center gap-1 rounded-lg border border-border/70 bg-card pl-2.5 pr-1 text-xs"><span className="text-muted-foreground">¥</span><input type="number" min={1} max={10000} value={t} onChange={(e) => setTiers((x) => x.map((v, j) => (j === i ? e.target.value : v)))} className="w-16 bg-transparent outline-none" aria-label={`档次 ${i + 1}`} /><button type="button" onClick={() => setTiers((x) => x.filter((_, j) => j !== i))} className="grid size-6 place-items-center rounded hover:bg-muted" aria-label="删除档次"><Trash2 size={12} /></button></label>)}
                <button type="button" disabled={tiers.length >= 20} onClick={() => setTiers((t) => [...t, ""])} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"><Plus size={14} />添加档次</button>
              </div>
              {tiers.length === 0 && <p className="text-[11px] text-muted-foreground">未设档次, 白标用户用平台默认档次</p>}
              <p className="text-[11px] text-muted-foreground">平台规则: 自定义需 1-20 档, 至少 1 档 ≥¥10, 任一 ≤¥10000, 整数不重复</p>
            </div>
          </SetRow>
        </>}
        {part === "invite" && <>
          <SetRow title="开启用户邀请" desc="开启后用户面出现「我的推广」入口，用户可分享邀请码。"><MiniSwitch label="开启用户邀请" checked={s.userInvite} onCheckedChange={(v) => set("userInvite", v)} /></SetRow>
          <SetRow title="返利比例" desc="邀请人从好友每次充值中获得的比例，最高 12%。"><div className="flex flex-col gap-1.5"><div className="flex items-center gap-1.5"><input type="number" min={0} max={12} step="0.5" aria-label="返利比例" value={s.inviteRate || ""} onChange={(e) => set("inviteRate", Number(e.target.value))} placeholder="0" className={cn(legacyField, "w-32")} /><span className="text-sm text-muted-foreground">%</span><span className="rounded-md bg-primary/[0.14] px-2 py-0.5 text-[11px] font-medium text-primary">上限 12%</span></div></div></SetRow>
          <SetRow title="返利形式" desc="选择邀请人获得的奖励形式。">
            <div role="radiogroup" aria-label="返利形式" className="grid grid-cols-2 gap-2">{([["credits", "算力 ⚡", "直接进入邀请人余额，可用于消费"], ["cash", "现金佣金", "进入可提现佣金余额（7 天到账冷却）"]] as const).map(([v, t, dsc]) => <button key={v} type="button" role="radio" aria-checked={s.inviteReward === v} onClick={() => set("inviteReward", v)} className={radioCls(s.inviteReward === v)}><div className="text-sm font-semibold">{t}</div><div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{dsc}</div></button>)}</div>
          </SetRow>
          <SetRow title="邀请链接域名" desc="用户「我的推广」页复制到的分享链接，使用哪种域名前缀。">
            <div role="radiogroup" aria-label="邀请链接域名" className="grid grid-cols-2 gap-2">{([["subdomain", "二级域名", "使用平台分配给你的二级域名前缀", false], ["custom", "独立域名", "尚未开通独立域名", true]] as const).map(([v, t, dsc, off]) => { const on = (s.inviteDomain ?? "subdomain") === v; return <button key={v} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => set("inviteDomain", v)} className={radioCls(on)}><div className="text-sm font-semibold">{t}</div><div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{dsc}</div></button>; })}</div>
          </SetRow>
        </>}
        {part === "signup" && <SetRow title="在注册页显示邀请码框" desc="关闭后注册页不再显示手填邀请码框；通过邀请链接（?ref）、子域或白标品牌自动带入的归因仍然生效，拉新归属不受影响。"><MiniSwitch label="在注册页显示邀请码框" checked={s.showInviteCodeOnSignup} onCheckedChange={(v) => set("showInviteCodeOnSignup", v)} /></SetRow>}
        {part === "become" && <>
          <SetRow title="在顶栏显示「成为代理」入口" desc="关闭后普通访客/用户的顶栏不再显示「成为代理」按钮；已经是代理的用户仍可从顶栏进入「代理商中心」。"><MiniSwitch label="在顶栏显示「成为代理」入口" checked={s.showBecomeReseller ?? true} onCheckedChange={(v) => set("showBecomeReseller", v)} /></SetRow>
          <SetRow title="点击「成为代理」时直接弹出客服弹窗" desc="开启后，代理站里的用户点击顶栏「成为代理」不再跳转申请页，而是直接弹出你在「站内运营 · 客服微信」配置的客服（名称 / 联系方式 / 二维码）。"><MiniSwitch label="点击「成为代理」时直接弹出客服弹窗" checked={!!s.becomeResellerPopup} onCheckedChange={(v) => set("becomeResellerPopup", v)} /></SetRow>
        </>}
      </RowsCard>
      {part === "topup" && (
        <section className="mt-4 rounded-2xl border border-border bg-card px-5 py-1.5">
          <SetRow title="充值引导" desc="在用户充值弹窗里自定义说明文案, 并加一个引导按钮"><MiniSwitch label="充值引导" checked={!!s.topupGuide} onCheckedChange={(v) => set("topupGuide", v)} /></SetRow>
          {s.topupGuide && <div className="grid gap-3 pb-4 md:grid-cols-3"><input value={s.topupGuideText ?? ""} maxLength={80} onChange={(e) => set("topupGuideText", e.target.value)} placeholder="弹窗说明（默认：快速给账户充值）" aria-label="弹窗说明" className={legacyField} /><input value={s.topupGuideButton ?? ""} maxLength={12} onChange={(e) => set("topupGuideButton", e.target.value)} placeholder="引导按钮文字" aria-label="引导按钮文字" className={legacyField} /><input value={s.topupGuideUrl ?? ""} onChange={(e) => set("topupGuideUrl", e.target.value)} placeholder="按钮链接 https://" aria-label="按钮链接" className={legacyField} /></div>}
        </section>
      )}
      {part === "invite" && <div className="rounded-2xl border border-border bg-card p-5"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">用户面预览</div><p className="mt-2 text-sm leading-6 text-foreground">分享你的邀请码，好友充值你即可获得 {Number.isFinite(s.inviteRate) ? s.inviteRate : 0}% 返利（{s.inviteReward === "credits" ? "算力" : "现金佣金"}）。</p></div>}
      {save && <SaveRow><Button disabled={busy === busyKey} onClick={save}>保存</Button></SaveRow>}
    </>
  );
}
const legacyField = "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-primary/50";

function AuditLog() {
  const q = useQuery({ queryKey: ["reseller", "audit"], queryFn: () => api<AuditEntry[]>("/api/reseller/audit") });
  const [action, setAction] = useState(""); const [actor, setActor] = useState("");
  const rows = useMemo(() => q.data ?? [], [q.data]); const actions = useMemo(() => [...new Set(rows.map((r) => r.action))], [rows]); const actors = useMemo(() => [...new Set(rows.map((r) => r.actorEmail))], [rows]);
  const list = rows.filter((r) => (!action || r.action === action) && (!actor || r.actorEmail === actor));
  const hash = (ip: string) => { if (!ip || ip === "—") return "—"; let h = 2166136261; for (const c of ip) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); };
  return (
    <section className="pane p-6">
      <div className="text-lg font-semibold">审计记录</div>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2"><span className="w-24 text-sm text-muted-foreground">按操作筛选</span><button onClick={() => setAction("")} className={cn("chip h-8", !action && "chip-active")}>全部</button>{actions.map((a) => <button key={a} onClick={() => setAction(a)} className={cn("chip h-8 font-mono text-xs", action === a && "chip-active")}>{a}</button>)}</div>
        <div className="flex flex-wrap items-center gap-2"><span className="w-24 text-sm text-muted-foreground">按操作者筛选</span><button onClick={() => setActor("")} className={cn("chip h-8", !actor && "chip-active")}>全部</button>{actors.map((a) => <button key={a} onClick={() => setActor(a)} className={cn("chip h-8", actor === a && "chip-active")}>{a}</button>)}</div>
      </div>
      {q.isLoading ? <div className="mt-4 h-40 rounded-xl shimmer" /> : q.isError ? <div className="mt-4 text-sm text-danger">加载失败：{(q.error as Error).message}</div> : list.length === 0 ? <div className="mt-4 rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">暂无审计记录</div> : (
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">操作者角色</th><th>操作者邮箱</th><th>操作</th><th>目标类型</th><th>目标 ID</th><th>时间</th><th>IP 哈希</th></tr></thead>
          <tbody>{list.map((r) => <tr key={r.id} className="border-t"><td className="py-2.5">{r.actorRole}</td><td>{r.actorEmail}</td><td className="font-mono text-xs">{r.action}</td><td>{r.targetType}</td><td className="font-mono text-xs">{r.targetId}</td><td className="text-muted-foreground">{dateTimeFull(r.at)}</td><td className="font-mono text-xs text-muted-foreground">{hash(r.ip)}</td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}

/** 设置：账户设置 / 操作日志（?tab=audit） */
export function SettingsView() {
  const sp = useSearchParams(); const router = useRouter(); const tab = sp.get("tab") === "audit" ? "audit" : "account";
  return (
    <div className="w-full max-w-4xl space-y-6 py-2">
      <nav role="tablist" aria-label="设置标签" className="flex items-center gap-1 border-b border-border/40">
        {([["account", "账户设置", UserCog], ["audit", "操作日志", ScrollText]] as const).map(([v, l, I]) => <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => router.replace(v === "audit" ? "/reseller/settings?tab=audit" : "/reseller/settings", { scroll: false })} className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors", tab === v ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}><I size={14} />{l}</button>)}
      </nav>
      {tab === "account" ? <AccountSettings /> : <AuditLog />}
    </div>
  );
}
