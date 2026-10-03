"use client";
// 登录后要回到原地址：usePathname() 不含查询串，直接用它会把 ?s=xxx、?tab=keys 这类深链参数丢掉
import { ViewportFitZoom } from "@/components/shell/viewport-fit-zoom";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, BarChart3, Boxes, ChevronDown, ChevronRight, Handshake, Inbox, LayoutDashboard, Megaphone, MessageCircle, Network, Palette, PanelLeftClose, PanelLeftOpen, Settings2, ShieldCheck, SlidersHorizontal, UserCheck, UserCog, UserRound, Users, Wallet } from "lucide-react";
import { TopBar } from "@/components/shell/topbar";
import { BrandMark } from "@/components/shell/brand";
import { useBrand } from "@/components/shell/brand-provider";
import { useApp } from "@/store/app";
import { loadAuth, refreshAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useResellerScope } from "@/lib/reseller/client";
// XOi: 菜单数据抽到 components/reseller-menu.ts —— ⌘K 面板也要用同一份，
// 而面板 import shell.tsx 会成环（shell → topbar → command-palette → shell）。
import { AGENT_MENU, NEW_MENU, OLD_MENU } from "@/components/reseller-menu";

const MENU_KEY = "mc.reseller.menu";

function useMenuMode() {
  const [mode, setMode] = useState<"new" | "old">("new");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 读取本机偏好，仅首帧后同步一次
  useEffect(() => { try { const v = localStorage.getItem(MENU_KEY); if (v === "old") setMode("old"); } catch {} }, []);
  const toggle = () => setMode((m) => { const n = m === "new" ? "old" : "new"; try { localStorage.setItem(MENU_KEY, n); } catch {} return n; });
  return { mode, toggle };
}

/** 侧栏底部「结算倒计时」卡片（参考站：标签 + 说明 + 查看财务按钮） */
function SettleCard() {
  return (
    <div className="shrink-0 border-t border-primary/20 px-4 py-3">
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-card/60 p-3">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">结算倒计时</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">距离下次结算窗口剩余时间。</p>
        <Link href="/reseller/finance" className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border/70 bg-card/75 px-3 text-[13px] font-semibold transition-colors hover:bg-muted"><Wallet size={15} />查看财务</Link>
      </div>
    </div>
  );
}

const itemCls = "flex min-h-11 w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors";

/** 代理商中心壳：全高左侧栏（品牌 + 菜单切换 + 代理菜单 + 结算卡）｜右侧顶栏（返回 + 工具）+ 滚动内容区 */
/** 登录后回跳的目标：带上查询串（usePathname 只给路径） */
const nextTarget = (path: string) => (typeof window === "undefined" ? path : path + window.location.search);

