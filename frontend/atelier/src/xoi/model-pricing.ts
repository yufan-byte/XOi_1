import { backendJson } from "@/xoi/backend";
import { getAuthToken } from "@/xoi/owner";
import { useCallback, useEffect, useRef, useState } from "react";
import { pricingFailure } from "../../../src/utils/pricingRequest";
import { createCatalogCache } from "../../../src/utils/catalogCache";
import { formatCatalogPrice, isValidYuan, yuanToPoints } from "../../../src/utils/points";
export type ModelPricingRow = {
    model_name: string;
    modelName: string;
    name: string;
    type: "text" | "image" | "video" | "audio";
    series: string;
    recommended: boolean;
    recommendation?: string;
    recommendationRank?: number;
    description?: string;
    referenceLatencySeconds?: number;
    rates?: { resolution: string; yuan: number; points: number; unit: string }[];
    price?: { yuan: number; unit?: string } | null;
    outputPrice?: { yuan: number } | null;
    referenceVideoMultiplier?: number;
    billingUnit?: string;
    enums?: Record<string, Array<string | number>>;
    referenceLimits?: { images: number; videos: number; audios: number };
    displayPrice: string;
    defaults?: Record<string, unknown>;
};
const pricingCatalog = createCatalogCache<ModelPricingRow[]>(getAuthToken, async signal => {
    const body = await backendJson<{ data: Omit<ModelPricingRow, "model_name">[] }>("/api/model-catalog", { signal });
    if (!Array.isArray(body.data)) throw new Error("价格目录响应不完整");
    return body.data.map(row => ({
        ...row, model_name: row.modelName, displayPrice: formatCatalogPrice(row),
        recommendation: row.recommendation?.replaceAll("造物置顶", "XOi 置顶"),
        description: row.description?.replaceAll("造物置顶", "XOi 置顶"),
        rates: row.rates?.filter(rate => isValidYuan(rate.yuan)).map(rate => ({ ...rate, points: yuanToPoints(rate.yuan) })),
    }));
});
try {
    const channel = new BroadcastChannel("studio-api");
    channel.onmessage = event => { if (event.data?.type === "providers-changed") pricingCatalog.invalidate(); };
} catch { /* The short TTL still refreshes catalogs without BroadcastChannel. */ }
export function plainModelName(value?: string) {
    const raw = String(value || "").split("::").pop() || "";
    return raw.startsWith("newapi:") ? raw.slice(7) : raw;
}
export async function loadModelPricing(signal?: AbortSignal, force = false): Promise<ModelPricingRow[]> {
    signal?.throwIfAborted();
    const rows = await pricingCatalog.get(force);
    signal?.throwIfAborted();
    return rows;
}
export function useModelPricing() {
    const token = getAuthToken();
    const [state, setState] = useState(() => ({ token, rows: pricingCatalog.peek() || [] }));
    const [loading, setLoading] = useState(!state.rows.length);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const forceRefresh = useRef(false);
    const reload = useCallback(() => { forceRefresh.current = true; setRevision(value => value + 1); }, []);
    const refresh = useCallback(() => { forceRefresh.current = false; setRevision(value => value + 1); }, []);
    useEffect(() => {
        const controller = new AbortController();
        setState({ token, rows: pricingCatalog.peek() || [] }); setLoading(true); setError("");
        const force = forceRefresh.current; forceRefresh.current = false;
        void loadModelPricing(controller.signal, force)
            .then(value => { if (!controller.signal.aborted) setState({ token, rows: value }); })
            .catch(reason => { if (!controller.signal.aborted) {
                const remembered = pricingCatalog.peek() || [];
                setState({ token, rows: remembered });
                setError(pricingFailure(reason).message + (remembered.length ? "；当前显示上次报价，调用前会重新核价" : ""));
            } })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [token, revision]);
    useEffect(() => {
        if (!error) return;
        const resume = () => { if (document.visibilityState === "visible") reload(); };
        window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
        return () => { window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
    }, [error, reload]);
    return { rows: state.token === token ? state.rows : [], loading, error, reload, refresh };
}
export function modelPricingText(rows: ModelPricingRow[], modelValue: string | undefined, _capability: "text" | "image" | "video" | "audio", state?: { loading: boolean; error: string }) {
    const model = plainModelName(modelValue);
    if (!model) return "请选择模型";
    return rows.find(row => row.modelName === model)?.displayPrice || state?.error || (state?.loading ? "正在读取价格…" : "当前模型暂无报价，请重新选择");
}
