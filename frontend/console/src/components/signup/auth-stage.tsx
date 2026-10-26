"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Eye, EyeOff, Globe as GlobeIcon, Loader2, Clapperboard, Lock, Mail, ShieldCheck as IconsShield, Ticket, UserRound, X } from "lucide-react";
import { Globe } from "@/components/login/globe";
import { Showreel, SHOWREEL, REEL_INTERVAL, useReducedMotion } from "@/components/login/showreel";
import { PartnerDialog } from "@/components/login/partner-dialog";
import { Filing } from "@/components/login/filing";
import { WORDS, ORBIT_MODELS, HOLD, CYCLE_S, AGE_RATE, T, sideTiming, focusFor, typedCount, createBus, type OrbitBus, type OrbitModel, type Box } from "@/components/login/orbit-data";
import { SITE } from "@/lib/site";
import { ApiError, fetchCaptcha, login, register } from "@/lib/api";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import { usePublicSettings } from "./use-public-settings";
import { consumeLoginReturn, normalizeLoginTarget } from "../../../../../shared/loginNavigation";
import {platformBrandAsset} from "../../../../../shared/platformBrand";
import {useBrand} from "@/components/shell/brand-provider";

/** 登录/注册成功后离开控制台，回到 XOi 主站（Vue）。 */
const APP_HOME = import.meta.env.VITE_APP_HOME || "/";

/**
 * 把站内路径拼到主站地址上。控制台自身的路由前缀（/console）要去掉，
 * 因为 next 参数是「登录后在主站打开哪个页面」的意思。
 */
function toAppUrl(nextPath: string): string {
    if (nextPath.startsWith("/console/")) return nextPath;
    return APP_HOME.replace(/\/$/, "") + (nextPath.startsWith("/") ? nextPath : `/${nextPath}`);
}

/** 邀请归因：/login?aff= 或 ?ref= 或 /signup?ref= 打开时写入本机，之后任意时刻注册都随 aff_code 提交 */
export const REF_KEY = "mc.ref";
export const readRef = () => { if (typeof window === "undefined") return ""; try { return localStorage.getItem(REF_KEY) ?? ""; } catch { return ""; } };

const SERIF = '"Instrument Serif", "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif';
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/** 逐字打字：字符先占位隐藏，由时钟循环按 age 切换 data-on / data-cur（光标） */
const TYPED_CSS = `.orbit-ch{visibility:hidden}.orbit-ch[data-on]{visibility:visible}.orbit-ch[data-cur]{position:relative}.orbit-ch[data-cur]::after{content:"";position:absolute;right:-3px;bottom:.12em;width:1px;height:.9em;background:currentColor;animation:caret-blink .9s steps(1) infinite}.orbit-verb .orbit-ch[data-cur]::after{width:2px;right:-7px}`
  /**
   * 矮视口等比缩放（与造物同款 5 档）。
   * 原来只有一档 `COMPACT` 收紧间距，弹窗**总高度没缩**：1366×768 的笔记本上，
   * 注册表单（邮箱+密码+确认+邀请码+条款+CTA）会超出一屏，底部按钮被裁。
   * 这里按视口高度整体缩放到 .72~.94，比裁掉按钮好。
   * `zoom` 会把 1px 边框一起缩细，浏览器做亚像素渲染，观感可接受。
   */
  + `.auth-fit{--fit:1}.auth-fit>.auth-fit-z{zoom:var(--fit)}`
  + `@media (min-width:640px) and (max-height:923px){.auth-fit{--fit:.94}}`
  + `@media (min-width:640px) and (max-height:859px){.auth-fit{--fit:.88}}`
  + `@media (min-width:640px) and (max-height:799px){.auth-fit{--fit:.81}}`
  + `@media (min-width:640px) and (max-height:739px){.auth-fit{--fit:.76}}`
  + `@media (min-width:640px) and (max-height:679px){.auth-fit{--fit:.72}}`;
/** Chrome 自动填充会把输入框刷成浅蓝底黑字，盖掉暗色玻璃样式：用不透明 inset 阴影盖回去（半径 1000px 覆盖整个输入框） */
const AUTOFILL_CSS = `.auth-glass input:-webkit-autofill,.auth-glass input:-webkit-autofill:hover,.auth-glass input:-webkit-autofill:focus{-webkit-text-fill-color:#fff;caret-color:#fff;border-radius:14px;-webkit-box-shadow:0 0 0 1000px #1e1f21 inset;box-shadow:0 0 0 1000px #1e1f21 inset;transition:background-color 99999s ease-in-out 0s}`;
/** 矮视口（笔记本 768p / 小窗）下收紧弹窗节奏，保证一屏放得下 */
const COMPACT = "[@media(max-height:800px)]";
function Typed({ text, start, erase, className, style }: { text: string; start: number; erase: number; className?: string; style?: React.CSSProperties }) {
  return <span data-typed="" data-start={start} data-erase={erase} aria-label={text} className={className} style={style}>{Array.from(text).map((ch, i) => <span key={i} className="orbit-ch" aria-hidden>{ch}</span>)}</span>;
}
function applyTyped(root: HTMLElement | null, age: number, all: boolean) {
  root?.querySelectorAll<HTMLElement>("[data-typed]").forEach((el) => {
    const chars = el.children; const n = chars.length; const erase = Number(el.dataset.erase ?? 1e9);
    const count = all ? n : typedCount(n, age, Number(el.dataset.start ?? 0), erase);
    const cur = !all && count > 0 && count < n && age < erase ? count - 1 : -1; const key = `${count}:${cur}`;
    if (el.dataset.state === key) return; el.dataset.state = key;
    for (let i = 0; i < n; i++) { chars[i].toggleAttribute("data-on", i < count); chars[i].toggleAttribute("data-cur", i === cur); }
  });
}

