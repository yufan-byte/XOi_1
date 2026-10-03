"use client";
import { Copy, Gift, Link2, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSelf } from "@/lib/queries";
import { usePublicSettings } from "@/components/signup/use-public-settings";
import { fmtCny, quotaToUsd } from "@/lib/utils";

/** 返利比例：站长设置里既可能存 10（%）也可能存 0.1，统一显示为百分数 */
const ratePct = (r: number) => { const v = r > 0 && r < 1 ? r * 100 : r; return Number.isInteger(v) ? String(v) : v.toFixed(1); };

/** 我的推广（用户侧）：邀请码 / 邀请链接 / 已邀请 / 累计返利；站长在设置里开启「用户邀请」后出现在用户菜单 */
export function PromotionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: self } = useSelf(open); const { data: st } = usePublicSettings();
  const code = self?.aff_code ?? "";
  const link = code && typeof window !== "undefined" ? `${window.location.origin}/signup?ref=${code}` : "";
  const reward = st?.inviteReward === "cash" ? "现金佣金" : "算力";
  const copy = async (v: string, what: string) => { if (!v) { toast.error(`暂无${what}`); return; } try { await navigator.clipboard.writeText(v); toast.success(`已复制${what}`); } catch { toast.error("复制失败，请手动复制"); } };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="我的推广" description={`分享你的邀请码，好友充值你即可获得 ${ratePct(st?.inviteRate ?? 0)}% 返利（${reward}）。`} className="w-[min(92vw,520px)]">
        <div className="space-y-3">
          <div className="rounded-2xl border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Gift size={13} />我的邀请码</div>
            <div className="mt-1 flex items-center justify-between gap-3"><span className="font-mono text-xl font-semibold tracking-wider">{code || "—"}</span><Button size="sm" variant="secondary" className="gap-1.5" onClick={() => copy(code, "邀请码")}><Copy size={13} />复制</Button></div>
          </div>
          <div className="rounded-2xl border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Link2 size={13} />邀请链接</div>
            <div className="mt-1 flex items-center justify-between gap-3"><span className="min-w-0 break-all text-sm">{link || "—"}</span><Button size="sm" variant="secondary" className="shrink-0 gap-1.5" onClick={() => copy(link, "邀请链接")}><Copy size={13} />复制</Button></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border px-4 py-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users size={13} />已邀请</div><div className="mt-1 font-mono text-2xl font-semibold">{self ? self.aff_count ?? 0 : "…"}</div></div>
            <div className="rounded-2xl border px-4 py-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet size={13} />累计返利 ⚡</div><div className="mt-1 font-mono text-2xl font-semibold text-primary">{self ? fmtCny(quotaToUsd(self.aff_history_quota ?? 0)) : "…"}</div></div>
          </div>
          <p className="text-center text-xs text-muted-foreground">返利由站点从利润中发放</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
