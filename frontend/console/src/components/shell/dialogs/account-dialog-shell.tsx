"use client";
// 用户菜单账户类弹窗的统一外壳：与参考站 omni-modal 一致（1.4px 描边外壳 + 内层滚动面板 + 标题/副标题 + 胶囊分段标签）
// 注意：根字号为 110%，尺寸一律用 px 任意值，避免 rem 刻度被放大
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccountDialog({ open, onOpenChange, title, description, className, overlayClassName, contentClassName, children }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; className?: string; overlayClassName?: string; contentClassName?: string; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* overlayClassName：iframe 嵌入（主站充值弹窗）时传 bg-transparent backdrop-blur-0，
            遮罩交给宿主画，避免 iframe 内外双层遮罩叠加过暗 */}
        <DialogPrimitive.Overlay className={cn("xoi-dialog-mask fixed inset-0 z-50 bg-white/60 backdrop-blur-[18px] backdrop-saturate-[1.08] animate-in fade-in-0 dark:bg-black/50", overlayClassName)} />
        <DialogPrimitive.Content className={cn("xoi-dialog-surface fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100vh-32px)] w-[min(calc(100%-32px),520px)] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-black/[0.09] p-[1.4px] font-medium shadow-[0_1px_3px_rgba(20,20,31,0.06),0_20px_46px_-20px_rgba(20,20,31,0.28)] outline-none animate-in fade-in-0 zoom-in-95 dark:bg-white/[0.09]", className, contentClassName)}>
          <div className="max-h-[calc(100vh-34.8px)] overflow-y-auto rounded-[12.6px] bg-card px-[22px] pb-[20px] pt-[22px]">
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{description || title}</DialogPrimitive.Description>
            <div className="pr-[35.2px]">
              <h4 className="text-[16.5px] font-[660] leading-[18.15px] text-foreground">{title}</h4>
              {description && <p className="mt-[3px] text-[12px] font-medium leading-[19.2px] text-muted-foreground">{description}</p>}
            </div>
            {children}
          </div>
          <DialogPrimitive.Close aria-label="关闭" className="absolute right-[17px] top-[18px] grid h-[40px] w-[40px] place-items-center rounded-[10px] border border-border/35 bg-white/20 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"><X size={18} /></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** 胶囊分段标签（参考站 tablist：40px 高、3px 内边距、12.5px/560 字重）；inline 时按内容宽度，否则等分 */
export function AccountTabs<T extends string>({ value, options, onChange, className, inline, wrap = true }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; className?: string; inline?: boolean; wrap?: boolean }) {
  const list = (
    <div role="tablist" className={cn("h-[40px] gap-[2px] rounded-full border border-foreground/[0.06] bg-foreground/[0.06] p-[3px]", inline ? "inline-flex" : "flex", !wrap && className)}>
      {options.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={cn("flex h-[32px] items-center justify-center gap-[6px] whitespace-nowrap rounded-full px-[14px] py-[6px] text-[12.5px] font-[560] leading-[20px] transition-colors", !inline && "flex-1", value === k ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,20,31,0.08)]" : "text-muted-foreground hover:text-foreground")}>{l}</button>)}
    </div>
  );
  return wrap ? <div className={cn("pt-[15px]", className)}>{list}</div> : list;
}

/** 参考站小节标题（13.2px/600 灰色） */
export const AccountSectionTitle = ({ children }: { children: React.ReactNode }) => <h3 className="mb-[13.2px] text-[13.2px] font-semibold leading-[17.6px] text-muted-foreground">{children}</h3>;
/** 参考站表单输入（42px 高、4px 圆角） */
export const accountInputCls = "h-[42px] w-full rounded-[4px] border border-border bg-muted/60 px-[13.2px] py-[4.4px] text-[15.4px] font-medium outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/40";
export const accountLabelCls = "mb-[8.8px] flex text-[15.4px] font-medium leading-[15.4px]";
/** 参考站主按钮（40px 高、6px 圆角、紫色渐变） */
export const accountPrimaryBtn = "inline-flex h-[40px] items-center justify-center gap-[8.8px] rounded-[6px] bg-[linear-gradient(135deg,var(--primary),#6a3fd9)] px-[22px] text-[15.4px] font-medium leading-[22px] text-white shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_24%,transparent)] transition-[filter] hover:brightness-110 disabled:opacity-60";
export const accountSecondaryBtn = "inline-flex h-[42px] items-center justify-center gap-[8.8px] rounded-[6px] border border-border bg-card px-[17.6px] text-[15.4px] font-medium leading-[22px] transition-colors hover:bg-muted disabled:opacity-60";
/** 参考站工具栏胶囊控件（35px 高、12px 字、浅底描边） */
export const accountPillCls = "h-[35px] rounded-full border border-border bg-foreground/[0.03] text-[12px] font-medium leading-[19.2px] outline-none focus:ring-2 focus:ring-ring/30";
