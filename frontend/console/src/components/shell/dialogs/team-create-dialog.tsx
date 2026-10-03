"use client";
// 开启团队版：服务端建团队空间（/api/team，一个人最多 1 个团队），外观与参考站一致
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
const BULLETS = ["你的个人作品保留在个人空间", "团队空间从空白开始", "随时可切回个人空间"];

/** 用户菜单 → 开启团队版 */
export function TeamCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    const n = name.trim(); if (!n) { toast.error("请输入团队名称"); return; }
    setBusy(true);
    try {
      const cur = await api<{ role: string }>("/api/team");
      if (cur.role === "owner") { toast.info("你已有一个团队"); onOpenChange(false); router.push("/team"); return; }
      if (cur.role === "member") { toast.error("你是其他团队的成员，不能再开通团队"); return; }
      await api("/api/team", { method: "POST", body: JSON.stringify({ action: "create", name: n }) });
      toast.success("团队空间已开通"); setName(""); onOpenChange(false); router.push("/team");
    } catch (e) { toast.error((e as Error).message || "创建失败，请重试"); } finally { setBusy(false); }
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-white/60 backdrop-blur-[18px] backdrop-saturate-[1.08] animate-in fade-in-0 dark:bg-black/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex w-[min(calc(100%-32px),493px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[17.6px] rounded-[24px] border border-primary/12 bg-[linear-gradient(rgba(255,255,255,0.98),rgba(246,244,250,0.96))] p-[26.4px] font-medium shadow-[0_20px_46px_-20px_rgba(20,20,31,0.28)] outline-none animate-in fade-in-0 zoom-in-95 dark:bg-[linear-gradient(rgba(32,32,42,0.98),rgba(24,24,32,0.96))]">
          <div className="flex flex-col gap-[8.8px] border-b border-border/30 pb-[13.2px]">
            <DialogPrimitive.Title className="flex items-center gap-[8.8px] text-[22px] font-bold leading-[22px]"><span className="grid h-[31px] w-[31px] shrink-0 place-items-center rounded-[6px] bg-primary/15 text-primary"><UsersRound className="h-[18px] w-[18px]" /></span>开启团队版</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-[15.4px] leading-[26.4px] text-muted-foreground">给团队起个名字。个人作品保留，团队空间从空白开始。</DialogPrimitive.Description>
          </div>
          <div className="pt-[4.4px]">
            <div className="mb-[17.6px]"><label htmlFor="team-name" className="mb-[6.6px] block text-[13.2px] leading-[17.6px] text-muted-foreground">团队名称</label><input id="team-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="例如 鲲鹏创意" autoFocus className="h-[40px] w-full rounded-[4px] border border-border bg-card px-[13.2px] py-[4.4px] text-[15.4px] font-medium outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" /></div>
            <ul className="mb-[17.6px] space-y-[6.6px] text-[12.5px] leading-[20px] text-muted-foreground">{BULLETS.map((b) => <li key={b} className="flex items-center gap-[8.8px]"><Check className="h-[15px] w-[15px] shrink-0 text-success" />{b}</li>)}</ul>
            <button type="button" disabled={busy} onClick={submit} className="flex h-[44px] w-full items-center justify-center gap-[8.8px] rounded-[6px] bg-[linear-gradient(to_right_bottom,var(--primary),#6a3fd9)] px-[17.6px] py-[11px] text-[15.4px] font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-60">{busy ? "创建中…" : "创建团队并进入后台"}</button>
          </div>
          <DialogPrimitive.Close aria-label="关闭" className="absolute right-[17px] top-[19px] grid h-[40px] w-[40px] place-items-center rounded-[10px] border border-border/35 bg-white/20 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"><X size={18} /></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
