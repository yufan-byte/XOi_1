"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, Coins, Copy, CreditCard, FileText, Globe, Handshake, Headphones, LayoutDashboard, LayoutGrid, LogOut, Menu, Moon, Receipt, Search, Settings, Sparkles, Sun, Tag, Type, Users, Check, Gift, Wallet } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "./brand";
import { useBrand } from "./brand-provider";
import { Avatar } from "@/components/ui/avatar";
import { Tip } from "@/components/ui/tooltip";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { useApp } from "@/store/app";
import { logout } from "@/lib/api";
import { useSelf } from "@/lib/queries";
import { cn, fmtCny, quotaToUsd } from "@/lib/utils";
import { AnnouncementsDialog } from "./dialogs/announcements";
import { PriceDialog } from "./dialogs/price-dialog";
import { TopupDialog } from "./dialogs/topup-dialog";
import { CommandPalette } from "./dialogs/command-palette";
import { UsageDialog } from "./dialogs/usage-dialog";
import { ProfileDialog } from "./dialogs/profile-dialog";
// ⚠️ ApiKeysDialog 仍不挂载：XOi 是站点级单一令牌，不代理 /api/token/* 子令牌。
// 团队版已收敛到独立 /team 页，这里直接导航，不再重复挂 TeamCreateDialog。
import { InvoiceDialog } from "./dialogs/invoice-dialog";
// TeamCreateDialog 保留为可复用弹窗，当前主入口为 /team 独立页。
import { PromotionDialog } from "./dialogs/promotion-dialog";
import { useIsReseller } from "@/lib/reseller/client";
import { usePublicSettings } from "@/components/signup/use-public-settings";

/**
 * 顶栏主导航。
 * ⚠️ 前两项指向 **Vue 主站**（跨应用），必须用普通 <a> 跳转（react-router 的 Link 会把
 * `/#/project` 当成 console 内部路径，落到兜底路由再被弹回登录页）；只有 /reseller/* 才走 Link。
 * 原来这里的 /chat、/dashboard、/agents 在 console 里都不存在，点了就是死链。
 */
