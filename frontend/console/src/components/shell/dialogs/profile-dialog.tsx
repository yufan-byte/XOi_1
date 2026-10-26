"use client";
// 资料与安全：个人资料 / 安全 / 偏好 / 关于（用户菜单弹窗版，结构与参考站一致，与 /settings 页面共用同一套 new-api 接口）
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { Brain, ChevronRight, CircleUser, Download, Eraser, Eye, EyeOff, Gift, Loader2, MessageSquareWarning, Monitor, Moon, Pencil, ScrollText, ShieldCheck, Sun, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useSelf } from "@/lib/queries";
import { useApp } from "@/store/app";
import { cn, quotaToUsd, fmtPoints } from "@/lib/utils";
import { useBot } from "@/components/agents/super/bot-store";
import { BotAvatar } from "@/components/agents/super/bot-avatar";
import { BotDialog } from "@/components/agents/super/bot-dialog";
import { AccountDialog, AccountSectionTitle, AccountTabs, accountInputCls, accountLabelCls, accountPrimaryBtn, accountSecondaryBtn } from "./account-dialog-shell";

const TABS = [["profile", "个人资料"], ["security", "安全"], ["prefs", "偏好"], ["about", "关于"]] as const;
type Tab = (typeof TABS)[number][0];
const AVATAR_KEY = "mc.avatar";
const readLocal = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLocal = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };

const SectionHead = ({ title, sub }: { title: string; sub?: string }) => <div><h2 className="text-[16.5px] font-semibold leading-[18.15px]">{title}</h2>{sub && <p className="mt-[4.4px] text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">{sub}</p>}</div>;

/** Agent 记忆卡片（共用超级智能体 useBot 存储） */
function MemoryCard() {
  const { memory, memoryEnabled, setMemory, setMemoryEnabled } = useBot();
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(memory);
  const exportMd = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`# Agent 记忆\n\n${memory}\n`], { type: "text/markdown;charset=utf-8" })); a.download = "agent-memory.md"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); toast.success("记忆已导出"); };
  const ghost = "inline-flex h-[35px] items-center gap-[6.6px] rounded-[6px] border border-border/70 bg-card/75 px-[11px] text-[13.2px] font-semibold leading-[17.6px] transition-colors hover:bg-muted disabled:opacity-50";
  return (
    <section className="rounded-[14px] border border-border/80 bg-card p-[22px]">
      <div className="flex gap-[13.2px]">
        <span className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-[10px] border border-primary/20 bg-primary/10 text-primary"><Brain size={20} /></span>
        <div className="pt-[2.2px]"><h2 className="text-[15.4px] font-semibold leading-[22px]">Agent 记忆</h2><p className="mt-[4.4px] text-[13.2px] font-medium leading-[22px] text-muted-foreground">Agent 跨会话维护的一份记忆文档，新对话自动生效；可直接编辑。</p></div>
      </div>
      <div className="mt-[17.6px] flex flex-wrap items-center justify-between gap-[13.2px] border-t border-border/70 pt-[13.2px]">
        <span className="flex gap-[8px]"><button type="button" onClick={exportMd} disabled={!memory.trim()} className={ghost}><Download className="h-[15px] w-[15px]" />导出 Markdown</button>{!editing && <button type="button" className={ghost} onClick={() => { setDraft(memory); setEditing(true); }}><Pencil className="h-[15px] w-[15px]" />编辑</button>}</span>
        <label className="flex items-center gap-[8.8px] text-[13.2px] leading-[17.6px]"><span>启用 Agent 记忆</span><Switch checked={memoryEnabled} onCheckedChange={setMemoryEnabled} aria-label="启用 Agent 记忆" /></label>
      </div>
      <div className="mt-[17.6px]">
        {editing ? (
          <>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} aria-label="编辑记忆文档" placeholder={"- 用户叫我小创\n- 用户偏好简洁的要点式回答"} className="w-full rounded-[6px] border border-border bg-muted/60 px-[13.2px] py-[8px] text-[13.2px] leading-[22px] outline-none focus:ring-2 focus:ring-ring/40" />
            <div className="mt-[4px] flex items-center justify-between text-[11.5px] text-muted-foreground"><span>{draft.length} / 4000 字</span><span className="flex gap-[8px]"><button type="button" className={ghost} onClick={() => { setDraft(memory); setEditing(false); }}>取消</button><button type="button" className={cn(accountPrimaryBtn, "h-[35px] px-[14px] text-[13.2px]")} onClick={() => { if (draft.length > 4000) return toast.error("超出字数上限，请精简后再保存"); setMemory(draft.trim()); setEditing(false); toast.success("已保存"); }}>保存</button></span></div>
          </>
        ) : memory.trim() ? <div className="max-h-[160px] overflow-y-auto whitespace-pre-wrap text-[13.2px] leading-[22px]">{memory}</div> : <p className="text-[15.4px] leading-[22px] text-muted-foreground">还没有记忆。你可以在对话中让 Agent 记住重要信息，或点击编辑手动添加。</p>}
      </div>
    </section>
  );
}

