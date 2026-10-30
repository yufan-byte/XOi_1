"use client";
// 登录后要回到原地址：usePathname() 不含查询串，直接用它会把 ?s=xxx、?tab=keys 这类深链参数丢掉
import { ViewportFitZoom } from "@/components/shell/viewport-fit-zoom";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Wallet } from "lucide-react";
import { TopBar } from "@/components/shell/topbar";
import { BrandMark } from "@/components/shell/brand";
import { useBrand } from "@/components/shell/brand-provider";
import { useApp } from "@/store/app";
import { loadAuth, refreshAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useResellerScope,useResellerMe } from "@/lib/reseller/client";
// XOi: 菜单数据抽到 components/reseller-menu.ts —— ⌘K 面板也要用同一份，
// 而面板 import shell.tsx 会成环（shell → topbar → command-palette → shell）。
import { AGENT_MENU, NEW_MENU } from "@/components/reseller-menu";
import { createLoginUrl } from "../../../../../shared/loginNavigation";

/** 侧栏底部「结算倒计时」卡片（参考站：标签 + 说明 + 查看财务按钮） */
function SettleCard() {
  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <div className="rounded-xl bg-muted/60 p-3">
        <p className="text-xs font-semibold text-foreground">资金管理</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">查看收入、可提现余额和结算记录。</p>
        <Link href="/reseller/finance" className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border/70 bg-card/75 px-3 text-[13px] font-semibold transition-colors hover:bg-muted"><Wallet size={15} />查看财务</Link>
      </div>
    </div>
  );
}

const itemCls = "xoi-admin-nav-item flex min-h-11 w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors";

/** 代理商中心壳：全高左侧栏（品牌 + 菜单切换 + 代理菜单 + 结算卡）｜右侧顶栏（返回 + 工具）+ 滚动内容区 */
/** 登录后回跳的目标：带上查询串（usePathname 只给路径） */
const nextTarget = (path: string) => (typeof window === "undefined" ? path : path + window.location.search);

