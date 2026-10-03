"use client";
import { SITE, policeUrl } from "@/lib/site";

/** 公安备案徽标（内联 SVG，替代原站的 beian-police.png） */
export function PoliceBadge({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="inline-block shrink-0 align-[-2px]">
      <path d="M12 2l8 3v6c0 5.2-3.4 9.4-8 11-4.6-1.6-8-5.8-8-11V5l8-3z" fill="#d94a3d" />
      <path d="M12 4.2l6 2.3v4.6c0 4.2-2.6 7.6-6 9-3.4-1.4-6-4.8-6-9V6.5l6-2.3z" fill="#f3c74b" />
      <path d="M12 6.8l1.4 2.9 3.2.4-2.3 2.2.6 3.2L12 14l-2.9 1.5.6-3.2-2.3-2.2 3.2-.4L12 6.8z" fill="#d94a3d" />
    </svg>
  );
}

/** 页脚备案信息：备案号未配置时回退到版权说明行 */
export function Filing({ className }: { className?: string }) {
  if (!SITE.icp && !SITE.police) return <div className={className}>© {SITE.name} · AI 大模型聚合平台 · 请遵守 AI 生成内容相关法规</div>;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] leading-tight text-white/55 sm:gap-x-4 sm:text-[11px] [&_a:hover]:text-white/85">
        {SITE.icp && <a href={SITE.icpUrl} target="_blank" rel="noreferrer noopener" className="whitespace-nowrap transition-colors" aria-label={`ICP 备案号 ${SITE.icp}，点击前往工信部备案管理系统查询`}>{SITE.icp}</a>}
        {SITE.police && <a href={policeUrl(SITE.policeCode || SITE.police.replace(/\D/g, ""))} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 whitespace-nowrap transition-colors" aria-label={`公安机关备案号 ${SITE.police}，点击前往全国互联网安全管理服务平台查询`}><PoliceBadge />{SITE.police}</a>}
      </div>
    </div>
  );
}