/** 左右聚光卡（原站 orbit-focus）：图标槽由三维场景里飞来的图标占据，文字在停靠后逐字打出 */
function FocusCard({ m, side, cycle, showImg, fade = false }: { m: OrbitModel; side: 0 | 1; cycle: number; showImg: boolean; fade?: boolean }) {
  const t = sideTiming(side); const name = side === 0 ? "left" : "right";
  return (
    <div data-focus={name} className={cn("pointer-events-none absolute top-[49%] z-10 hidden min-h-[185px] w-[190px] max-w-[19%] -translate-y-1/2 text-center transition-opacity duration-300 lg:block", fade && "opacity-0", side === 0 ? "left-[7%]" : "right-[7%]")} aria-live={side === 0 ? "polite" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-dock={name} src={m.icon} alt="" className={cn("mx-auto mb-5 block h-16 w-16 object-contain", !showImg && "invisible")} />
      <Typed key={`e${cycle}`} text={m.eb} start={t.arrive} erase={t.ret} className="block text-[12px] leading-[1.6] text-[#d6e9fb]" style={{ fontFamily: MONO }} />
      <Typed key={`n${cycle}`} text={m.name} start={t.arrive + 0.1} erase={t.ret} className="mt-2.5 block min-h-[56px] text-[18px] font-medium leading-[1.4] text-[#f1f4f2] [overflow-wrap:anywhere]" />
      <Typed key={`l${cycle}`} text={m.line} start={t.arrive + 0.2} erase={t.ret} className="mt-3 line-clamp-3 min-h-[76px] text-[13px] leading-[1.9] text-[#dfe1e6]" />
    </div>
  );
}
/* ---------- 登录弹窗内的通用控件（原站 auth-template-dialog 暗色玻璃风格） ---------- */
const inputCls = "h-[54px] w-full rounded-[20px] border border-white/12 bg-white/5 bg-[linear-gradient(rgba(34,34,34,0.38),rgba(7,7,7,0.54))] px-[17px] text-[15px] font-medium text-white outline-none transition-colors placeholder:text-white/40 hover:border-white/20 focus-visible:border-primary/55 focus-visible:ring-[3px] focus-visible:ring-primary/20";
function FieldLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="mb-2 flex min-h-[18px] items-end justify-between gap-2"><span className="text-[13px] font-semibold leading-[18px] tracking-[0.12em] text-white/66">{children}</span>{right}</div>;
}
function IconInput({ icon: I, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return <div className="relative [&_input]:pl-[46px]"><I size={16} className="pointer-events-none absolute left-[17px] top-1/2 -translate-y-1/2 text-white/78" aria-hidden />{children}</div>;
}
function PasswordInput({ value, onChange, autoComplete, withIcon }: { value: string; onChange: (v: string) => void; autoComplete: string; withIcon?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("relative", withIcon && "[&_input]:pl-[46px]")}>
      {withIcon && <Lock size={16} className="pointer-events-none absolute left-[17px] top-1/2 -translate-y-1/2 text-white/78" aria-hidden />}
      <input value={value} onChange={(e) => onChange(e.target.value)} type={show ? "text" : "password"} autoComplete={autoComplete} className={cn(inputCls, "pr-12")} />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 grid h-[34px] w-[34px] -translate-y-1/2 place-items-center rounded-full text-white/78 hover:bg-white/10" aria-label={show ? "隐藏密码" : "显示密码"}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
    </div>
  );
}
function Check({ checked, onChange, children, tone = "muted" }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; tone?: "muted" | "bright" }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-[13px] font-medium leading-[22px]", tone === "bright" ? "text-white/85" : "text-neutral-300")}>
      <span className="flex h-[22px] shrink-0 items-center"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="m-0 h-[18px] w-[18px] rounded accent-[var(--primary)]" /></span>
      <span>{children}</span>
    </label>
  );
}
type LegalKind = "terms" | "privacy";

/**
 * 条款正文。原来是 toast 弹一句摘要就完了 —— 用户勾的是「我已阅读并同意」，
 * 却没有任何可读的正式文本，合规上站不住。这里改成弹层展示，不跳页（不丢表单）。
 * 文案按 XOi 的实际能力写：AI 生成内容合规、生成物归属、数据只存必要日志。
 */
const LEGAL_TEXT: Record<LegalKind, { title: string; sections: { h: string; p: string }[] }> = {
  terms: {
    title: "用户协议",
    sections: [
      { h: "服务内容", p: "本平台提供 AI 影像创作、剧本生成、镜头导演与无限画布等工具。你可以在平台内生成图片、视频、音频与文本内容，并按实际用量结算算力费用。" },
      { h: "生成内容的合规责任", p: "你保证输入的内容不侵犯他人著作权、肖像权、商标权，不含违法违规信息。不得用于公众号传播、舆论引导、社交及直播等场景。因输入或生成内容引发的法律责任由你承担。" },
      { h: "生成物的权利归属", p: "在遵守法律法规与本协议的前提下，你通过平台生成的内容归你所有。平台不会将你的生成内容用于模型训练或对外展示，除非你主动发布到公开区域。" },
      { h: "账号与计费", p: "账号仅限本人或本企业使用，不得转借、出租或出售。算力按调用量计费，余额不足时生成任务会被拒绝；已提交到上游的任务按上游实际消耗结算。" },
      { h: "服务变更与中止", p: "平台可能因上游模型调整、合规要求或运维需要暂停部分能力，会尽早在站内公告告知。对恶意刷量、批量注册、绕过计费等行为，平台有权限制账号。" },
    ],
  },
  privacy: {
    title: "隐私政策",
    sections: [
      { h: "我们收集什么", p: "注册所需的邮箱或登录名、密码摘要；生成任务涉及的提示词与参数；计费与调用日志（时间、模型、额度、任务编号）。不收集与创作无关的个人信息。" },
      { h: "你的内容存在哪", p: "项目草稿与画布文档保存在服务器，用于跨设备恢复。浏览器本地的临时素材（blob）不会上传，换设备后需要重新选择文件。" },
      { h: "会不会用于训练", p: "不会。你的提示词与生成结果不参与任何模型训练，也不会提供给第三方用于训练。" },
      { h: "第三方上游", p: "生成需要调用第三方模型服务，必要的提示词与参数会发送给对应上游以完成本次任务。平台的界面与错误信息不会暴露上游身份。" },
      { h: "保留与删除", p: "计费日志按财务要求保留；项目与素材你可以随时删除，删除后不再计入你的存储占用。账号注销后，除法规要求保留的部分，其余数据会被清除。" },
    ],
  },
};

