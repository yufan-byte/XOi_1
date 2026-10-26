"use client";
import { useBrand } from "./brand-provider";
import {platformBrandAsset} from "../../../../../shared/platformBrand";

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
    <img src={b.site.logo} alt={b.name} className="rounded-xl object-contain shadow-soft" style={{ width: size, height: size }} />
  ) : (
    /** Same glass wordmark and ceramic backing as the creative workbench, without cropping. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={platformBrandAsset("logo",import.meta.env.BASE_URL)}
      alt={b.name}
      className="shrink-0 rounded-[27%] object-contain"
      style={{ width: size, height: size,background:"linear-gradient(145deg,#fff,#f6f3ee)",boxShadow:"0 1px 3px rgba(30,30,25,.08), inset 0 0 0 1px rgba(30,30,25,.06)" }}
    />
  );
  // 顶栏自己按 useBrand() 渲染名称与副标题，这里只输出图标；hideSubtitle 时隐藏紧邻文案里的副标题行
  if (!b.site.hideSubtitle) return icon;
  return <span className="inline-flex items-center [&+span>span+span]:hidden" data-brand-custom>{icon}</span>;
}