export function ResellerShell({ children }: { children: React.ReactNode; title?: string }) {
  const path = usePathname(); const router = useRouter(); const setUser = useApp((s) => s.setUser); const user = useApp((s) => s.user); const brand = useBrand();
  const [collapsed, setCollapsed] = useState(false); const [mobileOpen, setMobileOpen] = useState(false); const [open, setOpen] = useState<Record<string, boolean>>({});
  /**
   * 顶栏「返回」：裸 router.back() 会吃浏览器历史 —— 从 XOi 主站整页跳进控制台时，
   * 上一条历史就是主站首页，一点返回直接弹出控制台。react-router v7 会在每个历史条目
   * 写入 state.idx（本次 SPA 会话内的序号，落地页 replace 成 0，应用内每 push 一次 +1），
   * 因此 idx>0 才说明上一条一定还是控制台页面；否则落到控制台首页兜底。
   */
  const goBack = () => {
    const idx = typeof window === "undefined" ? 0 : (window.history.state?.idx as number | undefined) ?? 0;
    if (idx > 0) router.back();
    else router.replace("/reseller/admin/stats");
  };
  useEffect(() => { const loginPath = () => createLoginUrl(nextTarget(path)).replace(/^\/console/, ""); const a = loadAuth(); if (a) { setUser(a.user); if (Date.now() > a.expiresAt - 60_000) refreshAuth().then((r) => { if (!r) { setUser(null); router.replace(loginPath()); } }); } else router.replace(loginPath()); }, [setUser, router, path]);
  useEffect(() => { setMobileOpen(false); }, [path]);
  const scope = useResellerScope(); const isAgent = scope === "agent";
  const root=useResellerMe().data?.root===true;
  // adminOnly：XOi 管理员专属（loadAuth 的 role 来自登录态，10 = admin）
  const isAdmin=(loadAuth()?.user.role??0)>=10;
  const menu = (isAgent ? AGENT_MENU : NEW_MENU).filter(item=>(!item.rootOnly||root)&&(!item.adminOnly||isAdmin));
  const hrefs = menu.flatMap((it) => [it.href, ...(it.children?.map((c) => c.href) ?? [])]).filter(Boolean) as string[];
  /** 最长前缀匹配：只高亮最具体的一项 */
  const best = hrefs.filter((h) => path === h || path.startsWith(`${h}/`)).sort((x, y) => y.length - x.length)[0];
  const active = (href?: string) => !!href && href === best;
  const pageTitle = menu.flatMap((item) => [item, ...(item.children ?? [])]).find((item) => item.href === best)?.label || "管理控制台";
  return (
    // text-foreground：侧栏整棵子树不依赖 body 的继承色（body 上曾写着 text-white，浅色主题下会把菜单项变白字白底）
    <div className="xoi-admin-shell flex min-h-0 overflow-hidden text-foreground" style={{ height: "calc(100dvh / var(--app-zoom, 1))" }}>
      <ViewportFitZoom />
      {mobileOpen && <button className="fixed inset-0 z-[60] bg-black/30 md:hidden" aria-label="关闭后台导航" onClick={() => setMobileOpen(false)} />}
      <aside className={cn(mobileOpen ? "fixed inset-y-0 left-0 z-[61] flex md:static" : "hidden md:flex", "xoi-admin-sidebar h-full shrink-0 flex-col border-r border-border bg-card", collapsed && !mobileOpen ? "w-[72px]" : "w-[232px]")} aria-label={isAgent ? "代理业务导航" : "平台管理导航"}>
        <div className={cn("flex h-16 shrink-0 items-center border-b border-border", collapsed ? "justify-center px-2" : "justify-between px-4")}>
          {/* 品牌名指回 Vue 主站工作台：跨应用跳转必须用 <a>（Link 会当成 console 内部路由 → 兜底弹回登录页） */}
          {!collapsed && (
            <a href="/#/aiAssistant" className="flex min-w-0 items-center rounded-2xl p-1" aria-label={brand.name}>
              <span className="flex min-w-0 items-center gap-2.5">
                <BrandMark size={36} />
                <span className="min-w-0"><span className="block truncate text-[15px] font-semibold tracking-tight">{brand.name}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{isAgent ? "代理工作台" : "管理控制台"}</span></span>
              </span>
            </a>
          )}
          <button onClick={() => mobileOpen ? setMobileOpen(false) : setCollapsed((v) => !v)} aria-label={collapsed ? "Open navigation" : "Collapse sidebar"} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted">{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
        </div>
        {/*
          经典/新版菜单切换与「资金管理」结算卡已随代理体系下线（2026-10-24）：
          结算卡指向的 /reseller/finance 是代理收益页，对平台管理员是误导入口；
          代理体系重启时一并恢复。
        */}
        {/*
          经典/新版菜单切换已随代理体系下线（2026-10-24）：菜单固定为平台管理一套；
          代理仍用 AGENT_MENU。「资金管理」结算卡指向 /reseller/finance（代理收益页），
          只对代理显示，对平台管理员是误导入口。代理体系重启时一并恢复两种布局。
        */}
        <div className="xoi-admin-navigation min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!collapsed && <div className="px-3 pb-2 pt-1 text-[11px] font-medium text-muted-foreground">{isAgent ? "代理业务" : "平台管理"}</div>}
          <nav className="flex flex-col gap-0.5">
            {menu.map((it) => {
              const I = it.icon; const isOpen = open[it.label] ?? it.children?.some((c) => active(c.href));
              const on = active(it.href);
              const row = (
                <>
                  <I size={16} className="shrink-0" />
                  {!collapsed && <span className="flex-1 truncate text-left">{it.label}</span>}
                  {!collapsed && it.children && (isOpen ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />)}
                </>
              );
              return (
                <div key={it.label} className="flex flex-col gap-0.5">
                  {it.href
                    ? <Link href={it.href} aria-label={it.label} data-active={on} aria-current={on ? "page" : undefined} className={cn(itemCls, on ? "border-primary/20 bg-primary/10 font-semibold text-primary" : "hover:bg-muted/60", collapsed && "justify-center")}>{row}</Link>
                    : <button type="button" aria-label={it.label} aria-expanded={!!isOpen} title={collapsed ? it.label : undefined} onClick={() => { if (collapsed) setCollapsed(false); setOpen((o) => ({ ...o, [it.label]: !isOpen })); }} className={cn(itemCls, "hover:bg-muted/60", collapsed && "justify-center")}>{row}</button>}
                  {it.children && isOpen && !collapsed && (
                    <div className="ml-7 flex flex-col gap-0.5 border-l border-border pl-2">{it.children.map((c) => <Link key={c.href} href={c.href} data-active={active(c.href)} className={cn("flex min-h-9 items-center rounded-lg px-3 text-[13px] transition-colors", active(c.href) ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{c.label}</Link>)}</div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="my-2 h-px w-full bg-border" />
          <nav className="flex flex-col gap-0.5">
            <a href="/#/aiAssistant" aria-label="返回智能创作" className={cn(itemCls, "hover:bg-muted/60", collapsed && "justify-center")}><LayoutDashboard size={16} className="shrink-0" />{!collapsed && <span className="truncate">返回创作工作台</span>}</a>
          </nav>
        </div>
        {!collapsed && isAgent && <SettleCard />}
      </aside>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* 复用全站顶栏的右侧工具区；隐藏其左侧品牌块（品牌已在侧栏），左侧放「返回」 */}
        <div className="xoi-admin-topbar relative shrink-0 border-b border-border bg-card [&>header]:static [&>header]:h-16 [&>header]:bg-transparent [&>header]:backdrop-blur-none [&>header>div:first-child>*]:hidden">
          <TopBar management />
          <button aria-label="打开后台导航" onClick={() => { setCollapsed(false); setMobileOpen(true); }} className="absolute left-3 top-1/2 z-50 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg hover:bg-muted md:hidden"><PanelLeftOpen size={17} /></button>
          <div className="absolute left-14 md:left-5 top-1/2 z-40 flex -translate-y-1/2 items-center gap-3"><button onClick={goBack} aria-label="返回上一页" className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ArrowLeft size={16} /></button><span aria-hidden className="hidden h-4 w-px bg-border sm:block" /><span className="hidden text-[13px] font-medium sm:block">{pageTitle}</span></div>
        </div>
        <main id="management-content" className="xoi-admin-content min-w-0 flex-1 overflow-y-auto bg-background p-4 md:p-6 xl:p-7">
          {user ? children : <div className="h-[60vh] rounded-2xl shimmer" />}
          {brand.site.footer&&<footer className="mt-8 whitespace-pre-wrap break-words border-t pt-4 text-center text-xs leading-6 text-muted-foreground">{brand.site.footer}</footer>}
        </main>
      </div>
    </div>
  );
}