export function ResellerShell({ children }: { children: React.ReactNode; title?: string }) {
  const path = usePathname(); const router = useRouter(); const setUser = useApp((s) => s.setUser); const user = useApp((s) => s.user); const brand = useBrand();
  const { mode, toggle } = useMenuMode(); const [collapsed, setCollapsed] = useState(false); const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { const a = loadAuth(); if (a) { setUser(a.user); if (Date.now() > a.expiresAt - 60_000) refreshAuth().then((r) => { if (!r) { setUser(null); router.replace(`/login?next=${encodeURIComponent(nextTarget(path))}`); } }); } else router.replace(`/login?next=${encodeURIComponent(nextTarget(path))}`); }, [setUser, router, path]);
  const scope = useResellerScope(); const isAgent = scope === "agent";
  const menu = isAgent ? AGENT_MENU : mode === "new" ? NEW_MENU : OLD_MENU;
  const hrefs = menu.flatMap((it) => [it.href, ...(it.children?.map((c) => c.href) ?? [])]).filter(Boolean) as string[];
  /** 最长前缀匹配：只高亮最具体的一项 */
  const best = hrefs.filter((h) => path === h || path.startsWith(`${h}/`)).sort((x, y) => y.length - x.length)[0];
  const active = (href?: string) => !!href && href === best;
  return (
    // text-foreground：侧栏整棵子树不依赖 body 的继承色（body 上曾写着 text-white，浅色主题下会把菜单项变白字白底）
    <div className="flex h-dvh min-h-0 overflow-hidden text-foreground">
      <ViewportFitZoom />
      <aside className={cn("hidden h-dvh shrink-0 flex-col border-r border-black/[0.055] bg-card bg-[radial-gradient(120%_80%_at_100%_0,color-mix(in_srgb,var(--primary)_7%,transparent),transparent_70%)] shadow-[4px_0_24px_-12px_color-mix(in_srgb,var(--primary)_10%,transparent)] dark:border-white/10 md:flex", collapsed ? "w-[72px]" : "w-64")} aria-label="代理商中心导航">
        <div className={cn("flex h-14 shrink-0 items-center border-b border-primary/20", collapsed ? "justify-center px-2" : "justify-between px-4")}>
          {/* 品牌名指回 Vue 主站工作台：跨应用跳转必须用 <a>（Link 会当成 console 内部路由 → 兜底弹回登录页） */}
          {!collapsed && (
            <a href="/#/project" className="flex min-w-0 items-center rounded-2xl p-1" aria-label={brand.name}>
              <span className="flex min-w-0 items-center gap-2.5">
                <BrandMark size={36} />
                <span className="min-w-0"><span className="block truncate text-[15px] font-black tracking-tight">{brand.name}</span><span className="block truncate text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{brand.subtitle || brand.name}</span></span>
              </span>
            </a>
          )}
          <button onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Open navigation" : "Collapse sidebar"} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted">{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
        </div>
        {!collapsed && !isAgent && (
          <div className="px-2 pt-2">
            <button onClick={toggle} className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-primary/45 bg-primary/[0.08] px-3 py-2 text-xs transition-colors hover:bg-primary/[0.12]">
              <span className="flex items-center gap-1.5 font-medium text-primary"><ArrowLeftRight size={14} />{mode === "new" ? "旧版菜单" : "新版菜单 v2"}</span><span className="text-muted-foreground">临时</span>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-2 py-2">
          {!collapsed && <div className="px-3 pb-2 pt-1 text-[11px] font-black uppercase tracking-[0.2em] text-primary">{isAgent ? "我的代理" : "代理商中心"}</div>}
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
                    : <button type="button" aria-label={it.label} aria-expanded={!!isOpen} onClick={() => setOpen((o) => ({ ...o, [it.label]: !isOpen }))} className={cn(itemCls, "hover:bg-muted/60", collapsed && "justify-center")}>{row}</button>}
                  {it.children && isOpen && !collapsed && (
                    <div className="ml-7 flex flex-col gap-0.5 border-l border-border pl-2">{it.children.map((c) => <Link key={c.href} href={c.href} data-active={active(c.href)} className={cn("flex min-h-9 items-center rounded-lg px-3 text-[13px] transition-colors", active(c.href) ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{c.label}</Link>)}</div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="my-2 h-px w-full bg-border" />
          <nav className="flex flex-col gap-0.5">
            <a href="/#/project" aria-label="返回创作工作台" className={cn(itemCls, "hover:bg-muted/60", collapsed && "justify-center")}><LayoutDashboard size={16} className="shrink-0" />{!collapsed && <span className="truncate">返回创作工作台</span>}</a>
          </nav>
        </div>
        {!collapsed && <SettleCard />}
      </aside>
      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        {/* 复用全站顶栏的右侧工具区；隐藏其左侧品牌块（品牌已在侧栏），左侧放「返回」 */}
        <div className="relative shrink-0 border-b bg-card [&>header]:static [&>header]:h-14 [&>header]:bg-transparent [&>header]:backdrop-blur-none [&>header>div:first-child>*]:hidden">
          <TopBar />
          <button onClick={() => router.back()} className="absolute left-6 top-1/2 z-50 inline-flex h-9 -translate-y-1/2 items-center gap-1 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"><ArrowLeft size={16} /><span className="text-[13px] font-medium">返回</span></button>
        </div>
        <main className="min-w-0 flex-1 overflow-y-auto bg-card bg-[linear-gradient(color-mix(in_srgb,var(--primary)_5%,transparent),transparent_280px)] p-3 md:p-5 xl:p-6">
          {user ? children : <div className="h-[60vh] rounded-2xl shimmer" />}
        </main>
      </div>
    </div>
  );
}
