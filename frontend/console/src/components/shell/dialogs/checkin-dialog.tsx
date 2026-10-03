"use client";
// 每日签到：站长在代理商中心「站内运营 → 活动管理」里开启后，用户菜单出现入口，每天可领一次。
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Flame, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, loadAuth } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface CheckinStatus { enabled: boolean; amount: number; checkedInToday: boolean; weekDays: number; monthDays: number; streak: number; days: string[] }

export function useCheckin() {
  return useQuery({ queryKey: ["checkin"], queryFn: () => api<CheckinStatus>("/api/checkin"), enabled: typeof window !== "undefined" && !!loadAuth(), staleTime: 60_000, retry: false });
}

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];
/** 本周七天（周一起），标出已签到的 */
function weekDays(): { key: string; label: string; today: boolean }[] {
  const now = new Date(Date.now() + 8 * 3600_000);
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const t = now.toISOString().slice(0, 10);
  return WEEK.map((label, i) => { const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i); const key = d.toISOString().slice(0, 10); return { key, label, today: key === t }; });
}

export function CheckinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient(); const { data, isLoading } = useCheckin(); const [busy, setBusy] = useState(false);
  const done = new Set(data?.days ?? []);
  const claim = async () => {
    setBusy(true);
    try {
      const r = await api<CheckinStatus & { got: number }>("/api/checkin", { method: "POST", body: "{}" });
      qc.setQueryData(["checkin"], r); qc.invalidateQueries({ queryKey: ["self"] });
      toast.success(`签到成功，到账 ⚡${r.got.toFixed(3)}`);
    } catch (e) { toast.error((e as Error).message || "签到失败，请重试"); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="每日签到" description="每天领一次，直接进你的余额。" className="w-[min(92vw,420px)]">
        {isLoading ? <div className="mt-3 h-36 rounded-2xl shimmer" /> : !data?.enabled ? (
          <p className="mt-4 text-sm text-muted-foreground">签到活动暂时没有开启，先去创作吧。</p>
        ) : (
          <div className="mt-3 space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
              <span className="inline-flex items-center gap-1.5 text-sm"><Flame size={15} className="text-primary" />连续签到 <b className="font-mono tabular-nums">{data.streak}</b> 天</span>
              <span className="text-xs text-muted-foreground">本周 {data.weekDays} 天 · 本月 {data.monthDays} 天</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays().map((d) => (
                <div key={d.key} className={cn("flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px]", done.has(d.key) ? "border-primary/40 bg-primary/10 text-primary" : d.today ? "border-dashed border-primary/40 text-foreground" : "border-border/60 text-muted-foreground")}>
                  <span>{d.label}</span>
                  <CalendarCheck size={14} className={cn(done.has(d.key) ? "opacity-100" : "opacity-25")} />
                </div>
              ))}
            </div>
            <Button className="w-full" disabled={busy || data.checkedInToday} onClick={() => void claim()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={15} />}
              {data.checkedInToday ? "今天已签到" : `签到领 ⚡${data.amount.toFixed(3)}`}
            </Button>
            <p className="text-[11px] leading-5 text-muted-foreground">签到金额直接进余额，可用于站内任何生成。每天 0 点（北京时间）刷新。</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