function ProfileTab() {
  const user = useApp((s) => s.user); const setUser = useApp((s) => s.setUser); const { data: self, refetch, isLoading } = useSelf();
  const avatarKey = `${AVATAR_KEY}.${user?.username ?? "anon"}`;
  const [name, setName] = useState(self?.display_name ?? user?.display_name ?? ""); const [avatar, setAvatar] = useState(() => readLocal(avatarKey) ?? self?.avatar ?? "");
  const [emailEdit, setEmailEdit] = useState(false); const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const balance = self ? quotaToUsd(self.quota) : null; const curEmail = self?.email || user?.email || "";
  const pickFile = (f: File | undefined) => { if (!f) return; if (f.size > 2 * 1024 * 1024) { toast.error("头像图片请小于 2MB"); return; } const r = new FileReader(); r.onload = () => setAvatar(String(r.result)); r.readAsDataURL(f); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) { toast.error("请输入显示名称"); return; } setBusy(true);
    try { await api("/api/user/self", { method: "PUT", body: JSON.stringify({ display_name: name.trim() }) }); writeLocal(avatarKey, avatar || null); toast.success("个人资料已更新。"); const s = await refetch(); if (s.data) setUser(s.data); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const saveEmail = async () => {
    const v = email.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast.error("请输入有效的邮箱地址"); return; } setBusy(true);
    try { await api("/api/user/self", { method: "PUT", body: JSON.stringify({ email: v }) }); const s = await refetch(); if (s.data?.email === v) { setUser(s.data); toast.success("邮箱更换成功，新邮箱待验证。"); setEmailEdit(false); } else toast.info("邮箱需通过验证码绑定，请通过原站绑定流程"); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <section>
        <SectionHead title="个人资料" sub="账号、安全与绑定状态" />
        <div className="my-[22px] flex items-center justify-between rounded-[10px] border border-border/60 bg-card/40 px-[17.6px] py-[13.2px]">
          <span className="text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">积分余额</span>
          <span className="font-mono text-[15.4px] font-semibold leading-[22px] text-[oklch(0.769_0.188_70.08)]">{balance == null ? "…" : fmtPoints(balance)}</span>
        </div>
        <form onSubmit={save}>
          <div className="mb-[17.6px] flex items-center gap-[17.6px]">
            <span className="grid h-[70px] w-[70px] shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatar ? <img src={avatar} alt="头像" className="h-full w-full object-cover" /> : <CircleUser aria-label="未设置头像" className="h-[35px] w-[35px] text-muted-foreground" />}
            </span>
            <button type="button" className={cn(accountSecondaryBtn, "bg-muted")} onClick={() => fileRef.current?.click()}><Upload className="h-[18px] w-[18px]" />上传头像</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="上传头像" onChange={(e) => pickFile(e.target.files?.[0])} />
          </div>
          <div className="mb-[17.6px]"><label htmlFor="pf-name" className={accountLabelCls}>显示名称</label><input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} className={cn(accountInputCls, "bg-card")} /></div>
          <div className="mb-[17.6px]"><label htmlFor="pf-avatar" className={accountLabelCls}>头像链接</label><input id="pf-avatar" type="url" value={avatar.startsWith("data:") ? "" : avatar} onChange={(e) => setAvatar(e.target.value)} placeholder={avatar.startsWith("data:") ? "已选择本地图片" : "头像链接"} className={cn(accountInputCls, "bg-card")} /></div>
          <div className="mb-[17.6px]">
            <div className="mb-[13.2px] flex items-start justify-between gap-[13.2px]">
              <div className="min-w-0"><p className="text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">邮箱</p><p className="mt-[4.4px] truncate text-[15.4px] font-medium leading-[22px]">{isLoading ? "邮箱待同步" : curEmail || "未绑定"}</p></div>
              <span className="mt-[10px] inline-flex shrink-0 items-center rounded-full border border-border bg-card/30 px-[8.8px] py-[2.2px] text-[13.2px] font-semibold leading-[17.6px]">{curEmail ? "已验证" : "未验证"}</span>
            </div>
            {emailEdit ? (
              <div className="flex gap-[8px]"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new@example.com" aria-label="新邮箱" className={cn(accountInputCls, "bg-card")} autoFocus /><button type="button" disabled={busy} className={cn(accountPrimaryBtn, "h-[42px] shrink-0")} onClick={saveEmail}>保存</button><button type="button" className={cn(accountSecondaryBtn, "shrink-0")} onClick={() => setEmailEdit(false)}>取消</button></div>
            ) : <div className="flex justify-end"><button type="button" className="h-[33px] rounded-[6px] border border-border bg-card px-[13.2px] text-[13.2px] font-medium leading-[17.6px] transition-colors hover:bg-muted" onClick={() => { setEmail(curEmail); setEmailEdit(true); }}>更换邮箱</button></div>}
          </div>
          <div className="border-t border-border pt-[17.6px]"><button type="submit" disabled={busy} className={accountPrimaryBtn}>保存</button></div>
        </form>
      </section>
      <MemoryCard />
    </>
  );
}

