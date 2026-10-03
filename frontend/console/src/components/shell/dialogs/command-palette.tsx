"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as D from "@radix-ui/react-dialog";
import { flatMenu } from "@/components/reseller-menu";
import { cn } from "@/lib/utils";

type Item = { id: string; group: "后台页面" | "操作"; label: string; desc?: string; meta?: string; run: () => void };
const GROUPS: Item["group"][] = ["后台页面", "操作"];

/**
 * 全局搜索（⌘K）：参考站样式——输入框行 + 分组的描边行列表。
 *
 * ⚠️ XOi 改动：条目来源换了。
 * 造物原版这里硬编码的是造物**产品页**（FEATURED 智能体 /chat /square /dashboard
 * /skills /vibeapp /guide，外加模型目录），console 里这些路由一个都不存在，
 * 点下去会被 `*` 兜底路由弹回登录页。
 * 现在改用 components/reseller-menu.ts（与侧栏同一份数据源），只列真实挂载的页面。
 */
export function CommandPalette({ open, onOpenChange, onTopup }: { open: boolean; onOpenChange: (v: boolean) => void; onTopup: () => void }) {
  const router = useRouter(); const { theme, setTheme } = useTheme();
  const [q, setQ] = useState(""); const [idx, setIdx] = useState(0); const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); onOpenChange(true); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onOpenChange]);
  useEffect(() => { if (!open) { setQ(""); setIdx(0); } }, [open]);
  // 参考站：搜索浮层只覆盖主内容区（main），卡片在其中居中
  const [area, setArea] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => { if (!open) return; const measure = () => { const r = document.querySelector("main")?.getBoundingClientRect(); setArea(r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: Math.min(r.height, window.innerHeight - r.top) } : null); }; measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [open]);
  const go = (href: string) => { onOpenChange(false); router.push(href); };
  const items = useMemo<Item[]>(() => {
    const pages: Item[] = flatMenu().map((n) => ({
      id: `p-${n.href}`, group: "后台页面" as const, label: n.label,
      desc: n.group === "后台" ? n.href : `${n.group} · ${n.href}`,
      run: () => go(n.href),
    }));
    const actions: Item[] = [
      { id: "a-topup", group: "操作", label: "充值", meta: "modal", run: () => { onOpenChange(false); onTopup(); } },
      { id: "a-theme", group: "操作", label: theme === "dark" ? "切换到亮色主题" : "切换到深色主题", meta: "theme", run: () => { setTheme(theme === "dark" ? "light" : "dark"); onOpenChange(false); } },
    ];
    const s = q.trim().toLowerCase();
    const match = (i: Item) => !s || [i.label, i.desc, i.meta, i.id].join(" ").toLowerCase().includes(s);
    return [...pages.filter(match), ...actions.filter(match)];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, theme]);
  useEffect(() => setIdx(0), [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" }); }, [idx]);
  const row = (it: Item) => {
    const i = items.indexOf(it); const on = i === idx;
    return (
      <button key={it.id} type="button" data-idx={i} onMouseEnter={() => setIdx(i)} onClick={it.run} className={cn("w-full rounded-xl border px-3 py-2 text-left transition-colors", on ? "border-border bg-muted" : "border-border/60 bg-muted/40 hover:border-border hover:bg-muted")}>
        {it.desc !== undefined ? (
          <><div className="truncate text-[13px] font-medium text-foreground">{it.label}</div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{it.desc}</div></>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-[13px] font-medium text-foreground">{it.label}</span>
            <span className="flex shrink-0 items-center gap-2">
              {it.meta && <span className={cn("text-[11px] text-muted-foreground", !it.meta.startsWith("/") && "font-mono")}>{it.meta}</span>}
            </span>
          </div>
        )}
      </button>
    );
  };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay style={area ?? undefined} className={cn("fixed z-50 bg-background/50 backdrop-blur-[2px] animate-in fade-in-0", !area && "inset-0")} />
        <D.Content style={area ?? undefined} onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }} className={cn("fixed z-50 flex items-center justify-center px-4 py-6 outline-none", !area && "inset-0")}>
          <div className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card/[0.98] p-3 shadow-2xl animate-in fade-in-0 zoom-in-95">
          <D.Title className="sr-only">全局搜索</D.Title><D.Description className="sr-only">搜索后台页面和操作</D.Description>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2">
            <span className="font-mono text-[11px] text-muted-foreground">⌘K</span>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); } if (e.key === "Enter") items[idx]?.run(); }} placeholder="搜索后台页面和操作..." className="w-full flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70" />
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">Esc</button>
          </div>
          <div ref={listRef} className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {GROUPS.map((g) => { const list = items.filter((i) => i.group === g); if (!list.length) return null; return (
              <section key={g}>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{g}</div>
                <div className="flex flex-col gap-1">{list.map(row)}</div>
              </section>
            ); })}
            {items.length === 0 && <div className="py-10 text-center text-[13px] text-muted-foreground">没有匹配结果</div>}
          </div>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
