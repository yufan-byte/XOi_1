"use client";
import { useBrand } from "./brand-provider";

/**
 * 品牌标识：读取代理商白标配置（名称 / 副标题 / 隐藏副标题 / Logo），未配置时回退到
 * DEFAULT_BRAND（= 本站 lib/site.ts 的 SITE.name，不再是造物那行硬编码的「造物引擎」）。
 * 顶栏在 BrandMark 后面紧跟一段静态文案；配置了品牌后由 BrandMark 自己渲染名称并隐藏紧邻的兄弟文案（[&+span]:hidden），
 * 这样无需改动 topbar.tsx 即可让顶栏跟随品牌。
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  const b = useBrand();
  const icon = b.site.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.site.logo} alt={b.name} className="rounded-full object-cover shadow-soft" style={{ width: size, height: size }} />
  ) : (
    /**
     * 默认标 = **XOi 官方方标**（`public/xoi-favicon.png`，蓝紫渐变 + XOi 字标，方形、自带留白）。
     * 原先这里画的是一枚「生成环 + 三道光束」的抽象图标 —— 那是造物的品牌意象，
     * 搬过来后侧栏/顶栏一直显示它，看着不像 XOi（2026-10-03 用户反馈「不是 xoi 的 logo」）。
     * 走 BASE_URL 而不是硬编码 `/console/`：dev（:3100）与生产（/console/）都能取到。
     * 白标代理配了自己的 Logo 时仍走上面那条分支，本默认标只服务未配置的情况。
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${import.meta.env.BASE_URL}xoi-favicon.png`}
      alt={b.name}
      className="shrink-0 rounded-[28%] object-cover shadow-soft"
      style={{ width: size, height: size }}
    />
  );
  // 顶栏自己按 useBrand() 渲染名称与副标题，这里只输出图标；hideSubtitle 时隐藏紧邻文案里的副标题行
  if (!b.site.hideSubtitle) return icon;
  return <span className="inline-flex items-center [&+span>span+span]:hidden" data-brand-custom>{icon}</span>;
}