/** 条款入口：点开弹层，不跳页（注册填到一半不能因为看条款丢表单） */
const Legal = ({ a, b, onOpen }: { a: string; b: string; onOpen: (k: LegalKind) => void }) => (
  <>
    <a href="#" onClick={(e) => { e.preventDefault(); onOpen("terms"); }} className="font-semibold text-primary underline-offset-2 hover:underline">{a}</a>
    {" 和 "}
    <a href="#" onClick={(e) => { e.preventDefault(); onOpen("privacy"); }} className="font-semibold text-primary underline-offset-2 hover:underline">{b}</a>
  </>
);

// 「验证码登录」已移除：本站从未接入短信服务，那个 tab 是复刻参考站时照搬的空壳——
// 表单提交只弹一句提示、「获取验证码」按钮恒为 disabled，却占据三列 tab 的第一位，
// 真实用户点进去会以为注册必须短信验证而放弃。后端 new-api 也根本没有短信开关
// （SMSVerificationEnabled/PhoneVerificationEnabled 在二进制里命中 0 次）。
// new-api 的登录只按 username 查库，email 字段完全不参与匹配，所以注册时填的邮箱必须原样
// 成为 username，用户下次才登得回来。但它的注册接口把 username 硬校验在 20 字符以内
// （Go binding 的 max=20，编译进二进制，后台没有对应开关），超出的邮箱只能请用户另起一个
// 登录名。从前这里是拿邮箱前缀 + 随机后缀偷偷生成一个用户名，注册当下因为代码手里还攥着
// 它所以能自动登录，而用户回访时填的是邮箱——后端查无此人，只回一句通用的
// "Username or password is incorrect, or user has been banned"，看着像被封号。
// 于是所有用邮箱注册的人都是一次性账号。2026-09-17 由线上用户反馈发现。
// 没开邮箱验证时 new-api 会直接丢弃注册请求里的 email 字段（实测全库 email 皆空），且它
// 没有任何 API 能补写邮箱（管理员接口传 email 会返回 success 却不改，同 quota 的假成功陷阱）。
// 现在由 /api/account/register 在服务端直接写库补上，于是邮箱不论多长都能当登录名用——
// 登录查的是 `username = ? OR email = ?`，只要 email 存进去了，输邮箱就能登。
export const MAX_USERNAME = 20;

/** 邮箱装不进 20 字符的用户名时，另生成一个（取 @ 前缀 + 随机后缀，保证全局唯一）。
 *  放在组件外：随机值属于不纯操作，在组件体内调用会被 react-hooks/purity 判为渲染期不稳定。 */
export function generateUsername(id: string) {
  const base = (id.split("@")[0] || "user").replace(/[^A-Za-z0-9_]/g, "").slice(0, 13) || "user";
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}

type Tab = "password" | "team" | "register";

/** 登录后的跳转只允许站内路径。?next= 来自 URL，任何人都能构造 /login?next=https://钓鱼站，
 *  登录成功后被静默带走，用户还以为仍在本站——典型的开放重定向。只放行以单个 / 开头的路径
 *  （// 与 /\ 会被浏览器当成协议相对地址，同样要拒）。 */
export function safeNext(raw: string | null): string {
  return normalizeLoginTarget(raw);
}

