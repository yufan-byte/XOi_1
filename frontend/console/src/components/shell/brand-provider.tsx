"use client";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setHiddenModels } from "@/lib/model-visibility";
import { SITE } from "@/lib/site";
import { DEFAULT_DATA, type CustomerService, type ModelsConfig, type SiteBrand, type SiteTheme } from "@/lib/reseller/types";
import {platformBrandAsset} from "../../../../../shared/platformBrand";
import {publicSiteBrand} from "../../../../../shared/siteBrand";

/** 平台默认品牌（代理商未配置白标时回退到这里）。
 *
 *  ⚠️ 不沿用造物那行硬编码的 `name: "造物引擎"`：对造物来说写自家品牌是对的，
 *  但组件搬到 XOi 控制台后，这段会成为**兜底值**并在侧栏/顶栏真实显示出来，
 *  于是 XOi 的后台挂着别人的牌子（平台还没配白标时必然出现）。
 *  这里改成读本站自己的品牌常量（lib/site.ts 的 SITE.name，默认 "XOi"）。
 *  想换显示的名字：改 lib/site.ts，或在后台「白标配置」里填 site.name（后者优先生效）。 */
export const DEFAULT_BRAND = { name: SITE.name, subtitle: "", title: `${SITE.name} · 管理控制台` };
export const SKIN_CLASSES = ["skin-obsidian", "skin-industrial", "skin-neobrutal", "skin-motion", "skin-japanese", "skin-bento", "skin-rgbsplit", "skin-memphis", "skin-clay", "skin-pixel"];

interface BrandCtx {
  site: SiteBrand; theme: SiteTheme; customerService: CustomerService; models: Pick<ModelsConfig, "disabled" | "markupPct"> & { newUserBonus?: number; topupMax?: number };
  /** 生效的品牌名 / 副标题（已回退到平台默认） */
  name: string; subtitle: string; hasCustom: boolean;
}
const Ctx = createContext<BrandCtx>({ site: DEFAULT_DATA.site, theme: DEFAULT_DATA.theme, customerService: DEFAULT_DATA.customerService, models: DEFAULT_DATA.models, name: DEFAULT_BRAND.name, subtitle: DEFAULT_BRAND.subtitle, hasCustom: false });

async function pub<T>(section: string): Promise<T> {
  const r = await fetch(`/api/reseller/config?section=${section}`, { cache: "no-store" });
  const j = (await r.json()) as { success: boolean; data?: T };
  if (!j.success || !j.data) throw new Error(`reseller ${section}`);
  return j.data;
}
/** 公开读取一个代理商配置分区（无需登录；与 useResellerSection 共用 "reseller" 前缀，保存后一起失效） */
export function usePublicSection<T>(section: "site" | "theme" | "customerService" | "models") {
  return useQuery({ queryKey: ["reseller", "public", section], queryFn: () => pub<T>(section), staleTime: 30_000, retry: 1,refetchInterval:section==="site"?60_000:false,refetchIntervalInBackground:false });
}

/** 白标品牌：读取代理商公开配置（品牌 / 主题 / 客服 / 模型开关），应用皮肤 class、标题与 favicon，并隐藏被禁用的模型 */
export function BrandProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const site = usePublicSection<SiteBrand>("site").data;
  const theme = usePublicSection<SiteTheme>("theme").data;
  const cs = usePublicSection<CustomerService>("customerService").data;
  const models = usePublicSection<BrandCtx["models"]>("models").data;

  const value = useMemo<BrandCtx>(() => {
    const s = { ...DEFAULT_DATA.site, ...publicSiteBrand(site) };
    const name = s.name.trim() || DEFAULT_BRAND.name;
    const subtitle = s.hideSubtitle ? "" : (s.name.trim() ? s.subtitle.trim() : (s.subtitle.trim() || DEFAULT_BRAND.subtitle));
    return { site: s, theme: { ...DEFAULT_DATA.theme, ...(theme ?? {}) }, customerService: { ...DEFAULT_DATA.customerService, ...(cs ?? {}) }, models: { ...DEFAULT_DATA.models, ...(models ?? {}) }, name, subtitle, hasCustom: !!(s.name.trim() || s.logo) };
  }, [site, theme, cs, models]);

  // 皮肤 class 挂到 <html>；曜岩 = 平台默认（不加覆盖）
  useEffect(() => {
    const el = document.documentElement; const skin = `skin-${value.theme.skin || "obsidian"}`;
    for (const c of SKIN_CLASSES) el.classList.toggle(c, c === skin);
  }, [value.theme.skin]);

  // 标题跟随品牌：把标题里的「造物引擎」替换为品牌名（监听 <title> 变化，路由切换后也生效）；favicon 用 Logo
  const lastName = useRef(DEFAULT_BRAND.name);
  useEffect(() => {
    if (!site) return;
    const target = value.site.name.trim() || DEFAULT_BRAND.name;
    const apply = () => {
      const t = document.title; const from = [lastName.current, DEFAULT_BRAND.name].find((n) => n !== target && t.includes(n));
      if (from) document.title = t.split(from).join(target);
      else if (target !== DEFAULT_BRAND.name && !t.includes(target)) document.title = t ? `${t} · ${target}` : target;
    };
    apply(); lastName.current = target;
    const mo = new MutationObserver(apply); mo.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => mo.disconnect();
  }, [site, value.site.name]);
  useEffect(() => {
    // Update one canonical favicon instead of leaving multiple competing defaults in <head>.
    const links=Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"],link[rel="shortcut icon"]'));
    const link=links.shift()||document.createElement("link");
    for(const duplicate of links)duplicate.remove();
    link.rel="icon";link.dataset.brand="1";link.removeAttribute("sizes");
    if(value.site.logo)link.removeAttribute("type");else link.type="image/png";
    link.href=value.site.logo||platformBrandAsset("favicon",import.meta.env.BASE_URL);
    if(!link.isConnected)document.head.appendChild(link);
  }, [site, value.site.logo]);

  // 禁用模型 → 从目录隐藏（buildCatalog 过滤），然后让 catalog 查询重新计算
  useEffect(() => {
    if (!models) return;
    setHiddenModels(models.disabled ?? []);
    qc.invalidateQueries({ queryKey: ["catalog"] });
  }, [models, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useBrand() { return useContext(Ctx); }
