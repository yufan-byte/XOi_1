"use client";
import { useRef, useSyncExternalStore } from "react";
import * as Sw from "@radix-ui/react-switch";
import { ImageIcon, Upload } from "lucide-react";
import { toast } from "sonner";
import { ResellerGate } from "@/components/reseller/common";
import { useIsReseller } from "@/lib/reseller/client";
import { cn } from "@/lib/utils";

/** 代理商白标 / 客服页面共用的小部件 */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** 读取图片为 data URL（类型白名单 + ≤2MB） */
export function readImage(file: File, types = IMAGE_TYPES): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!types.includes(file.type)) { reject(new Error(types.includes("image/svg+xml") ? "仅支持 PNG/JPG/WebP/SVG 图片" : "仅支持 PNG/JPG/WebP 图片")); return; }
    if (file.size > MAX_IMAGE_BYTES) { reject(new Error("图片不能超过 2MB")); return; }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("读取图片失败")); r.readAsDataURL(file);
  });
}

export function ImagePicker({ value, onChange, label, reuploadLabel = "重新上传", removeLabel, hint, types = IMAGE_TYPES, size = 72, className }: { value: string; onChange: (v: string) => void; label: string; reuploadLabel?: string; removeLabel?: string; hint?: string; types?: string[]; size?: number; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (f?: File) => {
    if (!f) return;
    try { onChange(await readImage(f, types)); } catch (e) { toast.error((e as Error).message); } finally { if (ref.current) ref.current.value = ""; }
  };
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="grid shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted/40 text-muted-foreground" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={Math.round(size / 3)} />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => ref.current?.click()} className="chip h-9 gap-1.5 hover:bg-muted"><Upload size={14} />{value ? reuploadLabel : label}</button>
          {value && removeLabel && <button type="button" onClick={() => onChange("")} className="h-9 rounded-lg px-2 text-sm text-muted-foreground hover:text-danger">{removeLabel}</button>}
        </div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <input ref={ref} type="file" accept={types.join(",")} className="sr-only" aria-label={label} tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

/** 带无障碍名称的开关（ui/switch 不透传 aria-label） */
export function LabeledSwitch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <Sw.Root checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} className="relative h-6 w-11 shrink-0 rounded-full bg-muted-foreground/30 transition-colors disabled:opacity-50 data-[state=checked]:bg-success">
      <Sw.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </Sw.Root>
  );
}

/** 下划线标签页（站点信息 / 客户服务） */
export function UnderlineTabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("flex items-center gap-1 border-b border-border", className)}>
      {tabs.map((t) => <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} className={cn("-mb-px inline-flex items-center border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors", value === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</button>)}
    </div>
  );
}

export function SettingCard({ icon, title, required, help, right, children, className }: { icon: React.ReactNode; title: string; required?: boolean; help?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.14] text-primary [&_svg]:size-4">{icon}</span>
        <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-foreground"><span className="inline-flex items-center gap-1">{title}{required && <span className="text-danger" aria-hidden>*</span>}</span></h3>{help && <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{help}</div>}</div>
        {right}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

const noop = () => () => {};
/** 当前访问域名（SSR 时为空串，避免水合不一致） */
export function useHost() { return useSyncExternalStore(noop, () => window.location.host, () => ""); }
/** 站点根域：a.b.com → b.com；两段及以下原样返回 */
export function rootHost(host: string) { const h = host.split(":")[0]; const parts = h.split("."); return parts.length > 2 ? parts.slice(1).join(".") : h; }

/** 代理商页面守卫：非管理员显示「成为代理商」引导 */
export function AdminOnly({ title, children }: { title: string; children: React.ReactNode }) {
  return useIsReseller() ? <>{children}</> : <ResellerGate title={title} />;
}

export async function copyText(text: string, ok = "已复制") {
  try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error("复制失败，请手动复制"); }
}
/** 仅允许可安全用作 href 的群链接协议 */
export const SAFE_LINK = /^(https?:\/\/|weixin:\/\/|mqqapi:\/\/|tg:\/\/)\S+$/i;
