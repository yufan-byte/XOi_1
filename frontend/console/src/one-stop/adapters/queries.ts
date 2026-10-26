import { useQuery } from "@tanstack/react-query";
import type { CatalogModel } from "@/lib/models";
import { getSelf } from "@/lib/api";
import { formatCatalogPrice } from "../../../../src/utils/points";
import { accountKey, oneStopRequest } from "./request";
export type StandaloneModel = CatalogModel & { standalonePrice?: { yuan: number; unit?: string } | null; standaloneRates?: { resolution: string; yuan: number; unit: string }[] };
/** 站内任务记录聚合出的线路健康度（/api/model-health）：health=近24h成功率%，total24/total2=任务数，avgSec2=近2h平均耗时秒 */
export type ModelHealth = Record<string, { health: number; total24: number; total2: number; avgSec2: number | null }>;
export type StandaloneModelWithHealth = StandaloneModel & { healthDetail?: { health: number; total24: number; total2: number; avgSec2: number | null } };

export function useCatalog() {
  return useQuery({
    queryKey: ["one-stop-models", accountKey()],
    retry: 1,
    staleTime: 30000,
    queryFn: async () => {
      const data = await oneStopRequest<any[]>("/api/model-catalog");
      if (!Array.isArray(data)) throw new Error("模型目录响应无效");
      // 线路健康度：真实任务记录聚合；接口挂了不阻塞目录（显示「暂无数据」）
      const health: ModelHealth = await fetch("/api/model-health", { headers: { Authorization: accountKey() || "" }, cache: "no-store" })
        .then((r) => r.json())
        .then((b) => (b?.data ?? {}) as ModelHealth)
        .catch(() => ({}) as ModelHealth);
      const bare = (k: string) => k.replace(/^[a-z-]+:/i, "");
      const models: StandaloneModelWithHealth[] = data
        .filter((row) => row.selectable !== false)
        .map((row) => ({
          id: row.modelName,
          name: row.name || row.modelName,
          series: row.series,
          category: row.type === "text" ? "chat" : row.type,
          description: row.description || "",
          vendor: row.provider || row.series,
          vendorLabel: row.series,
          featured: !!row.recommended,
          icon: "",
          tags: [],
          capabilities: row.capabilities || [],
          health: health[bare(row.modelName)]?.health ?? 0,
          price: formatCatalogPrice(row),
          priceUsd: row.price?.yuan ?? NaN,
          billingUnit: row.billingUnit || "per_request",
          groups: [],
          paramSchema: row.paramSchema || {},
          sort: row.recommendationRank || 0,
          standalonePrice: row.price,
          standaloneRates: row.rates,
          healthDetail: health[bare(row.modelName)],
        }));
      return { models };
    },
  });
}

export function useSelf(enabled = true) {
  return useQuery({ queryKey: ["one-stop-self", accountKey()], queryFn: getSelf, enabled, retry: false, staleTime: 30000 });
}
