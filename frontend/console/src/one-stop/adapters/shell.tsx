// 一站式工作区外壳：顶栏与侧栏照造物 shell（topbar / sidebar）重做，品牌仍是 XOi。
// 保留本项目必需的两处：快速创作/导演创作模式切换、返回导演创作；
// 侧栏只保留导演台相关的部分功能——模态筛选 + 厂商 + 搜索 + 模型列表，
// 点模型右侧进入对应工作台（对话 / 图片 / 视频 / 音频）。
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Bot, CircleHelp, Clapperboard, Coins, CreditCard, Film, LayoutGrid, LogOut, Mail,
  PanelLeftClose, PanelLeftOpen, Search, Scissors, Star, Wallet, Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getSelf, logout } from "@/lib/api";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { useCatalog, useSelf, type StandaloneModelWithHealth } from "./queries";
import { collection, flushCollections } from "./collections";
import { accountKey, oneStopRequest } from "./request";
import { useStudio, PAGE_OF, MODALITY_LABEL, type Modality } from "../studio/store";
import { ModelIcon, SideDrawer } from "../studio/ui";
import { useInbox, unreadCount } from "../studio/inbox";

type ModalityTab = Modality | "all" | "mine";
const TABS: ModalityTab[] = ["all", "chat", "image", "video", "audio", "mine"];
/** 页面路由 → 侧栏高亮模态：只有停在这些工作台时对应模型才亮（造物 ROUTE_MODALITY 同款） */
const ROUTE_MODALITY: Record<string, Modality> = { "/chat": "chat", "/image": "image", "/video-studio": "video", "/audio": "audio" };

const PROVIDER_LABELS: Record<string, string> = {
  BYT: "火山引擎", doubao: "火山引擎", "即梦 Seedance": "火山引擎",
  openai: "OpenAI", OPE: "OpenAI", anthropic: "Anthropic", ANT: "Anthropic",
  GOO: "Google", banana: "Google", DEE: "DeepSeek", MMX: "MiniMax",
  KUA: "可灵", "豆包 Seedream": "火山引擎",
};

/**
 * 造物的侧栏入口不是按后端的粗粒度 series 生硬合并，而是按“产品系列 + 计费口径 + 特殊线路”分组。
 * XOi 后端的 Seedance series 统一叫「即梦 Seedance」，若直接以它为 key，会把按次、按秒、官转共
 * 50 多条线路错误折叠成一个入口。这里保留调用 id，不改计费和路由，只修正展示分组。
 */
function panelGroupOf(m: StandaloneModelWithHealth) {
  const source = `${m.id} ${m.name}`.toLowerCase();
  if (/seedance|即梦/.test(source)) {
    const official = /guanzhuan|官转|(?:^|[-_.])gz(?:[-_.]|$)|official/.test(source);
    const version = source.match(/(?:seedance|即梦)[-_ ]?(\d(?:[._-]\d)?)/)?.[1]?.replace(/[_-]/g, ".") || "";
    const billing = String(m.billingUnit) === "per_second" ? "按秒" : "按次";
    return {
      key: `seedance:${official ? "official" : version || "other"}:${billing}`,
      label: official ? "seedance · 官转" : `seedance${version || ""} · ${billing}`,
      priority: official ? 2 : version.startsWith("2.5") ? (billing === "按秒" ? 0 : 1) : version.startsWith("2.0") ? (billing === "按次" ? 3 : 4) : 5,
    };
  }
  const series = m.series || m.name;
  return { key: `${m.category}:${series}`, label: series, priority: 20 };
}

function providerLabel(m: StandaloneModelWithHealth) {
  return PROVIDER_LABELS[m.vendor] || PROVIDER_LABELS[m.series] || m.vendorLabel || m.vendor || m.series;
}

