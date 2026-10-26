// 从作品库选参考素材（造物 MediaPicker「从收藏夹/作品库选」的本站版）：
// 列出本模态已完成的作品，选中后按上传格种类挂进参考素材。
import { useMemo } from "react";
import { toast } from "sonner";
import { cn, timeHM } from "@/lib/utils";
import { OmniDialog } from "./ui";
import { useStudio, type Work } from "./store";
import type { RefKind } from "./media-page";

export function WorksPickerDialog({ open, onOpenChange, kind, cap, existing, onPick }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  /** 要选的素材种类（与上传格一致） */
  kind: RefKind;
  /** 这一格还剩几个空位 */
  cap: number;
  /** 已挂的素材地址（防重复挂） */
  existing: string[];
  onPick: (urls: string[]) => void;
}) {
  const works = useStudio((s) => s.works);
  const label = kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
  const list = useMemo(() => works
    .filter((w) => w.kind === kind && w.status === "done" && w.url && !existing.includes(w.url))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60), [works, kind, existing]);
  const pick = (w: Work) => {
    if (cap <= 0) { toast.error(`${label}上传格已满`); return; }
    onPick([w.url!]);
    toast.success(`已挂进${label}上传格`);
    onOpenChange(false);
  };
  return (
    <OmniDialog open={open} onOpenChange={onOpenChange} title={`从作品库选${label}`} description={`最近完成的${label}作品；选中后挂进当前上传格`} className="sm:max-w-xl">
      <div className="max-h-[60vh] space-y-2 overflow-y-auto px-4 py-4 sm:px-6">
        {list.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">还没有可用的{label}作品</div>}
        {list.map((w) => (
          <button key={w.id} type="button" onClick={() => pick(w)} className={cn("flex w-full items-center gap-3 rounded-[14px] border border-border/60 bg-card p-2.5 text-left transition-colors hover:bg-muted/50")}>
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
              {kind === "video" ? <video src={w.url} muted preload="metadata" className="h-full w-full object-cover" />
                : kind === "audio" ? <span className="grid h-full w-full place-items-center text-muted-foreground">♪</span>
                : <img src={w.url} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">{w.prompt || "（无提示词）"}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{timeHM(w.createdAt)}{w.meta?.resolution ? ` · ${String(w.meta.resolution)}` : ""}{w.meta?.seconds ? ` · ${String(w.meta.seconds)}s` : ""}</span>
            </span>
            <span className="shrink-0 text-[11px] font-medium text-primary">选用</span>
          </button>
        ))}
      </div>
    </OmniDialog>
  );
}
