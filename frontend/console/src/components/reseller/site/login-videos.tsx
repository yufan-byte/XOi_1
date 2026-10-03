"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clapperboard, Info, Star } from "lucide-react";
import { toast } from "sonner";
import { useResellerSection, useSaveSection } from "@/lib/reseller/client";
import { DEFAULT_DATA } from "@/lib/reseller/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VaultPanel } from "@/components/reseller/common";

interface LoginVideo { id: string; url: string; size: number }

export function useLoginVideos() {
  return useQuery({
    queryKey: ["reseller-login-videos"], staleTime: 3_600_000,
    queryFn: async () => { const r = await fetch("/api/reseller/upload"); const j = (await r.json()) as { success: boolean; message?: string; data?: LoginVideo[] }; if (!j.success) throw new Error(j.message ?? "加载失败"); return j.data ?? []; },
  });
}
const mb = (n: number) => (n ? `${(n / 1048576).toFixed(1)} MB` : "—");

/** 可选视频列表：设为当前展示（theme.loginVideo） */
export function LoginVideoList({ value, onSelect, busy }: { value: string; onSelect: (url: string) => void; busy?: boolean }) {
  const { data, isLoading, error } = useLoginVideos();
  return (
    <section className="pane p-6">
      <div className="flex items-center gap-2 font-semibold"><Clapperboard size={18} className="text-primary" />可选视频</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
        <span>{value ? "已选择自定义视频，客户登录页将展示该视频。" : "未选择则使用平台默认视频。"}</span>
        {value && <button type="button" disabled={busy} onClick={() => onSelect("")} className="text-primary hover:underline disabled:opacity-50">恢复平台默认</button>}
      </div>
      {error ? <div className="mt-4 text-sm text-danger">视频列表加载失败：{(error as Error).message}</div> : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="aspect-[4/3] rounded-tile shimmer" />)}
          {(data ?? []).map((v) => { const active = v.url === value; return (
            <div key={v.id} className={cn("overflow-hidden rounded-tile border bg-card", active && "border-primary ring-2 ring-primary/30")}>
              <video src={v.url} controls muted playsInline preload="metadata" className="aspect-video w-full bg-black object-cover" />
              <div className="p-4">
                <div className="font-medium">未命名视频</div><div className="text-sm text-muted-foreground">{mb(v.size)}</div>
                <button type="button" disabled={busy || active} onClick={() => onSelect(v.url)} className={cn("mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium", active ? "border-primary bg-primary-tint text-primary" : "hover:bg-muted disabled:opacity-50")}>
                  {active ? <><CheckCircle2 size={16} />当前展示</> : <><Star size={16} />设为当前展示</>}
                </button>
              </div>
            </div>
          ); })}
        </div>
      )}
    </section>
  );
}

/** 登录页管理：独立页面版（参考站 vault 面板样式；选择后立即保存） */
export function LoginVideoPanel() {
  const { data: theme, isLoading, error: themeError } = useResellerSection("theme"); const save = useSaveSection(); const [busy, setBusy] = useState(false);
  const videos = useLoginVideos(); const value = theme?.loginVideo ?? "";
  const select = async (url: string) => {
    setBusy(true);
    try { await save("theme", { ...DEFAULT_DATA.theme, ...(theme ?? {}), loginVideo: url }, "reseller.theme.loginVideo"); toast.success(url ? "已设为当前展示" : "已恢复平台默认视频"); }
    catch (e) { toast.error(`保存失败：${(e as Error).message}`); } finally { setBusy(false); }
  };
  const note = "rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground";
  return (
    <div className="flex flex-1 flex-col gap-3 pb-24">
      {themeError && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">加载失败：{(themeError as Error).message}</div>}
      <div className={cn(note, "mb-4 flex items-start gap-2")}><Info size={14} className="mt-px shrink-0" /><span>视频由平台统一管理，您可选择用于自己白标登录页的视频。</span></div>
      <VaultPanel title="可选视频" icon={<Clapperboard />}>
        <p className={cn(note, "mb-4 flex flex-wrap items-center justify-between gap-2")}><span>{value ? "已选择自定义视频，客户登录页将展示该视频。" : "未选择则使用平台默认视频。"}</span>{value && <button type="button" disabled={busy} onClick={() => select("")} className="text-primary hover:underline disabled:opacity-50">恢复平台默认</button>}</p>
        {videos.error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm text-danger">视频列表加载失败：{(videos.error as Error).message}</div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(isLoading || videos.isLoading) && Array.from({ length: 3 }).map((_, i) => <div key={i} className="aspect-[4/3] rounded-[18px] shimmer" />)}
          {!isLoading && (videos.data ?? []).map((v) => { const active = v.url === value; return (
            <div key={v.id} className={cn("group relative flex flex-col overflow-hidden rounded-[18px] border border-border/50 bg-muted/30 transition-colors hover:border-border/70", active && "border-primary ring-2 ring-primary/30")}>
              <div className="relative aspect-video w-full overflow-hidden bg-muted"><video src={v.url} muted playsInline preload="metadata" controls className="h-full w-full object-cover" /></div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="min-w-0"><div className="truncate text-sm font-medium text-foreground">未命名视频</div><div className="mt-1 text-xs text-muted-foreground">{mb(v.size)}</div></div>
                <div className="mt-auto flex items-center gap-2">
                  <Button type="button" variant={active ? "default" : "secondary"} disabled={busy || active} onClick={() => select(v.url)} className="h-8 gap-1.5 px-3 text-sm">{active ? <><CheckCircle2 size={15} />当前展示</> : <><Star size={15} />设为当前展示</>}</Button>
                </div>
              </div>
            </div>
          ); })}
        </div>
      </VaultPanel>
    </div>
  );
}