function PwField({ id, label, value, onChange, placeholder, auto }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string; auto: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mb-[17.6px]">
      <label htmlFor={id} className={accountLabelCls}>{label}</label>
      <div className="relative flex rounded-[4px] border border-border bg-muted">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={auto} className="h-[40px] w-full rounded-[4px] bg-transparent py-[4.4px] pl-[13.2px] pr-[44px] text-[15.4px] font-medium outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/40" />
        <button type="button" aria-label={show ? "隐藏密码" : "显示密码"} onClick={() => setShow(!show)} className="absolute right-[12px] top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}</button>
      </div>
    </div>
  );
}

function SecurityTab() {
  const { data: self } = useSelf();
  const phone = (self as (typeof self & { phone?: string }) | undefined)?.phone || "";
  const [mode, setMode] = useState<"password" | "sms">("password");
  const [pw, setPw] = useState({ cur: "", next: "", confirm: "" }); const [busy, setBusy] = useState(false);
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); if (mode === "sms") { toast.info("当前账号未绑定手机号"); return; }
    if (pw.next.length < 8 || !/[A-Za-z]/.test(pw.next) || !/\d/.test(pw.next)) { toast.error("新密码至少 8 字符，且包含字母与数字"); return; } if (pw.next !== pw.confirm) { toast.error("两次输入的新密码不一致"); return; } setBusy(true);
    try { await api("/api/user/self", { method: "PUT", body: JSON.stringify({ password: pw.next, original_password: pw.cur }) }); toast.success("密码修改成功。"); setPw({ cur: "", next: "", confirm: "" }); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <section>
        <h2 className="text-[16.5px] font-semibold leading-[18.15px]">手机号</h2>
        <div className="mt-[22px] flex items-center justify-between gap-[13.2px] rounded-[14px] border border-border bg-muted px-[17.6px] py-[13.2px]">
          <span className="truncate text-[15.4px] font-medium leading-[22px] text-muted-foreground">{phone || "未关联"}</span>
          <button type="button" className={cn(accountSecondaryBtn, "shrink-0")} onClick={() => toast.info("暂不支持手机号绑定，请使用邮箱登录")}>{phone ? "更换手机" : "绑定手机"}</button>
        </div>
      </section>
      <section className="rounded-[14px] border border-border bg-card p-[26.4px]">
        <h2 className="text-[16.5px] font-semibold leading-[18.15px]">修改密码</h2>
        <form className="mt-[22px]" onSubmit={changePw}>
          <div className="mb-[17.6px] flex flex-col gap-[8.8px]">
            <div role="tablist" className="flex h-[56px] rounded-[6px] border border-black/[0.06] bg-[linear-gradient(rgba(255,255,255,0.45),rgba(255,255,255,0.48))] p-[3px] text-muted-foreground shadow-[0_1px_0_rgba(17,17,17,0.05)] dark:border-white/[0.06] dark:bg-none">
              {([["password", "原密码修改"], ["sms", "短信验证修改"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={cn("flex h-[48px] flex-1 items-center justify-center gap-[6.6px] rounded-[4px] border px-[8.8px] py-[4.4px] text-[15.4px] font-semibold leading-[22px] transition-colors", mode === k ? "border-primary/30 bg-primary-tint text-foreground" : "border-transparent text-foreground/60 hover:text-foreground")}>{l}</button>)}
            </div>
            {!phone && <p className="text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">当前账号未绑定手机号</p>}
            {mode === "password" && <div role="tabpanel"><PwField id="pw-cur" label="当前密码" value={pw.cur} onChange={(v) => setPw({ ...pw, cur: v })} placeholder="••••••••" auto="current-password" /></div>}
          </div>
          {mode === "password" && <>
            <PwField id="pw-next" label="新密码" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} placeholder="至少 8 字符, 含字母与数字" auto="new-password" />
            <PwField id="pw-confirm" label="确认密码" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} placeholder="再次输入新密码" auto="new-password" />
          </>}
          <button type="submit" disabled={busy || (mode === "sms" && !phone)} className={cn(accountPrimaryBtn, "w-full px-[17.6px]")}>更新密码</button>
        </form>
      </section>
    </>
  );
}

