"use client";
import { useState } from "react";
import { Copy, ExternalLink, Maximize2, MessageSquare, Users } from "lucide-react";
import { useBrand } from "@/components/shell/brand-provider";
import { SAFE_LINK, copyText } from "@/components/reseller/site/ui";
import { PLATFORMS } from "./customer-service-center";

/** 「联系客服」对话框内容（版式与参考站一致：品牌头像 + 在线状态 → 主二维码 → 其他联系方式）；未配置时显示 fallback */
export function SupportContacts({ fallback }: { fallback: React.ReactNode }) {
  const { customerService: cs, name: brandName } = useBrand();
  const [zoom, setZoom] = useState<string | null>(null);
  const contacts = cs.contacts.filter((c) => c.name); const groups = cs.groups.filter((g) => g.name);
  if (!contacts.length && !groups.length) return <>{fallback}</>;
  const primary = contacts.find((c) => c.qr) ?? groups.find((g) => g.qr);
  const rest: { key: string; icon: typeof MessageSquare; title: string; sub: string; copy?: [string, string]; url?: string }[] = [
    ...contacts.filter((c) => c !== primary || c.wechat).map((c) => ({ key: `c${c.id}`, icon: MessageSquare, title: c.wechat || c.name, sub: c.wechat ? `微信 · ${c.name}` : "扫码添加好友", copy: c.wechat ? [c.wechat, "已复制微信号"] as [string, string] : undefined })),
    ...groups.filter((g) => g !== primary || g.url).map((g) => ({ key: `g${g.id}`, icon: Users, title: g.name, sub: [PLATFORMS[g.platform] ?? "其他", g.note].filter(Boolean).join(" · "), url: g.url && SAFE_LINK.test(g.url) ? g.url : undefined })),
  ];
  return (
    <div className="max-h-[62vh] overflow-y-auto pr-[2px] font-medium">
      <div className="flex flex-col items-center">
        <div className="grid h-[70px] w-[70px] place-items-center rounded-full bg-[linear-gradient(135deg,var(--primary),#6a3fd9)] text-[22px] font-bold leading-[30.8px] text-white shadow-[0_14px_32px_rgba(124,57,237,0.18)]">{brandName.slice(0, 1)}</div>
        <div className="mt-[13.2px] text-[15.4px] font-semibold leading-[22px]">{brandName}</div>
        <span className="mt-[6.6px] rounded-full bg-success/15 px-[9px] py-[3px] text-[10.5px] font-[620] leading-[16.8px] text-success">在线</span>
      </div>
      {primary?.qr && (
        <div className="mt-[17.6px]">
          <button type="button" aria-label="点击放大查看" onClick={() => setZoom(primary.qr!)} className="relative block w-full overflow-hidden rounded-[20px] border border-border/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={primary.qr} alt={`${primary.name} 二维码`} className="block w-full object-contain" />
            <span className="absolute right-[9px] top-[9px] flex items-center gap-[4.4px] rounded-[4px] bg-black/55 px-[8.8px] py-[4.4px] text-[10px] leading-[16px] text-white"><Maximize2 className="h-[13px] w-[13px]" />点击放大查看</span>
          </button>
          <p className="mt-[8.8px] text-center text-[11px] leading-[17.6px] text-muted-foreground">{"platform" in primary ? `扫码加入${PLATFORMS[primary.platform] ?? ""}群` : "微信扫码联系客服"}</p>
        </div>
      )}
      {rest.length > 0 && (
        <div className="mt-[17.6px]">
          <div className="text-[11px] font-[620] leading-[17.6px] text-muted-foreground">其他联系方式</div>
          {rest.map(({ key, icon: I, title, sub, copy, url }) => (
            <div key={key} className="flex items-center gap-[12px] py-[12px]">
              <span className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[10px] bg-foreground/[0.06] text-muted-foreground"><I className="h-[15px] w-[15px]" /></span>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-[7px] truncate text-[13px] font-[560] leading-[20.8px]">{title}</div><div className="mt-[2px] truncate text-[11.5px] leading-[18.4px] text-muted-foreground">{sub}</div></div>
              {copy && <button type="button" aria-label="复制" onClick={() => copyText(copy[0], copy[1])} className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground"><Copy className="h-[14px] w-[14px]" /></button>}
              {url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label="加入" className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] text-primary hover:bg-muted"><ExternalLink className="h-[14px] w-[14px]" /></a>}
            </div>
          ))}
        </div>
      )}
      {zoom && (
        <button type="button" aria-label="关闭大图" onClick={() => setZoom(null)} className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-[24px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="二维码大图" className="max-h-[86vh] max-w-[86vw] rounded-[20px] bg-white object-contain" />
        </button>
      )}
    </div>
  );
}
