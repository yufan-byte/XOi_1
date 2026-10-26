import axios from "./axios";
import settingStore from "@/stores/setting";
import { createCatalogCache } from "./catalogCache";

export interface ModelCatalogRow {
  modelName: string; enums?: Record<string, any[]>; defaults?: Record<string, any>; paramSchema?: Record<string, any>;
  id: string; label: string; value: string; type: string; series: string; displayPrice: string;
  recommended: boolean; recommendation?: string; description?: string; referenceLatencySeconds?: number;
  rates?: { resolution: string; yuan: number; points: number; unit: string }[];
  referenceVideoMultiplier?: number; billingUnit?: string; capabilities?: string[];
  mode?: string[]; referenceLimits?: { images?: number };
}
export const modelCatalog = createCatalogCache<ModelCatalogRow[]>(
  () => JSON.stringify([settingStore().baseUrl, localStorage.getItem("token") || ""]),
  async signal => {
    const response = await axios.post("/modelSelect/getModelList", { type: "all" }, { signal });
    if (!Array.isArray(response.data)) throw new Error("价格目录响应不完整");
    return response.data;
  },
);
window.addEventListener("model-catalog-changed", () => modelCatalog.invalidate());
try {
  const channel = new BroadcastChannel("studio-api");
  channel.onmessage = event => { if (event.data?.type === "providers-changed") modelCatalog.invalidate(); };
} catch { /* TTL refresh remains available on older browsers. */ }