/** 侧栏模型面板：模态筛选 + 厂商 + 搜索 + 模型列表（造物 sidebar.ModelPanel 同款交互） */
function ModelPanel({ onPicked }: { onPicked?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: catalog, isLoading, isError, refetch } = useCatalog();
  const { modality, setModality, vendor, setVendor, search, setSearch, selected, select, pinned, togglePin } = useStudio();
  // 高亮只跟当前页面走（造物同款）：在生图页只亮选中的图片模型，别的模态即使选过也不亮；
  // 用户停在具体工作台且页签不是「全部」时，页签跟着页面切过去（造物 ROUTE_MODALITY effect 同款）
  const routeModality = (Object.entries(ROUTE_MODALITY).find(([p]) => location.pathname.startsWith(p))?.[1] ?? null) as Modality | null;
  useEffect(() => { if (routeModality && modality !== "all" && modality !== routeModality) setModality(routeModality); }, [routeModality]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    const all = catalog?.models ?? []; const q = search.trim().toLowerCase();
    return all
      .filter((m) => (modality === "all" ? true : modality === "mine" ? pinned.includes(m.id) : m.category === modality))
      .filter((m) => !vendor || m.vendor === vendor)
      .filter((m) => !q || [m.name, m.id, m.series, m.description, ...m.capabilities].join(" ").toLowerCase().includes(q))
      .sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)) || Number(b.featured) - Number(a.featured));
  }, [catalog, modality, vendor, search, pinned]);
  // 分组折叠（造物同款）：未搜索且不在「我的」时，同系列折叠成一个入口；代表项 = 当前选中 > 已置顶 > 重点推荐 > 目录顺序。
  // 条数徽标「N 条可切换」与折叠共用同一数据，不会出现徽标与列表不一致。
  const collapsed = modality !== "mine" && !search.trim();
  const display = useMemo(() => {
    if (!collapsed) return list.map((m, index) => ({ m, items: [m], label: m.name, priority: 20, index }));
    const groups = new Map<string, { items: typeof list; label: string; priority: number; index: number }>();
    list.forEach((m, index) => {
      const meta = panelGroupOf(m);
      const group = groups.get(meta.key) ?? { items: [], label: meta.label, priority: meta.priority, index };
      group.items.push(m); groups.set(meta.key, group);
    });
    return [...groups.values()].map((group) => {
      const m = group.items.find((item) => routeModality != null && item.category === routeModality && selected[routeModality] === item.id)
        ?? group.items.find((item) => pinned.includes(item.id))
        ?? [...group.items].sort((a, b) => Number(b.featured) - Number(a.featured) || (b.sort ?? 0) - (a.sort ?? 0))[0];
      return { ...group, m };
    }).sort((a, b) =>
      Number(b.items.some((m) => pinned.includes(m.id))) - Number(a.items.some((m) => pinned.includes(m.id)))
      || a.priority - b.priority
      || Number(b.items.some((m) => m.featured)) - Number(a.items.some((m) => m.featured))
      || (b.m.sort ?? 0) - (a.m.sort ?? 0)
      || a.index - b.index);
  }, [list, collapsed, routeModality, selected, pinned]);
  const vendors = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of catalog?.models ?? []) { const v = m.vendor || ""; c.set(v, (c.get(v) ?? 0) + 1); }
    return [...c.entries()].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : b[1] - a[1]));
  }, [catalog]);
  const pick = (m: { id: string; category: string }) => {
    const cat = m.category as Modality;
    if (!(cat in PAGE_OF)) { toast.info("这一类模型会在创作流程中自动调用"); return; }
    const full = (catalog?.models ?? []).find((x) => x.id === m.id);
    if (full) select(full);
    navigate(PAGE_OF[cat]);
    onPicked?.();
  };
  const listRef = useRef<HTMLDivElement>(null);
  const filterKey = `${modality}|${vendor}|${search}`;
  const scrollByFilter = useRef(new Map<string, number>());
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = scrollByFilter.current.get(filterKey) ?? 0;
    const onScroll = () => scrollByFilter.current.set(filterKey, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [filterKey]);
  return (
    <>
      <div className="flex flex-wrap justify-between gap-1 px-3 py-1.5">
        {TABS.map((m) => (
          <button key={m} type="button" onClick={() => setModality(m)} className={cn("inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-1.5 py-2 text-[11px] transition-[background-color,color,scale] duration-200 ease-out active:scale-[0.96]", modality === m ? "bg-primary/12 font-semibold text-primary" : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{MODALITY_LABEL[m]}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 pb-2">
        <button type="button" onClick={() => { setModality("all"); setVendor(""); setSearch(""); navigate("/chat"); onPicked?.(); }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/55 bg-card text-muted-foreground shadow-[0_5px_14px_rgba(0,0,0,0.06)] transition-[color,background-color,transform] hover:bg-primary/10 hover:text-primary active:scale-95"
          aria-label="进入对话工作台" title="进入对话工作台">
          <Bot className="h-[18px] w-[18px]" />
        </button>
        <Dropdown>
          <DropdownTrigger asChild>
            <button type="button" className="flex h-10 max-w-[6rem] shrink-0 items-center gap-1 rounded-pane border border-border/40 bg-muted/25 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground" aria-label="按厂商筛选">
              <span className="truncate">{vendor || "全部厂商"}</span><ChevronDownSmall />
            </button>
          </DropdownTrigger>
          <DropdownContent align="start" className="max-h-80 overflow-auto">
            <DropdownItem onSelect={() => setVendor("")}><span className="flex-1">全部厂商</span><span className="ml-4 font-mono text-xs text-muted-foreground">{catalog?.models.length ?? 0}</span></DropdownItem>
            {vendors.map(([v, n]) => <DropdownItem key={v || "_other"} onSelect={() => setVendor(v)}><span aria-hidden className="mr-2 grid h-5 w-5 place-items-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">{(v || "其他").slice(0, 1)}</span><span className="flex-1">{v || "其他"}</span><span className="ml-4 font-mono text-xs text-muted-foreground">{n}</span></DropdownItem>)}
          </DropdownContent>
        </Dropdown>
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-pane border border-border/40 bg-muted/25 px-3 py-1.5 transition-colors focus-within:border-primary/35 focus-within:bg-muted/40">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型 / 描述 / 功能..." className="h-7 w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/45" />
        </label>
      </div>
      <div aria-hidden className="mx-4 h-px shrink-0 bg-[linear-gradient(90deg,transparent_5%,color-mix(in_srgb,var(--primary)_22%,transparent)_50%,transparent_95%)]" />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {isLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="mb-2 h-[68px] rounded-2xl shimmer" />)}
        {!isLoading && isError && !catalog && <button type="button" onClick={() => void refetch()} className="w-full py-10 text-center text-xs text-muted-foreground hover:text-primary">模型目录加载失败，点此重试</button>}
        {!isLoading && list.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">{modality === "mine" ? "还没有收藏模型，悬停模型卡片点左上角的 ☆ 收藏" : "没有匹配的模型"}</div>}
        <div className="flex flex-col gap-0.5">
          {display.map(({ m, items, label }) => {
            const cur = routeModality != null && items.some((item) => item.category === routeModality && selected[routeModality] === item.id);
            const pin = items.some((item) => pinned.includes(item.id));
            const featured = items.some((item) => item.featured);
            const samples = items.map((item) => item.healthDetail).filter((detail): detail is NonNullable<typeof detail> => !!detail && detail.total24 > 0);
            const total = samples.reduce((sum, detail) => sum + detail.total24, 0);
            const h = total > 0 ? Math.round(samples.reduce((sum, detail) => sum + detail.health * detail.total24, 0) / total) : null;
            const healthCls = h == null ? "text-muted-foreground/45" : h >= 95 ? "text-success" : h >= 80 ? "text-primary" : "text-warning";
            const count = collapsed ? items.length : 0;
            const cardName = collapsed ? label : m.name;
            return (
              <div key={`${label}:${m.id}`} className="group/fav relative">
                <button type="button" onClick={() => pick(m)} aria-pressed={cur}
                  className={cn("group relative grid w-full grid-cols-[2.65rem_minmax(0,1fr)] items-start gap-2.5 rounded-[22px] px-2.5 py-3 text-left transition-[background-color,box-shadow,scale] duration-200 ease-out active:scale-[0.99]", cur ? "bg-primary/14 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_8%,transparent)]" : "hover:bg-muted/60")}>
                  <ModelIcon model={m} size={42} className="mt-0.5 rounded-full" />
                  <span className="min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-[13.5px] font-black leading-[1.15] tracking-[-0.035em] text-foreground/92">{cardName}</span>
                      <span title={h == null ? "近 24 小时暂无站内任务样本" : `近 24 小时站内任务成功率（${total} 个样本）`} className={cn("mt-0.5 shrink-0 font-mono text-[10px] font-semibold leading-none tabular-nums", h == null ? "text-muted-foreground/45" : healthCls)}>{h == null ? "暂无" : `${h}%`}</span>
                    </span>
                    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                      {featured && <span className="inline-flex shrink-0 items-center rounded-full border border-[#e9b10c]/60 bg-[#e9b10c]/12 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-[#b8860b]">重点推荐</span>}
                      <span className="max-w-[7rem] truncate text-[10px] font-semibold leading-none text-primary/85">{providerLabel(m)}</span>
                      <span className="shrink-0 rounded-full border border-border/50 px-1.5 py-0.5 text-[9px] font-medium leading-none text-muted-foreground/60">{MODALITY_LABEL[m.category as Modality] ?? m.category}</span>
                      {count > 1 && <span title={`该分组共 ${count} 条线路，进入后在顶部切换`} className="shrink-0 text-[10px] font-medium text-muted-foreground">{count} 条可切换</span>}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[10.5px] leading-4 text-muted-foreground/75">{m.description || m.id}</span>
                  </span>
                </button>
                <button type="button" aria-label={pin ? "取消收藏" : "收藏模型"} aria-pressed={pin} onClick={() => togglePin(m.id)}
                  className={cn("absolute left-1 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-card/85 backdrop-blur-sm transition-[opacity,transform,color] duration-200 hover:scale-110 hover:text-primary", pin ? "text-primary opacity-100" : "scale-90 text-muted-foreground/55 opacity-0 group-hover/fav:scale-100 group-hover/fav:opacity-100")}>
                  <Star className={cn("h-3 w-3", pin && "fill-current")} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

const ChevronDownSmall = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 opacity-60" aria-hidden><path d="m6 9 6 6 6-6" /></svg>;

/** 充值弹窗：透明 iframe 内嵌 /console/topup?embed=1（与主站 WorkbenchLayout 同一落点） */
function TopupOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: MessageEvent) => { if ((e.data as { type?: string } | null)?.type === "xoi:topup:close") onClose(); };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-label="在线充值" className="fixed inset-0 z-[70] grid place-items-start justify-center bg-black/25 pt-[7vh] backdrop-blur-[2px]" onClick={onClose}>
      <iframe src="/console/topup?embed=1" title="在线充值" className="h-[78vh] w-[min(94vw,520px)] rounded-2xl border-0 bg-transparent" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/** 顶栏（造物 topbar 简化版）：品牌 ｜ 站内邮箱 · 帮助 · 算力余额 · 充值 · 用户菜单 */
function TopBar({ onTopup }: { onTopup: () => void }) {
  const { data: self } = useSelf();
  const location = useLocation();
  const [drawer, setDrawer] = useState<"mail" | "help" | null>(null);
  const name = (self as { display_id?: string; username?: string; email?: string } | undefined)?.display_id
    || (self as { username?: string } | undefined)?.username
    || (self as { email?: string } | undefined)?.email || "XOi 用户";
  const email = (self as { email?: string } | undefined)?.email;
  // 余额统一口径：优先后端 points 字段，向下取整（与画布/主站一致；balance 是人民币口径不能直接当积分）
  const balancePoints = typeof self?.points === "number" ? self.points : typeof self?.balance === "number" ? self.balance * 10 : null;
  const balance = balancePoints == null ? null : `${Math.floor(balancePoints).toLocaleString("zh-CN")}`;
  const mail = useInbox(unreadCount);
  const mailMessages = useInbox((s) => s.messages);
  const topbarAction = "inline-flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground";
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 bg-background/80 px-2 backdrop-blur sm:px-3 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <Link to="/comic" className="group flex min-w-0 shrink items-center gap-2.5" aria-label="一站式故事工作区">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-card shadow-[0_2px_10px_rgba(30,110,255,0.16),inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_20%,transparent)]">
            <img src="/brand/xoi-touch-97191a3757eb.png" alt="XOi" className="h-[26px] w-[26px] rounded-[7px]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-bold leading-tight tracking-tight text-foreground">一站式故事工作区</span>
            <span className="mt-[2px] block truncate text-[9px] font-semibold uppercase leading-none tracking-[0.22em] text-primary-strong/80">XOi · Story Studio</span>
          </span>
        </Link>
      </div>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1">
        <button type="button" onClick={() => setDrawer("mail")} aria-label={`站内邮箱${mail ? `，${mail} 条未读` : ""}`} title="站内邮箱：生成任务的完成与失败通知" className={cn(topbarAction, "relative")}>
          <Mail size={18} />
          {mail > 0 && <span className="absolute right-1.5 top-1.5 min-w-[16px] rounded-full bg-danger px-1 text-center text-[9px] font-bold leading-4 text-white">{mail > 99 ? "99+" : mail}</span>}
        </button>
        <button type="button" onClick={() => setDrawer("help")} aria-label="帮助中心" title="帮助中心" className={cn(topbarAction, "max-md:hidden")}>
          <CircleHelp size={18} />
        </button>
        <button type="button" onClick={onTopup} title={balance ? `算力余额 ${balance} 积分，点击充值` : "正在读取算力余额"} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-border/60 px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
          <Coins size={14} className="text-warning" />
          <span className="hidden whitespace-nowrap sm:inline">算力余额</span>
          <span className="whitespace-nowrap font-semibold text-foreground">{balance ?? "…"}</span>
        </button>
        <button type="button" onClick={onTopup} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-transparent primary-gradient px-2.5 text-[12px] font-semibold text-primary-foreground transition-[filter,transform,box-shadow] hover:brightness-110 hover:shadow-[0_0_22px_color-mix(in_srgb,var(--primary)_26%,transparent)] active:scale-[0.97] sm:px-3">
          <CreditCard size={14} /><span>充值</span>
        </button>
        <Dropdown>
          <DropdownTrigger asChild>
            <button type="button" className="inline-flex h-11 items-center gap-1.5 px-1.5 sm:gap-2 sm:px-2" aria-label="用户菜单">
              <Avatar name={name} size={26} />
              <span className="hidden max-w-[120px] truncate text-[13.2px] font-medium text-foreground md:inline-block">{name}</span>
              <ChevronDownSmall />
            </button>
          </DropdownTrigger>
          <DropdownContent align="end" className="w-64">
            <div className="px-2.5 pb-2 pt-1.5">
              <div className="truncate text-[13px] font-semibold text-foreground">{name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{email || "一站式故事工作区"}</div>
              <div className="mt-2 flex h-9 items-center justify-between rounded-xl border border-[#e9b10c38] bg-[#e9b10c17] px-2.5">
                <span className="text-[11px] font-medium text-muted-foreground">算力余额</span>
                <span className="flex items-center gap-1 font-mono text-[12px] font-bold tabular-nums text-[#c28a09]"><Wallet size={12} />{balance == null ? "…" : `${balance} 积分`}</span>
              </div>
            </div>
            <div className="my-1 h-px bg-foreground/[0.06]" />
            <DropdownItem onSelect={() => setDrawer("mail")}><Mail size={15} />站内邮箱{mail > 0 && <span className="ml-auto rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{mail}</span>}</DropdownItem>
            <DropdownItem onSelect={() => setDrawer("help")}><CircleHelp size={15} />帮助中心</DropdownItem>
            <DropdownItem onSelect={onTopup}><CreditCard size={15} />充值</DropdownItem>
            <ReturnDirectorItem />
            <DropdownItem onSelect={async () => { try { await logout(); } catch { /* 会话已失效也算登出 */ } window.location.replace("/login"); }} className="text-danger data-[highlighted]:bg-danger/10"><LogOut size={15} />退出登录</DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
      <MailDrawer open={drawer === "mail"} onOpenChange={(v) => setDrawer(v ? "mail" : null)} />
      <HelpDrawer open={drawer === "help"} onOpenChange={(v) => setDrawer(v ? "help" : null)} path={location.pathname} onTopup={onTopup} />
    </header>
  );
}

function ReturnDirectorItem() {
  const embedded = window.parent !== window && new URLSearchParams(window.location.search).get("embed") === "1";
  return (
    <DropdownItem onSelect={async () => {
      if (embedded) { window.parent.postMessage({ type: "xoi:creation-mode", mode: "director" }, window.location.origin); return; }
      try { await flushCollections(); window.location.assign("/#/project"); }
      catch { toast.error("还有未保存的改动，请先下载副本并核对服务器结果。"); }
    }}><LayoutGrid size={15} />返回导演创作</DropdownItem>
  );
}

const QUICK_LINKS = [
  { to: "/comic", icon: Clapperboard, label: "一站式创作" },
  { to: "/video-studio", icon: Film, label: "生视频对话" },
  { to: "/clip", icon: Scissors, label: "智能剪辑" },
];

/* ============================== 站内邮箱（生成结果通知） ============================== */
function MailDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const messages = useInbox((s) => s.messages);
  const markAllRead = useInbox((s) => s.markAllRead);
  const remove = useInbox((s) => s.remove);
  const clearAll = useInbox((s) => s.clearAll);
  useEffect(() => { if (open) markAllRead(); }, [open, markAllRead]);
  const tone = (t?: string) => (t === "success" ? "bg-success" : t === "error" ? "bg-danger" : "bg-primary");
  const timeOf = (ts: number) => { const d = new Date(ts); const today = new Date(); const same = d.toDateString() === today.toDateString(); return same ? d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }); };
  return (
    <SideDrawer open={open} onOpenChange={onOpenChange} title="站内邮箱" description={messages.length ? `共 ${messages.length} 条 · 生成任务的完成与失败通知` : undefined} icon={<Mail size={18} className="text-primary" />}>
      {messages.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          还没有通知<br /><span className="text-xs">生成任务完成或失败后会在这里提醒你</span>
        </div>
      )}
      <div className="space-y-2">
        {messages.map((m) => (
          <article key={m.id} className={cn("rounded-[14px] border p-3.5 transition-colors", m.read ? "border-border/50 bg-card" : "border-primary/25 bg-primary/[0.04]")}>
            <div className="flex items-start gap-2.5">
              <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", tone(m.tone))} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={cn("min-w-0 truncate text-sm", m.read ? "font-medium text-foreground" : "font-semibold text-foreground")}>{m.title}</h3>
                  <time className="shrink-0 text-[11px] text-muted-foreground">{timeOf(m.createdAt)}</time>
                </div>
                {m.body && <p className="mt-1 line-clamp-2 break-words text-[12.5px] leading-5 text-muted-foreground">{m.body}</p>}
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {m.href && <button type="button" className="font-medium text-primary hover:underline" onClick={() => { onOpenChange(false); navigate(m.href!); }}>查看</button>}
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => remove(m.id)}>删除</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {messages.length > 0 && (
        <button type="button" onClick={clearAll} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border/60 text-[12.5px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground">清空邮箱</button>
      )}
      <p className="border-t border-border/60 px-1 py-3 text-xs leading-5 text-muted-foreground">通知只保存在本机（最多 200 条）；换设备后以各工作台「任务记录」为准。</p>
    </SideDrawer>
  );
}

/* ============================== 帮助中心 ============================== */
const HELP_BY_PAGE: { match: RegExp; name: string; intro: string; tips: string[] }[] = [
  {
    match: /^\/video-studio/, name: "生视频对话",
    intro: "写镜头描述直接生成视频；提交后任务在服务器继续跑，可以关闭页面稍后回来收片。",
    tips: ["模式：文生视频直接写描述；首帧上传一张起始画面；全能参考上传多张参考图保持人物 / 画风一致。", "清晰度决定画质也决定价格；时长按线路档位提供。", "提交前确认预算上限，只按实际用量扣积分，失败自动退回。", "续拍：作品卡「重新编辑」换到首帧模式，用上一段的末帧接着拍。"],
  },
  {
    match: /^\/image/, name: "生图工作台",
    intro: "写画面描述生成图片，也可以挂参考图让主体和风格跟着走。",
    tips: ["先选尺寸再写提示词；一次可生成多张，按实际张数计费。", "参考图最多 4 张：角色设定图、风格样图都可以拖进上传格。", "出片约 1–2 分钟；去「任务记录」看进度或沿用提示词。"],
  },
  {
    match: /^\/audio/, name: "语音合成",
    intro: "粘贴文案，选音色与语速，几十秒出音频，可直接收听和下载。",
    tips: ["按文案字数计费，长文案先试一小段。", "语速 0.25–4 倍可调；拿不准先用默认音色。", "生成的音频在作品卡上直接播放 / 下载。"],
  },
  {
    match: /^\/chat/, name: "对话",
    intro: "选一个对话模型，写文案、列大纲、改剧本都可以。",
    tips: ["Enter 发送，Shift + Enter 换行；右上角「新对话」清空重来。", "按用量计费，模型不同单价不同，发送前看输入区下方的单价。"],
  },
  {
    match: /^\/clip/, name: "智能剪辑",
    intro: "素材整包丢进来，说一句想要的效果，AI 自动分析、挑选并剪成片。",
    tips: ["支持短视频混剪；口播 / 带货视频剪辑即将上线。", "剪辑项目会保存在「我的剪辑项目」里，可随时回去调整。"],
  },
  {
    match: /^\/comic/, name: "一站式创作",
    intro: "从一句话创意到成片：创意 → 大纲 → 剧本 → 角色 → 分镜 → 视频，全程可回改。",
    tips: ["「从模板开始」一键套用题材种子；精品剧逐项打磨，批量剧统一设定直出。", "右侧工作台的模型只是直连生成的快捷入口，剧内制作按项目配置的模型组合走。"],
  },
];
const HELP_DEFAULT = { name: "一站式故事工作区", intro: "在这里把故事做成片：一站式创作负责从创意到成片，生视频 / 生图 / 语音 / 对话是可单独使用的直连工具，智能剪辑负责素材成片。", tips: ["左侧模型面板点一个模型，右侧就进入对应的生成工作台。", "顶栏信封收平台公告；各工作台的「任务记录」看生成进度。"] };

function HelpDrawer({ open, onOpenChange, path, onTopup }: { open: boolean; onOpenChange: (v: boolean) => void; path: string; onTopup: () => void }) {
  const page = HELP_BY_PAGE.find((h) => h.match.test(path)) ?? HELP_DEFAULT;
  const navigate = useNavigate();
  return (
    <SideDrawer open={open} onOpenChange={onOpenChange} title={<>帮助中心 <span className="text-muted-foreground">· 你在「{page.name}」</span></>} icon={<CircleHelp size={18} className="text-primary" />}>
      <div className="space-y-4">
        <p className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-[13px] leading-6 text-foreground">{page.intro}</p>
        <ul className="space-y-2">
          {page.tips.map((t, i) => (
            <li key={i} className="flex gap-2 rounded-[14px] border border-border/60 bg-card p-3 text-[13px] leading-6 text-muted-foreground">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary-strong">{i + 1}</span>{t}
            </li>
          ))}
        </ul>
        <div className="rounded-[14px] border border-border/60 bg-card p-3">
          <div className="text-xs font-semibold text-foreground">常用入口</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => { onOpenChange(false); navigate("/comic"); }} className="chip h-9 hover:bg-muted">一站式创作</button>
            <button type="button" onClick={() => { onOpenChange(false); navigate("/video-studio"); }} className="chip h-9 hover:bg-muted">生视频对话</button>
            <button type="button" onClick={() => { onOpenChange(false); onTopup(); }} className="chip h-9 hover:bg-muted">充值</button>
            <button type="button" onClick={() => { onOpenChange(false); try { void flushCollections().then(() => { window.location.assign("/#/project"); }); } catch { window.location.assign("/#/project"); } }} className="chip h-9 hover:bg-muted">返回导演创作</button>
          </div>
        </div>
        <p className="px-1 text-xs leading-5 text-muted-foreground">积分按 1 元 = 10 积分结算；生成失败的任务会自动退回积分。更多问题请联系站长处理。</p>
      </div>
    </SideDrawer>
  );
}

/** 侧栏（造物 sidebar 布局）：收起按钮 · 模式切换 · 工作区入口 · 模型面板 · 用户卡 · 返回导演 */
function Sidebar({ onTopup }: { onTopup: () => void }) {
  const location = useLocation();
  const { sidebarOpen, setSidebarOpen } = useStudio();
  const { data: self } = useSelf();
  const name = (self as { display_id?: string; username?: string; email?: string } | undefined)?.display_id
    || (self as { username?: string } | undefined)?.username
    || (self as { email?: string } | undefined)?.email || "XOi 用户";
  // 余额统一口径：优先后端 points 字段，向下取整（与画布/主站一致；balance 是人民币口径不能直接当积分）
  const balancePoints = typeof self?.points === "number" ? self.points : typeof self?.balance === "number" ? self.balance * 10 : null;
  const balance = balancePoints == null ? null : `${Math.floor(balancePoints).toLocaleString("zh-CN")}`;
  async function returnToDirector() {
    if (window.parent !== window && new URLSearchParams(window.location.search).get("embed") === "1") {
      window.parent.postMessage({ type: "xoi:creation-mode", mode: "director" }, window.location.origin);
      return;
    }
    try { await flushCollections(); window.location.assign("/#/project"); }
    catch { toast.error("还有未保存的改动，请先下载副本并核对服务器结果。"); }
  }
  if (!sidebarOpen) {
    return (
      <button type="button" onClick={() => setSidebarOpen(true)} aria-label="展开侧栏" title="展开侧栏"
        className="fixed left-2 top-1/2 z-40 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-card text-primary shadow-[0_6px_18px_rgba(0,0,0,0.14),inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_24%,transparent)] transition-colors hover:bg-primary/18 md:flex">
        <PanelLeftOpen className="h-[18px] w-[18px]" />
      </button>
    );
  }
  return (
    <aside className="sticky top-[calc(3.5rem+13px)] mt-[13px] hidden h-[calc(100dvh-3.5rem-26px)] w-[288px] shrink-0 flex-col overflow-hidden rounded-pane border border-foreground/10 bg-card md:flex">
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="px-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/80">导演台</span>
        <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onClick={() => setSidebarOpen(false)} aria-label="收起侧栏"><PanelLeftClose className="h-[18px] w-[18px]" /></button>
      </div>
      {/* 模式切换：快速创作 / 导演创作（保留自旧版） */}
      <div className="grid grid-cols-2 gap-1 px-3 pb-2 pt-1" role="group" aria-label="切换创作模式">
        <button type="button" className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-primary/30 bg-primary/10 text-[12px] font-semibold text-primary-strong" aria-current="page"><Clapperboard size={14} />快速创作</button>
        <button type="button" onClick={returnToDirector} className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-border/60 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"><LayoutGrid size={14} />导演创作</button>
      </div>
      {/* 工作区入口（造物 QuickLinks 同款） */}
      <div className="flex gap-1 px-3 pb-2">
        {QUICK_LINKS.map((q) => (
          <Link key={q.to} to={q.to} aria-current={location.pathname === q.to ? "page" : undefined}
            className={cn("inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold leading-none transition-colors", location.pathname === q.to ? "bg-primary/12 text-primary-strong" : "bg-muted/50 text-foreground/85 hover:bg-muted hover:text-foreground")}>
            <q.icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{q.label}</span>
          </Link>
        ))}
      </div>
      <ModelPanel />
      {/* 用户卡（造物 UserCard 同款） */}
      <div className="shrink-0 border-t border-border px-3 pb-2 pt-2">
        <div className="rounded-[18px] border border-border/70 bg-card/20 px-3 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0"><Avatar name={name} size={35} /><span className="absolute -bottom-px -right-px h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] ring-2 ring-card" /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold leading-tight text-foreground">{name}</div>
              <div className="flex items-center gap-0.5 text-[10px] leading-tight text-warning"><Coins className="h-2.5 w-2.5" /><span className="truncate">算力余额 {balance ?? "…"}</span></div>
            </div>
            <button type="button" onClick={onTopup} title="充值" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary"><CreditCard size={14} /></button>
          </div>
        </div>
      </div>
      <div className="shrink-0 px-3 pb-3 pt-1">
        <button type="button" onClick={returnToDirector} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border/60 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
          <ArrowLeft size={15} />返回导演创作
        </button>
      </div>
    </aside>
  );
}

/** 手机端：左下角浮标开简化抽屉（同一份模型面板） */
function MobileNav({ onTopup }: { onTopup: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="打开侧栏" className="fixed bottom-5 left-4 z-40 grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-pop md:hidden"><PanelLeftOpen size={18} /></button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div aria-hidden className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute bottom-0 left-0 top-14 flex w-[min(288px,86vw)] flex-col overflow-hidden rounded-r-pane border border-border bg-card shadow-soft">
            <div className="flex items-center justify-between px-3 pt-2">
              <span className="px-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/80">导演台</span>
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="关闭"><PanelLeftClose size={16} /></button>
            </div>
            <ModelPanel onPicked={() => setOpen(false)} />
            <div className="shrink-0 px-3 pb-3 pt-2">
              <button type="button" onClick={() => { setOpen(false); onTopup(); }} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border/60 text-[12.5px] font-medium text-muted-foreground"><CreditCard size={14} />充值</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 全局外壳：顶栏 + （侧栏 + 主区）。媒体页自带内边距，漫剧/剪辑页铺满主区。 */
export function AppShell({ children }: { children: React.ReactNode; sidebar?: boolean }) {
  const location = useLocation();
  const embedded = window.parent !== window && new URLSearchParams(window.location.search).get("embed") === "1";
  const [topup, setTopup] = useState(false);
  const { data: capabilities } = useQuery({
    queryKey: ["one-stop-capabilities", accountKey()],
    queryFn: () => oneStopRequest<{ enabled: boolean }>("/api/one-stop/generation/capabilities"),
    staleTime: 60000, retry: false,
  });
  const col = collection("comic"), styles = collection("comic-styles");
  const error = col.state.saveError || styles.state.saveError;
  const saving = col.state.saving || styles.state.saving;
  useEffect(() => {
    if (embedded) {
      window.parent.postMessage({ type: "xoi:one-stop-ready" }, window.location.origin);
      window.parent.postMessage({ type: "xoi:one-stop-location", path: location.pathname }, window.location.origin);
    }
  }, [embedded, location.pathname]);
  function download() {
    const a = document.createElement("a");
    a.download = "XOi-未保存项目副本.json";
    const url = URL.createObjectURL(new Blob([JSON.stringify({ comic: col.unsaved(), styles: styles.unsaved() }, null, 2)], { type: "application/json" }));
    a.href = url; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar onTopup={() => setTopup(true)} />
      {saving && (
        <div role="status" className="border-t border-border/60 bg-muted/60 px-4 py-1 text-center text-[12px] text-muted-foreground">正在保存…</div>
      )}
      {capabilities && !capabilities.enabled && (
        <div role="status" className="border-t border-warning/30 bg-warning/10 px-4 py-1.5 text-center text-[12px] text-warning">
          暂时暂停新生成请求；已有项目可继续读取与编辑，本页保存操作不扣积分。
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center justify-center gap-3 border-t border-danger/30 bg-danger/10 px-4 py-1.5 text-[12px] text-danger">
          {error}。本页保留未保存内容，请不要重复提交或关闭页面。
          <button type="button" onClick={download} className="inline-flex items-center gap-1 rounded-full border border-danger/40 px-2 py-0.5 font-medium hover:bg-danger/10"><Download size={12} />下载未保存副本</button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 md:pl-[9px]">
        <Sidebar onTopup={() => setTopup(true)} />
        <main className="min-h-0 min-w-0 flex-1">{children}</main>
      </div>
      <MobileNav onTopup={() => setTopup(true)} />
      <TopupOverlay open={topup} onClose={() => setTopup(false)} />
    </div>
  );
}