/** 登录页 / 邀请注册页共用的星球舞台 + 登录注册弹窗；variant="signup" 时主按钮为「创建账号」并上报邀请点击 */
export function AuthStage({ variant = "login" }: { variant?: "login" | "signup" }) {
  const brand=useBrand();
  const sp = useSearchParams(); const signup = variant === "signup";
  // 主站/画布检测到登录态失效会带 ?expired=1 跳转过来 —— 落地即提示，别让用户莫名其妙
  useEffect(() => {
    if (sp.get("expired") === "1" && !signup) toast.error("登录已过期，请重新登录", { duration: 6000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const urlRef = (sp.get("ref") ?? sp.get("aff") ?? "").trim();
  const [storedRef] = useState(readRef);
  const aff = urlRef || storedRef; // 仅在创建账号时随 aff_code 提交
  useEffect(() => { if (urlRef) { try { localStorage.setItem(REF_KEY, urlRef); } catch {} } }, [urlRef]);
  // 造物在这里上报代理招募点击（POST /api/reseller/recruit）。
  // XOI 的代理后台属于 P3，接口还不存在，先不上报——空转的 404 只会污染控制台日志。
  // 邀请归属本身仍由 aff 参数随注册请求提交（见 submit()），不影响绑定。
  const { data: pub } = usePublicSettings(); const showInvite = !!pub?.showInviteCodeOnSignup || !!aff;
  const [invite, setInvite] = useState<string | null>(null); const inviteCode = (invite ?? aff).trim();
  const setUser = useApp((s) => s.setUser);
  const reduced = useReducedMotion();
  // Show authentication first; the decorative 3D scene must not compete with the form.
  // 默认不弹窗（与造物一致）：首屏先给模型地球，用户能看能拖；点「登录」或「注册」才开弹窗。
  // 以前默认就弹，导致 Globe 的 active=!open 恒为 false —— 地球根本不加载，首屏只剩一块空背景。
  // 仍支持 /login#auth-dialog 直接开弹窗（邀请注册页的「登录」链接依赖它）。
  const [open, setOpen] = useState(()=> typeof window!=="undefined" && window.location.hash==="#auth-dialog"); const [tab, setTab] = useState<Tab>("password");
  const [u, setU] = useState(""); const [fallbackName, setFallbackName] = useState(""); const [p, setP] = useState(""); const [p2, setP2] = useState(""); const [busy, setBusy] = useState(false);
  // 「记住我」已移除：登录会话固定 24 小时，勾不勾都一样，留着只会误导（与造物同一判断）
  const [forgot, setForgot] = useState(false);
  const submitLock=useRef(false);
  const [authError,setAuthError]=useState("");
  const [agree, setAgree] = useState({ a: false, b: false, c: false }); const [terms, setTerms] = useState(false);
  const [biz, setBiz] = useState(false);
  const [legal, setLegal] = useState<LegalKind | null>(null);
  /**
   * 输入法组合中的回车用于选词，不能当提交。
   * 不加这个，用户打「zhongwen」按回车选词会直接触发登录——以为在选字，实际已经提交了。
   * keyCode 229 是同一信号在老浏览器/旧输入法下的表现。
   */
  const blockImeSubmit = (e: React.KeyboardEvent) => {
    if ((e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229) e.preventDefault();
  };

  /**
   * 弹窗打开时把焦点给第一个输入框。
   * Radix 默认聚焦右上角关闭按钮 —— 会出现一圈蓝色 focus 环，键盘用户还得再 Tab 一次才到输入框。
   * 登录场景要的是打开就能打字。
   */
  const focusFirstInput = (e: Event) => {
    e.preventDefault();
    const root = e.currentTarget as HTMLElement | null;
    requestAnimationFrame(() => root?.querySelector<HTMLInputElement>('input:not([type="checkbox"])')?.focus());
  };
  /* ---------- 数字图形验证码闸门（XOI 后端独有，造物没有） ----------
   *   XOI 的 /api/login/* 在失败累计到阈值后会返回 HTTP 461 + { requireCaptcha, captchaId, captchaSvg, hint }。
   *   不接这一段的话，被闸门拦下的用户只会看到一句通用的「登录失败」，怎么试都过不去。
   *   公开取码端点 GET /api/login/captcha 未登录也能拿，供「换一张」使用。 */
  const [gate, setGate] = useState<{ id: string; svg: string; input: string; hint: string } | null>(null);
  const applyGate = (payload: { captchaId?: string; captchaSvg?: string; id?: string; svg?: string; hint?: string }) => {
    setGate({ id: payload.captchaId || payload.id || "", svg: payload.captchaSvg || payload.svg || "", input: "", hint: payload.hint || "" });
  };
  const refreshGate = async () => {
    try {
      const fresh = await fetchCaptcha();
      applyGate(fresh);
    } catch { /* 换码失败不打断用户 */ }
  };
  const [stage, setStage] = useState<"globe" | "work">("globe"); const [ri, setRi] = useState(0);
  const openAuth = (t: Tab) => { setTab(t); setOpen(true); };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- /login#auth-dialog 直接打开登录弹窗（邀请注册页的「登录」链接）
  useEffect(() => { if (window.location.hash === "#auth-dialog") setOpen(true); }, []);
  const nextWork = useCallback(() => setRi((i) => (i + 1) % SHOWREEL.length), []);
  const prevWork = useCallback(() => setRi((i) => (i - 1 + SHOWREEL.length) % SHOWREEL.length), []);
  // 展映舞台的滚轮 / 方向键切换（对齐参考站 orbit-transport 的操作手感）：冷却 350ms 防触控板惯性连跳
  useEffect(() => {
    if (stage !== "work" || reduced) return;
    let lockUntil = 0, acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (open || e.ctrlKey) return;
      const now = performance.now(); if (now < lockUntil) return;
      acc += e.deltaY; if (Math.abs(acc) < 30) return;
      const fwd = acc > 0; acc = 0; lockUntil = now + 350;
      fwd ? nextWork() : prevWork();
    };
    const onKey = (e: KeyboardEvent) => {
      if (open || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); nextWork(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); prevWork(); }
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", onKey); };
  }, [stage, reduced, open, nextWork, prevWork]);
  // 模型地球时钟：推进动词轮换与聚光位时间轴；逐字打字直接改 DOM，不逐帧重渲染。标签页隐藏时暂停
  const bus = useRef<OrbitBus>(createBus()); const stageRef = useRef<HTMLDivElement>(null); const heroRef = useRef<HTMLElement>(null);
  const elapsed = useRef(0); const [cycle, setCycle] = useState(0); const [gl, setGl] = useState(true);
  useEffect(() => {
    if (stage !== "globe" || open) return;
    const b = bus.current; b.reduced = reduced;
    if (reduced) { b.age = HOLD / 2; applyTyped(stageRef.current, b.age, true); return; }
    let raf = 0; let last = performance.now(); let shown = -1;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (document.hidden) return;
      elapsed.current += dt; const c = Math.floor(elapsed.current / CYCLE_S); const age = (elapsed.current - c * CYCLE_S) * AGE_RATE;
      b.cycle = c; b.age = age; b.focus = focusFor(c);
      if (c !== shown) { shown = c; setCycle(c); }
      applyTyped(stageRef.current, age, false);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [stage, reduced, open]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 无 WebGL 时聚光卡改用静态图标
  useEffect(() => {
    if (open) return;
    try {
      const context = document.createElement("canvas").getContext("webgl2");
      if (!context) setGl(false);
      else context.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { setGl(false); }
  }, [open]);
  // 文案区与聚光卡的位置交给三维场景：图标避让文字、飞入卡片图标槽
  useEffect(() => {
    const root = stageRef.current; if (!root) return; const b = bus.current;
    const measure = () => {
      const o = root.getBoundingClientRect();
      const rel = (el: Element | null): Box | null => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top } : null; };
      b.quiet = rel(heroRef.current); b.cards = [rel(root.querySelector("[data-focus=left]")), rel(root.querySelector("[data-focus=right]"))]; b.docks = [rel(root.querySelector("[data-dock=left]")), rel(root.querySelector("[data-dock=right]"))];
    };
    measure(); const ro = new ResizeObserver(measure); ro.observe(root); if (heroRef.current) ro.observe(heroRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (stage !== "work" || reduced || open) return; const t = setInterval(nextWork, REEL_INTERVAL); return () => clearInterval(t); }, [stage, reduced, ri, nextWork,open]);
  // 展映状态写入共享总线：3D 场景据此在「地球舞台」与「作品展映」之间做丝滑过渡
  useEffect(() => { const b = bus.current; b.work.active = stage === "work" && !reduced && gl; b.work.index = ri; }, [stage, ri, reduced, gl]);
  const isReg = tab === "register";
  const allAgreed = agree.a && agree.b && agree.c;
  const id = u.trim();
  // 闸门展开时，必须填了验证码才允许提交（否则一定被后端 461 打回，白跑一趟）
  const gateOk = !gate || gate.input.trim().length > 0;
  const ok = (isReg ? !!id && p.length >= 8 && p === p2 && terms : !!id && p.length >= 6 && allAgreed) && gateOk;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!ok||submitLock.current) return;
    // 不含 @ 的登录名一旦超过网关的 20 字符上限，以前会被悄悄换成随机名：用户既没有邮箱可登录，
    // 也不知道真实登录名，账号和余额就此困住。这种情况必须当场拦下让他改短。
    if (isReg && !id.includes("@") && id.length > MAX_USERNAME) { toast.error(`登录名最长 ${MAX_USERNAME} 个字符，请改短，或直接用邮箱注册`); return; }
    submitLock.current=true;setAuthError("");setBusy(true);
    // 用户名仍受 new-api 的 20 字符限制，但邮箱够短时原样用作用户名：这样即便服务端补写
    // 邮箱那一步失败，用户照样能用邮箱登录（此时它就是用户名）。只有装不下时才生成一个。
    // 在这里算而不是在渲染体里：随机值每次重渲染都会变，属于渲染期的不纯操作。
    const genUsername = isReg && id.includes("@") && id.length > MAX_USERNAME;
    const loginId = genUsername ? generateUsername(id) : id;
    const gateArgs = gate ? { captchaId: gate.id, captchaInput: gate.input.trim() } : undefined;
    try {
      // 注册即登录：XOI 的 /api/login/register 已经返回 token，不必再打一次 login。
      let authed = null;
      if (isReg) {
        const email = id.includes("@") ? id : undefined;
        authed = await register(loginId, p, email, inviteCode || undefined, gateArgs);
        try { localStorage.removeItem(REF_KEY); } catch {}
        // 邮箱没绑上时，用户名是他唯一的登录凭据——而生成的用户名他并不知道，
        // 所以这种情况要用不会自动消失的提示，别塞进一闪而过的 toast。
        if (genUsername && (!email || authed.email_bound === false)) {
          setFallbackName(loginId);
          toast.error(`邮箱未能绑定，请记住登录名：${loginId}`, { duration: Infinity });
        } else {
          toast.success("注册成功，正在进入…");
        }
      }
      const a = authed ?? (await login(loginId, p, gateArgs));
      setUser(a.user);
      setGate(null); // 成功即清闸门，回到免码常态
      toast.success(`欢迎回来，${a.user.display_name || a.user.username}`);
      // 离开控制台，回到 XOi 主站；?next= 只允许站内路径（见 safeNext 的开放重定向防护）
      window.location.replace(toAppUrl(consumeLoginReturn()));
    } catch (err) {
      // 验证码闸门：后端以 HTTP 461 + { requireCaptcha, captchaId, captchaSvg, hint } 表达
      const e461 = err as ApiError;
      const payload = (e461?.payload ?? {}) as { requireCaptcha?: boolean; captchaId?: string; captchaSvg?: string; hint?: string };
      if (e461 instanceof ApiError && (e461.code === 461 || payload.requireCaptcha)) {
        applyGate(payload);
        toast.error(payload.hint || "请填写图中数字验证码后再提交");
      } else {
        // 其它失败（凭据不符 / 用户名占用 / 网关异常）统一展示后端文案
        setAuthError((err as Error).name==="TimeoutError"?"登录验证超时，请稍后重试，不要连续提交":(err as Error).message || "登录失败，请稍后重试");
      }
    } finally { submitLock.current=false;setBusy(false); }
  };
  const word = WORDS[cycle % WORDS.length]; const work = stage === "work"; const [focusL, focusR] = focusFor(cycle);
  const agreeBox = (
    <div className={cn("space-y-3 rounded-[10px] border border-white/[0.04] bg-black/25 px-[15px] py-[13px]", `${COMPACT}:space-y-2 ${COMPACT}:py-2.5`)}>
      <p className="text-[13px] font-semibold leading-[18px] text-white">请勾选确认，方可注册/登录</p>
      <Check checked={agree.a} onChange={(v) => setAgree({ ...agree, a: v })}>我是合法企业 / 个体工商户，仅用于自身电商经营，不用于公众号传播、舆论、社交及直播等。</Check>
      <Check checked={agree.b} onChange={(v) => setAgree({ ...agree, b: v })}>我对输入内容、生成内容的合法性、知识产权承担全部责任。</Check>
      <Check checked={agree.c} onChange={(v) => setAgree({ ...agree, c: v })}>我已阅读并同意 <Legal a="用户协议" b="隐私政策" onOpen={setLegal} /></Check>
    </div>
  );
  /* 验证码闸门区块：只在后端触发风控（HTTP 461）后出现，不影响正常用户的表单长度 */
  const captchaBox = gate ? (
    <div className="space-y-3 rounded-[10px] border border-amber-300/25 bg-amber-300/[0.06] px-[15px] py-[13px]">
      <p className="text-[13px] font-semibold leading-[18px] text-amber-100">{gate.hint || "为确认是本人操作，请输入图中的数字验证码"}</p>
      <div className="flex items-center gap-3">
        <IconInput icon={IconsShield}>
          <input value={gate.input} onChange={(e) => setGate({ ...gate, input: e.target.value })} inputMode="numeric" autoComplete="off" placeholder="输入图中数字" className={inputCls} />
        </IconInput>
        <button type="button" onClick={refreshGate} className="grid h-[54px] w-[132px] shrink-0 place-items-center overflow-hidden rounded-[14px] border border-white/12 bg-white/90 p-1" aria-label="换一张验证码" title="换一张">
          {gate.svg ? <span className="block h-full w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: gate.svg }} /> : <span className="text-[12px] font-semibold text-neutral-700">换一张</span>}
        </button>
      </div>
    </div>
  ) : null;
  const cta = (label: string, disabled: boolean, type: "submit" | "button" = "submit") => (
    <button type={type} aria-busy={busy} disabled={disabled} className="inline-flex h-[53px] w-full items-center justify-center gap-2 rounded-[14px] border border-white/30 bg-[linear-gradient(rgba(255,255,255,0.2),rgba(255,255,255,0.11))] px-[17px] text-[15px] font-semibold text-white shadow-[0_10px_26px_-8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] transition duration-200 hover:bg-white/15 disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />}{busy?isReg?"正在创建账号…":"正在验证登录…":label}</button>
  );
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-black text-white">
      <div ref={stageRef} className="relative flex flex-1 flex-col" data-stage={stage} data-has-works="true">
        <style>{TYPED_CSS + AUTOFILL_CSS}</style>
        {/* 全端：模型地球舞台（展映时由 3D 场景接管：地球滑出、视频卡滑入，画布常驻不卸载）。
            手机与桌面同一套 3D 舞台（用户 2026-10-02：移动端不要渐变糊墙，要跟电脑端一样） */}
        <div className={cn("absolute inset-0 transition-opacity duration-700", work && "pointer-events-none")} aria-hidden={work}>
          <Globe className="absolute inset-0 h-full w-full" bus={bus} active={!open} reduced={reduced} />
          <FocusCard side={0} m={ORBIT_MODELS[focusL]} cycle={cycle} showImg={reduced || !gl} fade={work} />
          <FocusCard side={1} m={ORBIT_MODELS[focusR]} cycle={cycle} showImg={reduced || !gl} fade={work} />
        </div>
        {work && <Showreel index={ri} onNext={nextWork} onPrev={prevWork} reduced={reduced} media3d={!reduced && gl} />}

        <header className="relative z-30 flex h-[75px] items-center justify-between px-[11px] sm:h-[98px] sm:px-[65px]">
          {/* 造物这里是「方形图标 + 文字品牌名」两件套（它的 BrandMark 是个闭合环图形）。
              但 XOi 的官方 logo **本身就是横排字标**（X-O-i 三个字母），
              再并一个文字「XOi」会重复两遍，所以这里只留 logo、去掉文字。 */}
          <a href="/console/login" aria-label={brand.name} className="flex items-center gap-3">
            {/* XOi 官方 logo：横排字标、透明底 PNG（不能换成 BrandMark——那是造物默认图形） */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.site.logo||platformBrandAsset("logo",import.meta.env.BASE_URL)} alt={brand.name} className="h-[32px] max-w-[120px] object-contain sm:h-[40px]" draggable={false} />
            {(brand.site.name||brand.site.subtitle)&&<span className="max-w-[160px]"><strong className="block truncate text-sm">{brand.name}</strong>{!brand.site.hideSubtitle&&brand.site.subtitle&&<span className="block truncate text-xs text-white/60">{brand.site.subtitle}</span>}</span>}
          </a>
          <div className="flex items-center gap-[10px]">
            <button type="button" onClick={() => toast.info("当前仅提供中文界面")} className="hidden h-11 w-11 place-items-center rounded-2xl border border-white/12 bg-white/[0.04] text-neutral-300 hover:bg-white/10 sm:grid" aria-label="语言"><GlobeIcon size={18} /></button>
            {/* 登录页与邀请注册页都给「登录」+「注册」两个入口（站长 2026-09-19：登录旁边要有注册按钮） */}
            {signup ? <a href="/login#auth-dialog" className="grid h-[31px] place-items-center rounded-full px-[9px] text-[11px] font-[650] text-white/72 sm:h-[46px] sm:rounded-[2px] sm:border sm:border-white/15 sm:px-5 sm:text-[14px] sm:tracking-[0.01em] sm:text-[#f1f4f2] sm:hover:bg-white/10">登录</a> : <button type="button" onClick={() => setOpen(true)} className="h-[31px] rounded-full px-[9px] text-[11px] font-[650] text-white/72 sm:h-[46px] sm:rounded-[2px] sm:border sm:border-white/15 sm:px-5 sm:text-[14px] sm:tracking-[0.01em] sm:text-[#f1f4f2] sm:hover:bg-white/10">登录</button>}
              <button type="button" onClick={() => openAuth("register")} className="h-[31px] rounded-full px-[9px] text-[11px] font-[650] text-white/72 sm:h-[46px] sm:rounded-[2px] sm:border sm:border-white/15 sm:px-5 sm:text-[14px] sm:tracking-[0.01em] sm:text-[#f1f4f2] sm:hover:bg-white/10">{signup ? "创建账号" : "注册"}</button>
          </div>
        </header>

        {/* 中央文案（全端同一套打字机文案；手机字号缩小、位置上移，地球在竖屏时下移让位） */}
        <main ref={heroRef} className={cn("absolute left-1/2 top-[27%] z-20 flex w-[330px] max-w-[calc(100%-40px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center transition-opacity duration-500 sm:top-[49%] sm:w-[360px]", work && "pointer-events-none opacity-0")} aria-hidden={work}>
          <h1 className="grid w-full grid-rows-[34px_48px] gap-1 whitespace-nowrap font-bold tracking-[-0.035em] sm:grid-rows-[50px_68px]">
            <span className="block text-[30px] font-semibold leading-[34px] text-[#f1f4f2] sm:text-[42px] sm:leading-[50px]">让 AI 为你</span>
            <Typed key={`v${cycle}`} text={word.verb} start={T.verb} erase={T.heroErase} className="orbit-verb block min-h-[48px] bg-[linear-gradient(115deg,#f4fcff_12%,#b9f0ec_46%,#f4fcff_64%,#c4d6eb_90%)] bg-clip-text text-[44px] font-bold leading-[48px] text-[#b9f0ec] [-webkit-text-fill-color:transparent] [text-shadow:0_0_24px_rgba(127,187,239,0.16)] sm:min-h-[68px] sm:text-[64px] sm:leading-[68px]" />
          </h1>
          <p className="mt-[14px] min-h-[40px] w-full text-[13px] leading-6 text-[#b7bdc5] sm:mt-[18px] sm:min-h-[48px] sm:text-[14px]" aria-live="polite">
            <Typed key={`p${cycle}`} text={word.promise} start={T.line1} erase={T.heroErase} className="block font-medium text-[#f1f4f2]" />
            <Typed key={`d${cycle}`} text={word.detail} start={T.line2} erase={T.heroErase} className="block" />
          </p>
            <div className="mt-[14px] flex items-center gap-3 sm:mt-[18px]">
              <button type="button" onClick={() => openAuth("password")} className="h-10 w-[118px] rounded-[2px] border border-[#657782] bg-[#1c2228] text-[13px] font-medium text-[#d6e9fb] shadow-[inset_0_1px_0_rgba(127,187,239,0.12)] hover:bg-[#252d35] sm:h-11 sm:w-[132px]">登录</button>
              <button type="button" onClick={() => openAuth("register")} className="h-10 w-[118px] rounded-[2px] border border-white/15 bg-transparent text-[13px] font-medium text-[#b7bdc5] hover:bg-white/10 hover:text-white sm:h-11 sm:w-[132px]">{signup ? "创建账号" : "注册"}</button>
            </div>
          <button type="button" onClick={() => setBiz(true)} className="mt-2.5 hidden h-6 rounded-[10px] px-1 text-[11px] font-semibold tracking-[0.01em] text-[#b7bdc5] hover:text-white sm:block">商务合作</button>
        </main>

        {/* 进度计数 + 作品展映切换 */}
        <div className="absolute bottom-11 right-[65px] z-30 hidden flex-col items-end gap-6 sm:flex">
          <button type="button" aria-label={work ? "返回模型地球" : "作品展映"} onClick={() => setStage(work ? "globe" : "work")} className="flex h-[37px] items-center gap-2 rounded-[2px] border border-white/15 px-[14px] text-[12px] font-medium text-[#b7bdc5] hover:bg-white/10 hover:text-white">
            {work ? <GlobeIcon size={14} /> : <Clapperboard size={14} />}<span>{work ? "返回模型地球" : "作品展映"}</span>
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-3 z-20 px-4 text-center text-[11px] leading-tight text-white/55 sm:px-40">{brand.site.footer&&<p className="mx-auto mb-2 max-w-3xl whitespace-pre-wrap break-words leading-5">{brand.site.footer}</p>}<Filing /></div>
      </div>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] animate-in fade-in-0" />
          {/* 点弹框外的空白不关闭（参考站 2026-09-16 起同样如此，实测点遮罩弹框仍在）：登录表单填到一半
              误点舞台就全丢，只留右上角 × 与 Esc 两个明确的关闭方式。 */}
          <DialogPrimitive.Content onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} onOpenAutoFocus={focusFirstInput} style={{ maxWidth: "calc(528px * var(--fit, 1))", borderRadius: "calc(24px * var(--fit, 1))" }} className={cn("auth-fit auth-glass fixed left-1/2 top-4 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 overflow-y-auto overscroll-contain border border-white/[0.24] bg-white/[0.06] bg-[radial-gradient(120%_62%_at_50%_0,rgba(255,255,255,0.14),transparent_58%),radial-gradient(120%_55%_at_50%_100%,rgba(255,255,255,0.07),transparent_55%)] text-white shadow-[0_1px_2px_rgba(0,0,0,0.24),0_18px_46px_-26px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.26),inset_0_-1px_0_rgba(255,255,255,0.06)] outline-none backdrop-blur-[36px] backdrop-saturate-[1.7] animate-in fade-in-0 zoom-in-95 sm:top-1/2 sm:max-h-[92dvh] sm:-translate-y-1/2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25", `${COMPACT}:pb-4`)}>
            <DialogPrimitive.Title className="sr-only">{isReg ? "创建账号" : "登录"}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{isReg ? "创建一个账号即可解锁工作台创建、账户控制和增长工作流。" : "统一入口管理 AI 工作台、算力资源与模型市场"}</DialogPrimitive.Description>
            <DialogPrimitive.Close className="absolute right-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-[10px] border border-white/[0.04] bg-black/20 text-neutral-300/70 transition-all hover:-translate-y-0.5 hover:text-white" aria-label="关闭"><X size={18} /></DialogPrimitive.Close>
            <div className={cn("auth-fit-z px-5 pb-8 pt-8 sm:px-8", `${COMPACT}:pb-5 ${COMPACT}:pt-6`)}>
              <h1 className={cn("bg-[linear-gradient(#fff,rgba(255,255,255,0.96)_40%,rgba(255,255,255,0.66))] bg-clip-text px-10 text-center text-[40px] font-normal leading-[52px] tracking-[-0.015em] text-transparent sm:text-[48px] sm:leading-[60px]", `${COMPACT}:text-[32px] ${COMPACT}:leading-[42px]`, `sm:${COMPACT}:text-[40px]`, `sm:${COMPACT}:leading-[50px]`)} style={{ fontFamily: SERIF }}>{isReg ? "创建账号" : "欢迎登录"}</h1>
              <div className="mt-2 flex justify-end"><button type="button" className="h-[41px] rounded-[10px] px-[14px] text-[13px] font-semibold text-white/72 hover:bg-white/5 hover:text-white" onClick={() => setBiz(true)}>商务合作</button></div>

              {!isReg && (
                <div role="tablist" className={cn("mt-4 grid grid-cols-2 gap-1 rounded-[14px] border border-white/[0.054] bg-black/30 p-1", `${COMPACT}:mt-3`)}>
                  {([["password", "密码登录"], ["team", "团队登录"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-[10px] px-1.5 py-[11px] text-[13px] font-semibold transition-colors", tab === k ? "bg-white/5 text-white" : "text-neutral-300 hover:text-white")}>{l}</button>)}
                </div>
              )}

              <form onSubmit={submit} onKeyDown={blockImeSubmit} aria-busy={busy} className={cn("mt-5 space-y-5", `${COMPACT}:mt-4 ${COMPACT}:space-y-3.5`)}>
                  {authError?<p role="alert" className="rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-sm leading-6 text-red-200">{authError}</p>:null}
                  <fieldset disabled={busy} className="contents">
                  {isReg ? (
                    <>
                      <div>
                        <FieldLabel>邮箱</FieldLabel>
                        <IconInput icon={Mail}><input value={u} onChange={(e) => setU(e.target.value)} autoComplete="email" className={inputCls} /></IconInput>
                        {!!id && <p className="mt-2 text-[13px] leading-[18px] text-neutral-300/70">以后就用这个{id.includes("@") ? "邮箱" : "名字"}登录</p>}
                      </div>
                      {!!fallbackName && (
                        <div className="rounded-[10px] border border-amber-300/30 bg-amber-300/10 px-[15px] py-[13px]">
                          <p className="text-[13px] font-semibold leading-[18px] text-amber-100">邮箱未能绑定，请记住你的登录名</p>
                          <p className="mt-1 select-all text-[15px] font-semibold tracking-wide text-white">{fallbackName}</p>
                          <p className="mt-1 text-[13px] leading-[18px] text-amber-100/80">这个邮箱超过 {MAX_USERNAME} 个字符，装不进用户名，而绑定邮箱这一步没有成功。请用上面这个登录名登录，或联系客服。</p>
                        </div>
                      )}
                      <div><FieldLabel>密码</FieldLabel><PasswordInput value={p} onChange={setP} autoComplete="new-password" withIcon /><p className="mt-2 text-[13px] leading-[18px] text-neutral-300/70">密码至少需要 8 个字符</p></div>
                      <div><FieldLabel>确认密码</FieldLabel><PasswordInput value={p2} onChange={setP2} autoComplete="new-password" withIcon />{p2 && p2 !== p && <p className="mt-2 text-[13px] leading-[18px] text-red-300">两次输入的密码不一致</p>}</div>
                      {showInvite && <div><FieldLabel>邀请码（选填）</FieldLabel><IconInput icon={Ticket}><input value={invite ?? aff} onChange={(e) => setInvite(e.target.value)} placeholder="有邀请码就填这里" className={inputCls} /></IconInput></div>}
                      <Check checked={terms} onChange={setTerms} tone="bright">我同意 <Legal a="服务条款" b="隐私政策" onOpen={setLegal} /></Check>
                      {captchaBox}
                      {cta("创建账号", !ok || busy)}
                      {!terms && <p className="text-center text-[13px] leading-[18px] text-neutral-300/82">请先勾选并同意服务条款</p>}
                      {inviteCode && <p className="text-center text-[13px] leading-[18px] text-primary">已通过邀请链接注册，注册后将与邀请人绑定</p>}
                    </>
                  ) : (
                    <>
                      <div>
                        <FieldLabel>邮箱或登录名</FieldLabel>
                        <IconInput icon={UserRound}><input value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" className={inputCls} placeholder="注册时填的邮箱或登录名" /></IconInput>
                        {tab === "team" && <p className="mt-2 text-[11px] font-medium leading-[18px] text-neutral-300">同一邮箱有团队员工账号时选「团队登录」</p>}
                      </div>
                      <div>
                        <FieldLabel right={<a className="text-[13px] font-medium text-neutral-300 hover:text-white" href="#" aria-expanded={forgot} onClick={(e) => { e.preventDefault(); setForgot((v) => !v); }}>忘记密码？</a>}>密码</FieldLabel>
                        <PasswordInput value={p} onChange={setP} autoComplete="current-password" />
                        {forgot && (
                          <div className="mt-3 rounded-[14px] border border-white/10 bg-black/30 px-[14px] py-[12px] text-[13px] leading-[20px] text-neutral-200">
                            <p className="mb-1.5 font-semibold text-white">找回密码请联系客服人工重置</p>
                            <p className="text-neutral-300">提供注册邮箱或登录名，以及一笔充值订单号，核实身份后为你重置。站内暂不支持自助找回。</p>
                          </div>
                        )}
                      </div>
                      {agreeBox}
                      {captchaBox}
                      {cta("登录", !ok || busy)}
                    </>
                  )}
                  </fieldset>
              </form>
              <p className={cn("mt-5 text-center text-[15px] font-medium text-neutral-300", `${COMPACT}:mt-4`)}>{isReg ? <>已有账号？ <button type="button" className="font-semibold text-primary" onClick={() => setTab("password")}>登录</button></> : <>还没有账号？ <button type="button" className="font-semibold text-primary" onClick={() => setTab("register")}>创建账号</button></>}</p>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <PartnerDialog open={biz} onOpenChange={setBiz} />
      {/* 条款弹层：不跳页，关掉后表单内容原样还在。玻璃质感与登录弹窗同一套，层级压在它之上 */}
      {legal && (
        <DialogPrimitive.Root open onOpenChange={(v) => { if (!v) setLegal(null); }}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/55 animate-in fade-in-0" />
            <DialogPrimitive.Content
              className="fixed left-1/2 top-1/2 z-[60] max-h-[84dvh] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-[24px] border border-white/[0.24] bg-white/[0.06] bg-[radial-gradient(120%_62%_at_50%_0,rgba(255,255,255,0.14),transparent_58%)] px-6 py-7 text-white shadow-[0_18px_46px_-26px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.26)] outline-none backdrop-blur-[36px] backdrop-saturate-[1.7] animate-in fade-in-0 zoom-in-95 sm:px-8"
            >
              <DialogPrimitive.Title className="bg-[linear-gradient(#fff,rgba(255,255,255,0.96)_40%,rgba(255,255,255,0.66))] bg-clip-text text-[28px] leading-[36px] text-transparent" style={{ fontFamily: SERIF }}>
                {LEGAL_TEXT[legal].title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">{LEGAL_TEXT[legal].title}正文</DialogPrimitive.Description>
              <DialogPrimitive.Close className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/20 text-neutral-300/80 transition-colors hover:text-white" aria-label="关闭"><X size={16} /></DialogPrimitive.Close>
              <div className="mt-5 space-y-4">
                {LEGAL_TEXT[legal].sections.map((section) => (
                  <section key={section.h}>
                    <h3 className="text-[14px] font-semibold leading-6 text-white">{section.h}</h3>
                    <p className="mt-1 text-[13px] leading-[22px] text-neutral-300">{section.p}</p>
                  </section>
                ))}
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </div>
  );
}
