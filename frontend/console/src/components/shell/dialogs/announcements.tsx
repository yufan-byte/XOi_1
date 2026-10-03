"use client";
/**
 * 系统公告（顶栏铃铛）。
 *
 * 数据源与主站**统一**：都读 `/announcements.json`（backend/data/web/announcements.json，
 * 站长在控制台「官方公告」里编辑，直写这个文件）。
 * 原先这里读的是打包进来的 `@/data/announcements.json`（造物的静态快照），
 * 所以站长在后台发的公告，控制台这边看不到 —— 两处口径不一致。
 */
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountDialog } from "./account-dialog-shell";

export interface Announcement { id: string; title: string; content: string; type?: string; published_at?: string; created_at?: string }

const when = (a: Announcement) => a.published_at ?? a.created_at ?? "";
const shortDate = (a: Announcement) => { const d = new Date(when(a)); return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; };

/** 公告正文：参考站 prose-sm 排版（13px 正文、13.5px 小标题、加粗转前景色、链接品牌色加粗） */
function AnnBody({ a }: { a: Announcement }) {
  const md = a.content.replace(/<a href="\/zh-CN(\/[^"]*)"[^>]*>([^<]*)<\/a>/g, "[$2]($1)");
  return (
    <div className="text-[13px] leading-[1.62] text-muted-foreground [&_em]:italic [&_h1]:mb-1.5 [&_h1]:mt-[17.6px] [&_h1]:text-[14px] [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h2]:mb-[6.6px] [&_h2]:mt-[17.6px] [&_h2]:text-[13.5px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-foreground [&_hr]:my-[15.4px] [&_hr]:border-border [&_li]:my-1 [&_li]:pl-1.5 [&_ol]:my-[8.8px] [&_ol]:list-decimal [&_ol]:pl-[23.6px] [&_p]:mb-[14.9px] [&_p]:mt-0 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:my-[8.8px] [&_ul]:list-disc [&_ul]:pl-[23.6px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} className="font-bold text-primary hover:underline">{children}</a> }}>{md}</ReactMarkdown>
    </div>
  );
}

/** 系统公告：顶栏铃铛打开（参考站 omni 弹窗外壳 880px：整块面板滚动，底部分页条） */
export function AnnouncementsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [list, setList] = useState<Announcement[]>([]);
  const [i, setI] = useState(0);

  // 打开时才拉：公告是低频内容，没必要随首屏加载
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetch("/announcements.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const items = (j?.data ?? []) as Announcement[];
        setList(Array.isArray(items) ? items.filter((x) => x && x.title) : []);
        setI(0);
      })
      .catch(() => { /* 拿不到就显示空态 */ });
    return () => { alive = false; };
  }, [open]);

  const a = list[i];
  const nav = (n: number) => setI(Math.max(0, Math.min(list.length - 1, n)));
  return (
    <AccountDialog open={open} onOpenChange={onOpenChange} title="系统公告" description={`共 ${list.length} 条公告`} className="w-[min(calc(100%-32px),880px)]">
      {!a ? (
        <p className="mt-[17.6px] py-8 text-center text-[13px] text-muted-foreground">暂无公告</p>
      ) : (
        <article className="mt-[17.6px]">
          <div className="mb-[11px] flex items-center gap-[11px]">
            <span className="inline-flex items-center gap-[5px] rounded-full bg-primary/18 px-[9px] py-[3px] text-[10.5px] font-[620] leading-[16.8px] text-primary"><Megaphone className="h-3 w-3" />{a.type === "maintenance" ? "维护" : a.type === "notice" ? "公告" : "更新"}</span>
            <span className="ml-auto font-mono text-[11px] leading-[17.6px] text-muted-foreground">{shortDate(a)}</span>
          </div>
          <h3 className="mb-[11px] text-balance text-[15px] font-bold leading-snug tracking-tight text-foreground">{a.title}</h3>
          <AnnBody a={a} />
        </article>
      )}
      {a ? (
      <div className="mt-[4px] flex items-center justify-between gap-[10px] border-t border-foreground/[0.06] pt-[13px]">
        <div className="flex items-center gap-[11px]">
          <span className="font-mono text-[11.5px] leading-[18.4px] text-muted-foreground">{i + 1} / {list.length}</span>
          <div className="flex items-center gap-1.5">{list.map((x, n) => <button key={x.id ?? n} type="button" aria-label={String(n + 1)} aria-current={n === i} onClick={() => setI(n)} className={cn("h-1.5 rounded-full transition-all duration-300", n === i ? "w-5 bg-primary" : "w-1.5 bg-primary/25 hover:bg-primary/45")} />)}</div>
        </div>
        <div className="flex items-center gap-[6px]">
          <button type="button" aria-label="上一条" disabled={i === 0} onClick={() => nav(i - 1)} className={pagerBtn}><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="下一条" disabled={i >= list.length - 1} onClick={() => nav(i + 1)} className={pagerBtn}><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      ) : null}
    </AccountDialog>
  );
}

const pagerBtn = "inline-flex h-[25px] items-center justify-center rounded-full border border-border px-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40";