const NAV = [
  { href: "/#/aiAssistant", icon: Sparkles, label: "AI 工作台", match: [], external: true },
  { href: "/#/assets", icon: LayoutDashboard, label: "我的作品", match: [], external: true },
  { href: "/reseller/overview", icon: Users, label: "成为代理", match: ["/reseller"] },
] as Array<{ href: string; icon: typeof Sparkles; label: string; match: string[]; tour?: string; external?: boolean }>;
/** 与参考站一致的 11 种界面语言 */
const LANGS = [["en", "English"], ["zh-CN", "简体中文"], ["ja", "日本語"], ["ko", "한국어"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["ar", "العربية"], ["ru", "Русский"], ["pt", "Português"], ["id", "Bahasa Indonesia"]];
const FONT_SCALES = [["compact", "紧凑", 11], ["normal", "标准", 13], ["large", "大", 15], ["xlarge", "特大", 17]] as const;
const GOLD = "#e9b10c";

type MenuEntry = [typeof Search, string, () => void];
const MenuDivider = () => <div aria-hidden className="mx-[7px] my-[5px] h-px bg-foreground/[0.06]" />;
const MenuLabel = ({ children }: { children: React.ReactNode }) => <div className="px-[11px] pb-[5px] pt-[8px] text-[11px] font-medium leading-[17.6px] text-muted-foreground">{children}</div>;
const cellCls = "h-[38px] gap-[8px] rounded-[10px] px-[10px] py-[9px] !text-[12.5px] font-medium leading-[20px] text-foreground transition-[background,color,transform] duration-150 data-[highlighted]:translate-x-0.5 data-[highlighted]:bg-foreground/[0.05] [&_svg]:h-[17.6px] [&_svg]:w-[17.6px] [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
/** 参考站字体档位是根字号 110/118/124/132%；我们以「标准」为 1 保持相同的相对步进 */
/** 参考站 :root[data-font-scale]：sm 110%（默认紧凑）/ md 118% / lg 124% / xl 132% 根字号 */
const FONT_ATTR = { compact: "sm", normal: "md", large: "lg", xlarge: "xl" } as const;

export function TopBar() {
  const path = usePathname(); const router = useRouter(); const brand = useBrand();
  const { theme, setTheme } = useTheme();
  const user = useApp((s) => s.user); const setUser = useApp((s) => s.setUser);
  const layout = useApp((s) => s.layout); const setLayout = useApp((s) => s.setLayout); const fontScale = useApp((s) => s.fontScale); const setFontScale = useApp((s) => s.setFontScale);
  useEffect(() => { document.documentElement.dataset.fontScale = FONT_ATTR[fontScale]; document.body.style.removeProperty("zoom"); }, [fontScale]);
  const { data: self } = useSelf(!!user);
  const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);
  const [ann, setAnn] = useState(false); const [usage, setUsage] = useState(false); const [price, setPrice] = useState(false); const [topup, setTopup] = useState(false); const [search, setSearch] = useState(false); const [lang, setLang] = useState("zh-CN");
  // 代理商中心只对站长批准过的账号可见：普通用户不显示任何入口（顶栏图标、用户菜单都没有），也进不去 /reseller/*
  const isReseller = useIsReseller(); const resellerLabel = "代理商中心";
  const { data: pubSettings } = usePublicSettings();
  // 普通登录用户：站长打开了「成为代理入口」时显示申请入口
  const showApply = !!user && !isReseller && user.role < 10 && (pubSettings?.showBecomeReseller ?? true); const [promo, setPromo] = useState(false);
  const [profile, setProfile] = useState(false); const [invoice, setInvoice] = useState(false);
  useEffect(() => { const h = () => setTopup(true); const u = () => setUsage(true); document.addEventListener("mc:topup", h); document.addEventListener("mc:usage", u); return () => { document.removeEventListener("mc:topup", h); document.removeEventListener("mc:usage", u); }; }, []);
  const balance = self ? quotaToUsd(self.quota) : null;
  const sections: [string, MenuEntry[]][] = [
    ["快捷", [[Search, "搜索...", () => setSearch(true)], [Tag, "模型价格", () => setPrice(true)], [Headphones, "联系客服", () => document.dispatchEvent(new CustomEvent("mc:support"))], [Bell, "系统公告", () => setAnn(true)], [Globe, "切换语言", () => toast.info("多语言界面即将上线，当前为中文")]]],
    ["模块", [[Sparkles, "AI 工作台", () => window.open("/#/aiAssistant", "_self")], [LayoutGrid, "我的作品", () => window.open("/#/assets", "_self")], [Users, "团队空间", () => router.push("/team")], ...(isReseller ? [[Handshake, resellerLabel, () => router.push("/reseller/overview")] as MenuEntry] : showApply ? [[Handshake, "成为代理", () => router.push("/agent-apply")] as MenuEntry] : [])]],
    // ⚠️ 「API 密钥」已移除：XOi 是站点级单一令牌，不代理 /api/token/*（子令牌绝不下发浏览器）。
    // 「使用日志 / 个人主页」也一并移除 —— 对应路由（/logs、/u/me）在 console 里不存在。
    ["账户", [[Settings, "资料与安全", () => setProfile(true)], [CreditCard, "快速充值", () => setTopup(true)], [FileText, "消费记录", () => setUsage(true)], [Receipt, "发票申请", () => setInvoice(true)], ...(pubSettings?.userInvite ? [[Gift, "我的推广", () => setPromo(true)] as MenuEntry] : [])]],
  ];
  /** 参考站「我的作品 / 团队」等无侧栏页使用精简顶栏：隐藏品牌与新版布局、底部分隔线、增加模型价格与使用文档 */
  const slim = ["/dashboard", "/team"].some((p) => path.startsWith(p));
  const activeModule = (label: string) => label === "AI 工作台" && NAV[0].match.some((m) => path.startsWith(m));
  return (
    <header className={cn("@container/topbar sticky top-0 z-40 flex shrink-0 items-center justify-between gap-2 px-2 sm:px-3 md:px-6", slim ? "h-14 border-b border-border bg-card" : "h-[53px] bg-background/80 backdrop-blur sm:h-14")}>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {/* 参考站 md 以下：品牌前的汉堡按钮，打开导航抽屉 */}
        <button type="button" onClick={() => document.dispatchEvent(new CustomEvent("mc:nav"))} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground md:hidden" aria-label="打开导航"><Menu className="h-5 w-5" /></button>
        <a href="/#/project" className={cn("flex min-w-0 shrink items-center gap-2.5 rounded-2xl", slim && "md:hidden")} aria-label={brand.name}>
          <BrandMark size={40} />
          <span className="min-w-0"><span className="block truncate text-[15px] font-black tracking-tight text-foreground">{brand.name}</span><span className="block truncate text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{brand.subtitle || "AI-大模型聚合平台"}</span></span>
        </a>
        {!slim && <Tip label={layout === "new" ? "切换回经典布局" : "切换到新版布局（更紧凑的侧栏）"}><button className={cn("inline-flex h-[35px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors", layout === "new" ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground")} onClick={() => { setLayout(layout === "new" ? "classic" : "new"); toast.success(layout === "new" ? "已切回经典布局" : "已切换到新版布局"); }}><LayoutGrid className="h-3.5 w-3.5 shrink-0" /><span className="hidden whitespace-nowrap sm:inline">{layout === "new" ? "经典布局" : "新版布局"}</span></button></Tip>}
      </div>
      <div className={cn("ml-auto flex min-w-0 shrink-0 items-center gap-0.5", slim ? "sm:gap-2" : "sm:gap-1")}>
        <nav className="flex shrink-0 items-center gap-1 whitespace-nowrap max-sm:hidden">
          {NAV.map(({ href, icon: Icon, label: navLabel, match, tour, external }) => {
            const applyLink = href === "/reseller/overview" && !isReseller && showApply;
            const label = href === "/reseller/overview" && !applyLink ? resellerLabel : navLabel;
            const active = match.some((m) => path.startsWith(m));
            const cls = cn("inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-[14px] text-[13px] font-medium transition-colors", active ? "bg-primary/12 text-foreground [&_svg]:text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground");
            if (href === "/reseller/overview" && !isReseller && !applyLink) return null;
            // 跨应用目标（Vue 主站）用普通 <a>：走 Link 会被 react-router 当成 console 内部路径
            const inner = <><Icon className="h-[18px] w-[18px] shrink-0" /></>;
            return (
              <Tip key={href} label={label}>
                {external ? <a href={href} data-tour={tour} className={cls} aria-label={label}>{inner}</a> : <Link href={applyLink ? "/agent-apply" : href} data-tour={tour} className={cls} aria-label={label}>{inner}</Link>}
              </Tip>
            );
          })}
        </nav>
        {slim && <span aria-hidden className="mx-1 h-6 w-px bg-border/60 max-sm:hidden" />}
        <Tip label="搜索模型、智能体、页面和操作 (⌘K)"><button className="relative inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground max-sm:hidden" onClick={() => setSearch(true)} aria-label="搜索模型、智能体、页面和操作..."><Search className="h-[18px] w-[18px]" /></button></Tip>
        {slim && <><Tip label="模型价格"><button className="relative inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground max-sm:hidden" onClick={() => setPrice(true)} aria-label="模型价格"><Tag className="h-[18px] w-[18px]" /></button></Tip></>}
        <Dropdown>
          <Tip label="切换语言"><DropdownTrigger asChild><button className="relative inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-sm:hidden" aria-label="切换语言"><Globe className="h-[18px] w-[18px]" /></button></DropdownTrigger></Tip>
          <DropdownContent className="w-[194px] rounded-md border-black/[0.07] bg-[linear-gradient(rgba(232,232,232,0.94),rgba(255,255,255,0.94))] p-1 shadow-[inset_0_1px_0_rgba(17,17,17,0.06),0_16px_40px_-16px_rgba(20,20,31,0.3)] backdrop-blur-[22px] backdrop-saturate-[1.08] dark:bg-[linear-gradient(rgba(38,40,55,0.94),rgba(23,24,33,0.94))]">{LANGS.map(([k, l]) => <DropdownItem key={k} onSelect={() => { setLang(k); if (k !== "zh-CN") toast.info(`${l} 界面翻译即将上线，当前先以中文显示`); }} className={cn("h-[35px] gap-2 rounded-sm px-2 text-[15px] font-medium transition-[background,color,transform] duration-150 data-[highlighted]:translate-x-0.5", lang === k && "text-primary")}>{l}{lang === k && <Check className="ml-auto h-3.5 w-3.5" />}</DropdownItem>)}</DropdownContent>
        </Dropdown>
        <Tip label="切换主题"><button className="relative inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-border bg-muted/40 text-primary transition-colors hover:bg-muted" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="切换主题">{mounted && theme === "dark" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}</button></Tip>
        <Tip label="系统公告"><button className="relative inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground max-sm:hidden" onClick={() => setAnn(true)} aria-label="系统公告"><Bell className="h-[18px] w-[18px]" /></button></Tip>
        <button className="inline-flex h-11 items-center gap-1.5 rounded-[14px] border border-transparent bg-[linear-gradient(135deg,var(--primary),#6a3fd9)] px-2.5 sm:px-3 text-[12px] font-semibold text-white shadow-[0_8px_20px_-12px_color-mix(in_srgb,var(--primary)_80%,transparent)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98]" onClick={() => setTopup(true)}><CreditCard className="h-3.5 w-3.5" /><span className="hidden @5xl/topbar:inline">充值</span></button>
        {user ? (
          <Dropdown>
            <DropdownTrigger asChild>
              <button className={cn("inline-flex h-11 items-center gap-1.5 rounded-[14px] border px-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/50 data-[state=open]:bg-muted/50 sm:gap-2 sm:px-3", slim ? "border-border" : "border-transparent")} aria-label={`用户菜单 (${user.username})`}><Avatar name={user.display_name || user.username} size={26} /><span className="hidden max-w-[120px] truncate @4xl/topbar:inline-block">{user.display_name || user.username}</span><ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground @4xl/topbar:inline-block" /></button>
            </DropdownTrigger>
            <DropdownContent className="max-h-[calc(100vh-72px)] w-[336px] overflow-y-auto !rounded-[20px] border-0 bg-black/[0.09] p-[1.4px] font-medium shadow-[0_1px_3px_rgba(20,20,31,0.06),0_20px_46px_-20px_rgba(20,20,31,0.28)] dark:bg-white/[0.09]">
              <div className="rounded-[18.6px] bg-card p-[5px]">
              <div className="px-[11px] pb-[12px] pt-[11px]">
                <div className="flex items-center gap-[10px]">
                  <Avatar name={user.display_name || user.username} size={26} />
                  <span className="min-w-0 flex-1 leading-[26.4px]">
                    <span className="flex min-w-0 items-center gap-[6px] text-[14px] font-[640] leading-[22.4px]">
                      <span className="truncate">{user.display_name || user.username}</span>
                      <span className="inline-flex h-[18px] shrink-0 items-center gap-[2px] rounded-[5.5px] bg-foreground/[0.06] py-px pl-[5px] pr-[3px] text-[10.5px] font-[640] leading-[14px] text-muted-foreground">#{user.id}<button type="button" aria-label="复制用户号" className="grid h-4 w-4 place-items-center rounded-[4px] text-muted-foreground/70 hover:text-foreground" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(String(user.id)); toast.success("用户号已复制"); }}><Copy className="h-[10px] w-[10px]" /></button></span>
                    </span>
                    <span className="mt-px truncate text-[11.5px] font-medium leading-[18.4px] text-muted-foreground">{user.email || user.username}</span>
                  </span>
                </div>
                <div className="mt-[10px] flex h-[39.6px] items-center justify-between rounded-[10px] border px-[11px] py-[8px]" style={{ borderColor: `${GOLD}38`, background: `${GOLD}17` }}>
                  <span className="text-[11px] font-medium leading-[17.6px] text-muted-foreground">算力余额</span>
                  <span className="flex items-center gap-[4px] font-mono text-[13.5px] font-[680] leading-[21.6px] tabular-nums" style={{ color: GOLD }}><Wallet className="h-[13.2px] w-[13.2px]" />{balance == null ? "…" : fmtCny(balance)}</span>
                </div>
              </div>
              <MenuDivider />
              {sections.map(([title, items]) => (
                <div key={title}>
                  <MenuLabel>{title}</MenuLabel>
                  <div className="grid grid-cols-2 gap-[4px] px-[5px]">{items.map(([I, l, fn]) => <DropdownItem key={l} onSelect={fn} className={cn(cellCls, activeModule(l) && "bg-primary/16 [&_svg]:text-primary")}><I /><span className="min-w-0 flex-1 truncate">{l}</span></DropdownItem>)}</div>
                </div>
              ))}
              <MenuDivider />
              <div className="px-[11px] pb-[10px] pt-[8px]">
                <div className="flex items-center gap-[6px] pb-[7px] text-[10.5px] font-medium leading-[16.8px] text-muted-foreground"><Type className="h-[13.2px] w-[13.2px]" /><span className="min-w-0 flex-1 truncate">字体大小</span><span className="shrink-0 text-foreground">{FONT_SCALES.find(([k]) => k === fontScale)?.[1]}</span></div>
                <div role="radiogroup" aria-label="字体大小" className="grid grid-cols-4 gap-[4px]">{FONT_SCALES.map(([k, label, px]) => <button key={k} role="radio" aria-checked={fontScale === k} aria-label={label} onClick={(e) => { e.preventDefault(); setFontScale(k); }} className={cn("grid h-[30px] place-items-center rounded-full border font-[660] transition-colors", fontScale === k ? "border-primary/60 bg-primary/11 text-primary" : "border-foreground/[0.06] text-muted-foreground hover:border-foreground/[0.09] hover:text-foreground")}><span style={{ fontSize: px, lineHeight: 1.6 }}>A</span></button>)}</div>
              </div>
              <MenuDivider />
              <DropdownItem className="mx-[5px] h-[36px] gap-[9px] rounded-[10px] px-[10px] py-[9px] text-[12.5px] font-medium leading-[17.86px] text-[oklch(0.6_0.22_25)] data-[highlighted]:bg-[oklch(0.6_0.22_25/0.1)] data-[highlighted]:text-[oklch(0.6_0.22_25)]" onSelect={async () => { await logout(); setUser(null); toast.success("已退出登录"); router.push("/login"); }}><LogOut className="h-[17.6px] w-[17.6px]" />退出登录</DropdownItem>
              </div>
            </DropdownContent>
          </Dropdown>
        ) : <button className="inline-flex h-12 items-center rounded-[14px] border border-border px-4 text-[13px] font-medium hover:bg-muted/50" onClick={() => router.push("/login")}>登录</button>}
      </div>
      <AnnouncementsDialog open={ann} onOpenChange={setAnn} />
      <PriceDialog open={price} onOpenChange={setPrice} />
      <TopupDialog open={topup} onOpenChange={setTopup} />
      <UsageDialog open={usage} onOpenChange={setUsage} />
      <CommandPalette open={search} onOpenChange={setSearch} onTopup={() => setTopup(true)} />
      <ProfileDialog open={profile} onOpenChange={setProfile} />
      <InvoiceDialog open={invoice} onOpenChange={setInvoice} />
      <PromotionDialog open={promo} onOpenChange={setPromo} />
    </header>
  );
}
