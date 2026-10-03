"use client";
import { useQuery } from "@tanstack/react-query";
import { api, getPricing, getSelf, loadAuth } from "@/lib/api";
import { applyPriceFactor, buildCatalog, type CatalogModel, type RefModel } from "@/lib/models";

/** 代理客户看到的价格 = 平台价 × (1 + 代理加价%)；未登录或非代理客户为 1 */
async function priceFactor(): Promise<number> {
  if (!loadAuth()) return 1;
  try { const f = Number((await api<{ factor?: number }>("/api/agent/price-factor")).factor); return f > 0 ? f : 1; } catch { return 1; }
}

export function useCatalog() {
  // queryKey 必须带用户：目录里混着「该用户的代理加价系数」，共用一份缓存会让换号后的人
  // 看到上一位用户的价格（未登录先看过一次的话，代理客户还会看到未加价的平台原价）。
  const uid = loadAuth()?.user.id ?? 0;
  return useQuery({ queryKey: ["catalog", uid], queryFn: async () => { const [p, sources, factor, logical] = await Promise.all([getPricing(), fetch("/api/catalog/sources").then((r) => (r.ok ? r.json() : {})).catch(() => ({})), priceFactor(), fetch("/api/catalog/logical").then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as Promise<{ models?: RefModel[] }>]); return { models: applyPriceFactor(buildCatalog(p.data ?? [], { sources, refs: Array.isArray(logical.models) ? logical.models : [] }), factor), factor, groupRatio: p.group_ratio ?? {}, usableGroup: p.usable_group ?? {} }; }, staleTime: 5 * 60_000 });
}
export function useModel(id: string | null | undefined): CatalogModel | undefined {
  const { data } = useCatalog();
  return data?.models.find((m) => m.id === id);
}
export function useSelf(enabled = true) {
  return useQuery({ queryKey: ["self"], queryFn: getSelf, enabled: enabled && !!loadAuth(), refetchInterval: 30_000, retry: false });
}