function PrefsTab() {
  const { theme, setTheme } = useTheme(); const [bot, setBot] = useState(false);
  const opts = [["light", "清爽模式", Sun], ["dark", "深色", Moon], ["system", "跟随系统", Monitor]] as const;
  return (
    <div>
      <div>
        <AccountSectionTitle>主题</AccountSectionTitle>
        <div className="grid gap-[8.8px]">{opts.map(([k, l, I]) => <button key={k} type="button" onClick={() => setTheme(k)} className={cn("flex h-[50px] items-center gap-[8.8px] rounded-[10px] border px-[17.6px] py-[13.2px] text-[15.4px] font-medium leading-[22px] transition-colors", (theme ?? "system") === k ? "border-primary/40 bg-primary-tint text-primary" : "border-border bg-muted text-muted-foreground hover:text-foreground")}><I className="h-[18px] w-[18px]" />{l}</button>)}</div>
      </div>
      <div className="mt-[17.6px] border-t border-border pt-[17.6px]">
        <AccountSectionTitle>Bot 形象</AccountSectionTitle>
        <div className="flex items-center justify-between gap-[13.2px] rounded-[14px] border border-border bg-muted px-[17.6px] py-[13.2px]">
          <div className="flex min-w-0 items-center gap-[13.2px] pr-[8.8px]"><BotAvatar size={36} /><div className="min-w-0"><p className="text-[15.4px] font-medium leading-[22px]">智能体 Bot 形象</p><p className="mt-[2.2px] text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">用于通用智能体页面的角色形象</p></div></div>
          <button type="button" onClick={() => setBot(true)} className="h-[40px] shrink-0 rounded-[4px] border border-border/70 bg-card/75 px-[13.2px] text-[15.4px] font-semibold leading-[22px] transition-colors hover:bg-muted">自定义</button>
        </div>
      </div>
      <BotDialog open={bot} onOpenChange={setBot} />
    </div>
  );
}

