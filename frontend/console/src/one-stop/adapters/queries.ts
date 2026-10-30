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
      // F3：凭据走 httpOnly cookie（同源自动携带），不再把会话信号塞进 Authorization
      const health: ModelHealth = await fetch("/api/model-health", { credentials: "same-origin", cache: "no-store" })
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

/**
 * 按「线路」（new-api 渠道）统计的成功率，来自 /api/model-lines。
 *
 * 与 useCatalog 里那份 /api/model-health 的区别：
 *   · model-health 只用站内任务记录、按**裸模型名**聚合近 24h —— 同一模型下的多条渠道共用一个数字
 *   · model-lines 直接读网关 logs，按 (渠道 × 模型) 聚合，窗口 120 分钟、5 分钟一个桶
 * 「稳定/价格/速度优先」要比的是线路，所以策略面板用这一份。
 *
 * 没流量就是 null（前端显示「暂无数据」），不把 0% 和 100% 编出来。
 */
export interface ModelLine {
  channelId: number;
  channelName: string;
  channelStatus: number | null;
  ok: number;
  fail: number;
  health: number | null;
  avgSec: number | null;
  buckets: number[];
}
export interface ModelLineRow {
  ok: number;
  fail: number;
  health: number | null;
  avgSec: number | null;
  buckets: number[];
  lines: ModelLine[];
}
export interface ModelLines {
  updatedAt: number;
  windowMinutes: number;
  bucketMinutes: number;
  models: Record<string, ModelLineRow>;
}

export function useModelLines() {
  return useQuery({
    queryKey: ["one-stop-model-lines", accountKey()],
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetch("/api/model-lines", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { data?: ModelLines };
      return body.data ?? { updatedAt: 0, windowMinutes: 120, bucketMinutes: 5, models: {} };
    },
  });
}
