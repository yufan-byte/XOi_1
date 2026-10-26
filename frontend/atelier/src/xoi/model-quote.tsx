import { useEffect, useState } from "react";
import { backendJson } from "@/xoi/backend";
import { plainModelName } from "@/xoi/model-pricing";
import { modelQuoteParams, type QuoteConfig } from "@/xoi/quote-params";
import { pricingFailure, queryPricing } from "../../../src/utils/pricingRequest";
import { formatPointsFromYuan, formatYuan, isValidYuan, CREDIT_RULE_LABEL } from "../../../src/utils/points";
export function ModelQuote({ config, type, prompt = "", hasReferenceVideo = false }: { config: QuoteConfig; type: "text" | "image" | "video" | "audio"; prompt?: string; hasReferenceVideo?: boolean }) {
    const [quote, setQuote] = useState<{ yuan: number; points: number; note: string; referenceVideoAdjustment?: { multiplier: number; baseYuan: number; basePoints: number } | null } | null>(null);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const model = plainModelName(config.model);
    const params = JSON.stringify(modelQuoteParams(config, type, prompt, hasReferenceVideo));
    useEffect(() => {
        const controller = new AbortController();
        setQuote(null); setError("");
        if (!model) return;
        const timer = setTimeout(() => {
            void queryPricing(signal => backendJson<{ data: NonNullable<typeof quote> }>("/api/model-catalog/quote", { signal, method: "POST", json: { model, params: JSON.parse(params) } }), controller.signal)
                .then(body => { if (!isValidYuan(body.data?.yuan)) throw new Error("暂无可靠报价，请重试"); if (!controller.signal.aborted) setQuote(body.data); }).catch(reason => { if (!controller.signal.aborted) setError(pricingFailure(reason).message); });
        }, 300);
        return () => { controller.abort(); clearTimeout(timer); };
    }, [model, params, revision]);
    useEffect(() => {
        if (!error) return;
        const resume = () => { if (document.visibilityState === "visible") setRevision(value => value + 1); };
        window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
        return () => { window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
    }, [error]);
    if (!model) return null;
    const format = (value: number) => value === 0 ? "0" : value < 0.001 ? "<0.001" : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
    return <div className="mb-2 rounded-xl border border-border/50 bg-muted/25 px-3 py-2 text-[11px] leading-4 text-muted-foreground" role="status" title={quote?.note}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span>本次预计</span>{quote ? <span><strong className="text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-400">{formatPointsFromYuan(quote.yuan)}</strong><span className="ml-1.5 tabular-nums opacity-65">{formatYuan(quote.yuan)}</span></span> : <span>{error || "正在计算…"}{error ? <button type="button" className="ml-2 text-amber-600 underline" onClick={() => setRevision(value => value + 1)}>重试</button> : null}</span>}</div>
        {quote?.referenceVideoAdjustment ? <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg bg-amber-500/[0.06] px-2 py-1.5 text-[10px]" data-reference-video-cost><span>已添加参考视频 · 费率 ×{format(quote.referenceVideoAdjustment.multiplier)}</span><span className="tabular-nums opacity-75">{formatPointsFromYuan(quote.referenceVideoAdjustment.baseYuan, "")} × {format(quote.referenceVideoAdjustment.multiplier)} = {formatPointsFromYuan(quote.yuan)}</span></div> : type === "video" && hasReferenceVideo ? <p className="mt-1 text-[10px]">已添加参考视频 · 按所选模型规则计费</p> : null}
        <p className="mt-1 text-[10px] opacity-65">{CREDIT_RULE_LABEL} · 按当前参数估算 · 最终按实际用量结算</p>
    </div>;
}