function AboutTab() {
  const user = useApp((s) => s.user);
  const rows: [typeof Gift, string, string, () => void][] = [
    [Gift, "分享奖励", "复制邀请链接，邀请好友注册获得奖励", () => { navigator.clipboard.writeText(`${location.origin}/login?aff=${user?.aff_code || user?.id || ""}`); toast.success("邀请链接已复制"); }],
    [MessageSquareWarning, "意见反馈", "告诉我们哪里做得好，哪里需要改进", () => document.dispatchEvent(new CustomEvent("mc:support"))],
    [ScrollText, "用户协议", "查看服务边界、计费规则与账户责任", () => toast.info("用户协议：使用本站即同意遵守 AI 生成内容相关法律法规，生成内容版权归用户所有。")],
    [ShieldCheck, "隐私政策", "了解我们如何收集与使用您的数据", () => toast.info("隐私政策：作品与项目数据保存在您的浏览器本地，服务器仅记录必要的计费日志。")],
  ];
  const viaSupport = (what: string) => { toast.info(`${what}需人工核验，请联系客服办理`); document.dispatchEvent(new CustomEvent("mc:support")); };
  return (
    <div>
      <section className="rounded-[14px] border border-border bg-card p-[26.4px]">
        <div className="mb-[17.6px]"><h3 className="text-[13.2px] font-semibold leading-[17.6px] text-muted-foreground">关于与反馈</h3></div>
        <ul className="grid gap-[8.8px] sm:grid-cols-2">
          {rows.map(([I, t, d, fn]) => <li key={t}><button type="button" onClick={fn} className="flex h-[68px] w-full items-center gap-[13.2px] rounded-[10px] border border-border/60 bg-muted px-[15.4px] py-[13.2px] text-left transition-colors hover:bg-muted/70"><span className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-[6px] border border-border/60 bg-white dark:bg-card"><I className="h-[18px] w-[18px] text-primary" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[15.4px] font-semibold leading-[22px]">{t}</span><span className="block truncate text-[13.2px] font-medium leading-[17.6px] text-muted-foreground">{d}</span></span><ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" /></button></li>)}
        </ul>
      </section>
      <section className="rounded-[14px] border border-danger/40 bg-danger/5 p-[26.4px]">
        <div className="flex gap-[13.2px]">
          <TriangleAlert className="mt-[2.2px] h-[22px] w-[22px] shrink-0 text-danger" />
          <div className="min-w-0"><h3 className="text-[15.4px] font-semibold leading-[22px] text-danger">注销账号</h3><p className="mt-[4.4px] text-[13.2px] font-medium leading-[22px] text-muted-foreground">注销后账号将停用，邮箱/手机号释放可重新注册。账号余额将随之失效，请先消费或提现。有未结提现时无法注销。</p><button type="button" onClick={() => viaSupport("注销账号")} className="mt-[17.6px] inline-flex h-[42px] items-center rounded-[6px] border border-danger/50 px-[17.6px] text-[15.4px] font-medium text-danger transition-colors hover:bg-danger/10">注销账号</button></div>
        </div>
      </section>
      <button type="button" onClick={() => viaSupport("格式化账号")} className="mt-[13.2px] flex h-[50px] w-full items-center justify-center gap-[8.8px] rounded-[16px] border border-danger/40 bg-danger/5 px-[17.6px] text-[15.4px] font-semibold text-danger transition-colors hover:bg-danger/10"><Eraser className="h-[18px] w-[18px]" />格式化账号<span className="rounded-full border border-danger/40 bg-danger/10 px-[8.8px] py-[2.2px] text-[10px] font-bold leading-[14.3px]">慎重点击</span></button>
    </div>
  );
}

/** 用户菜单 → 资料与安全 */
export function ProfileDialog({ open, onOpenChange, initialTab = "profile" }: { open: boolean; onOpenChange: (v: boolean) => void; initialTab?: Tab }) {
  const qc = useQueryClient(); const { isLoading } = useSelf(open);
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => { if (open) qc.invalidateQueries({ queryKey: ["self"] }); }, [open, qc]);
  const handleOpen = (v: boolean) => { if (!v) setTab(initialTab); onOpenChange(v); };
  return (
    <AccountDialog open={open} onOpenChange={handleOpen} title="资料与安全" description="集中管理资料、绑定和密码">
      <AccountTabs value={tab} options={TABS} onChange={setTab} />
      <div className="pt-[17.6px]">
        {isLoading && tab !== "prefs" && tab !== "about" ? <div className="flex items-center gap-[8.8px] text-[15.4px] text-muted-foreground"><Loader2 className="h-[18px] w-[18px] animate-spin" />加载中...</div> : <>
          {tab === "profile" && <ProfileTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "prefs" && <PrefsTab />}
          {tab === "about" && <AboutTab />}
        </>}
      </div>
    </AccountDialog>
  );
}
