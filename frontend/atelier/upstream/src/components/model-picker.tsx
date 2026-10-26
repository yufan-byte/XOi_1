"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search, Sparkles, X } from "lucide-react";
import { ModelIcon } from "../../../src/xoi/model-icon";
import { Popover } from "radix-ui";
import { useAutoDLWorkflowNames } from "@/hooks/use-autodl-workflow";
import { cn } from "@/lib/utils";
import { filterModelsByCapability, normalizeLocalChannels, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { useModelPricing, modelPricingText, plainModelName } from "@/xoi/model-pricing";

type ModelPickerProps = {
    config: AiConfig; value?: string; channelId?: string; capability?: ModelCapability;
    onChange: (model: string, channelId?: string) => void; className?: string; fullWidth?: boolean;
    showPriceInTrigger?: boolean; placeholder?: string; onMissingConfig?: () => void;
};
const numberText = (value: number) => value === 0 ? "0" : value < 0.001 ? "<0.001" : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
const kindNames: Record<string, string> = { text: "文字", image: "图片", video: "视频", audio: "音频" };

/** Searchable combobox with a fixed header/footer and native scrollable results.
 * Unlike a Select viewport, the search input keeps focus and normal wheel gestures. */
export function ModelPicker({ config, value, channelId, capability, onChange, className, fullWidth = false, showPriceInTrigger = false, placeholder = "选择模型", onMissingConfig }: ModelPickerProps) {
    const pickerId = useId();
    const listId = `${pickerId}-models`;
    const [open, setOpen] = useState(false);
    const pricing = useModelPricing();
    const pricingRows = pricing.rows;
    const [query, setQuery] = useState("");
    const [showAll, setShowAll] = useState(false);
    const [billingFilter, setBillingFilter] = useState("all");
    const [activeIndex, setActiveIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const catalog = useMemo(() => new Map(pricingRows.map(row => [row.modelName, row])), [pricingRows]);
    const catalogFor = (model: string) => catalog.get(plainModelName(model));
    const channelOptions = useMemo(() => {
        const channels = config.channelMode === "remote"
            ? config.publicChannels.map(channel => ({ id: channel.id, protocol: channel.protocol, name: channel.name || "平台模型", baseUrl: channel.baseUrl, models: channel.models }))
            : normalizeLocalChannels(config).map(channel => ({ id: channel.id, protocol: channel.protocol, name: channel.name || "平台模型", baseUrl: channel.baseUrl, models: channel.models }));
        return channels.flatMap(channel => (channel.models ?? []).map(model => ({ key: `${channel.id}::${model}`, channelId: channel.id, channelName: channel.name, protocol: channel.protocol, baseUrl: channel.baseUrl, model })))
            .filter(item => !capability || (catalog.get(plainModelName(item.model))?.type ?? (filterModelsByCapability([item.model], capability, item.protocol || "").length ? capability : "")) === capability)
            .sort((a, b) => Number(catalog.get(plainModelName(b.model))?.recommended ?? false) - Number(catalog.get(plainModelName(a.model))?.recommended ?? false) || (catalog.get(plainModelName(b.model))?.recommendationRank ?? 0) - (catalog.get(plainModelName(a.model))?.recommendationRank ?? 0));
    }, [capability, config, catalog]);
    const modelLabel = useAutoDLWorkflowNames(channelOptions);
    const currentOption = channelOptions.find(item => item.model === value && item.channelId === channelId) || channelOptions.find(item => item.model === value);
    const searched = channelOptions.filter(option => !query.trim() || [option.model, catalogFor(option.model)?.name, catalogFor(option.model)?.series, catalogFor(option.model)?.description].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
    const sectionFor = (model: string) => {
        const row = catalogFor(model);
        return query.trim() || showAll ? `${row?.series || "其他模型"}${row?.type === "video" ? row.billingUnit === "per_second" ? " · 按秒" : " · 按次" : ""}` : row?.recommended || !pricingRows.length ? row?.type === "video" && row.billingUnit === "per_request" ? "按次备选" : "为你推荐" : "当前选择";
    };
    const options = searched.filter((option, index) => showAll || query.trim() || option.model === value || catalogFor(option.model)?.recommended || (!pricingRows.length && index < 3))
        .filter(option => !showAll || billingFilter === "all" || capability !== "video" || catalogFor(option.model)?.billingUnit === billingFilter)
        .sort((a, b) => (query.trim() || showAll) ? sectionFor(a.model).localeCompare(sectionFor(b.model), "zh") : Number(!!catalogFor(b.model)?.recommended) - Number(!!catalogFor(a.model)?.recommended));
    const sections = [...new Set(options.map(option => sectionFor(option.model)))];
    const current = value || "";
    const selectedResolution = String(config.vquality || "720p").replace(/^(480|720|1080)$/, "$1p");
    const selectedRate = capability === "video" ? catalogFor(current)?.rates?.find(rate => rate.resolution === selectedResolution) : undefined;
    const currentPrice = selectedRate ? `${selectedRate.resolution} ${numberText(selectedRate.points)} 积分/${selectedRate.unit}（¥${numberText(selectedRate.yuan)}/${selectedRate.unit}）`
        : current && capability ? modelPricingText(pricingRows, current, capability, pricing) : "";

    useEffect(() => { if (value && currentOption?.channelId && channelId !== currentOption.channelId) onChange(value, currentOption.channelId); }, [channelId, currentOption?.channelId, onChange, value]);
    useEffect(() => {
        const closeOtherPicker = (event: Event) => { if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false); };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);
    useEffect(() => { setActiveIndex(-1); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [query, showAll, billingFilter]);

    function choose(option: typeof channelOptions[number]) { onChange(option.model, option.channelId); setOpen(false); }
    function keydown(event: KeyboardEvent) {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.stopPropagation(); setOpen(false); return; }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && options.length) {
            if (["Home", "End"].includes(event.key) && event.target === inputRef.current) return;
            event.preventDefault(); event.stopPropagation();
            const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : activeIndex < 0 ? (event.key === "ArrowDown" ? 0 : options.length - 1) : (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
            setActiveIndex(next); itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
        }
        if (event.key === "Enter" && event.target === inputRef.current && options.length) {
            event.preventDefault(); choose(options[activeIndex < 0 ? 0 : Math.min(activeIndex, options.length - 1)]);
        }
    }

    return <Popover.Root open={open} onOpenChange={nextOpen => {
        if (nextOpen && !channelOptions.length && config.channelMode === "local") { onMissingConfig?.(); return; }
        if (nextOpen) { setQuery(""); setShowAll(false); setBillingFilter("all"); setActiveIndex(-1); pricing.refresh(); window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId })); }
        setOpen(nextOpen);
    }}>
        <Popover.Trigger asChild>
            <button type="button" aria-label={current ? `选择模型：${catalogFor(current)?.name || current}` : placeholder}
                className={cn("canvas-composer-model-picker flex h-9 max-w-full items-center gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-none transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30", fullWidth ? "w-full min-w-0" : "w-fit min-w-[9rem]", className)}
                onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} title={currentPrice ? `${current} · ${currentPrice}` : current || placeholder}>
                <ModelIcon model={current} />
                <span className="canvas-model-picker-text min-w-0 flex-1 text-left leading-tight"><span className="block truncate">{catalogFor(current)?.name || modelLabel(current, currentOption) || placeholder}</span>{showPriceInTrigger && currentPrice ? <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{currentPrice}</span> : null}</span>
                <ChevronDown className={cn("canvas-select-chevron size-3.5 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
            </button>
        </Popover.Trigger>
        <Popover.Portal>
            <Popover.Content data-canvas-no-zoom data-model-picker-panel side="bottom" align="start" sideOffset={10} collisionPadding={12} sticky="always"
                className="z-[1200] flex w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-[0_18px_60px_rgba(0,0,0,0.2)] outline-none"
                style={{ maxHeight: "min(440px, calc(100dvh - 24px), var(--radix-popover-content-available-height, 440px))" }}
                onOpenAutoFocus={event => { event.preventDefault(); inputRef.current?.focus({ preventScroll: true }); }}
                onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={keydown}>
                <div className="shrink-0 space-y-2.5 px-3 pb-2.5 pt-3">
                    <div className="flex items-center gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><Sparkles className="size-4" /></span><div><p className="text-[13px] font-semibold">选择{kindNames[capability || ""] || "创作"}模型</p><p className="mt-0.5 text-[11px] text-muted-foreground">按用途选模型，规格与费用清晰可见</p></div></div>
                    <div className="flex gap-1 rounded-xl bg-muted/65 p-1">
                        <button type="button" aria-pressed={!showAll} onClick={() => { setShowAll(false); setQuery(""); inputRef.current?.focus(); }} className={cn("flex-1 rounded-lg px-3 py-1.5 text-xs transition-colors", !showAll ? "bg-popover font-medium text-amber-700 shadow-sm dark:text-amber-400" : "text-muted-foreground hover:text-foreground")}>为你推荐</button>
                        <button type="button" aria-pressed={showAll} onClick={() => { setShowAll(true); inputRef.current?.focus(); }} className={cn("flex-1 rounded-lg px-3 py-1.5 text-xs transition-colors", showAll ? "bg-popover font-medium text-amber-700 shadow-sm dark:text-amber-400" : "text-muted-foreground hover:text-foreground")}>全部模型 <span className="ml-1 text-[10px] opacity-60">{pricing.loading && !channelOptions.length ? "—" : channelOptions.length}</span></button>
                    </div>
                    <div className="flex h-9 items-center gap-2 rounded-xl border border-input/80 bg-background/40 px-3 transition-colors focus-within:border-amber-500/45 focus-within:ring-2 focus-within:ring-amber-500/5">
                        <Search className="size-3.5 shrink-0 text-muted-foreground" />
                        <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} role="combobox" aria-expanded={open} aria-controls={listId} aria-activedescendant={activeIndex >= 0 && options[activeIndex] ? `${listId}-${activeIndex}` : undefined} aria-label="搜索模型" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/65" placeholder="搜索模型或系列，如即梦、GPT…" />
                        {query ? <button type="button" aria-label="清除搜索" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button> : null}
                    </div>
                    {capability === "video" && showAll ? <div className="mt-2 flex gap-1.5">{[{ value: "all", label: "全部计费" }, { value: "per_second", label: "按秒" }, { value: "per_request", label: "按次" }].map(filter => <button key={filter.value} type="button" aria-pressed={billingFilter === filter.value} onClick={() => setBillingFilter(filter.value)} className={cn("rounded-md border px-2 py-1 text-[10px]", billingFilter === filter.value ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-border/60 text-muted-foreground")}>{filter.label}</button>)}</div> : null}
                    {(pricing.loading && !pricingRows.length) || pricing.error ? <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground" role="status"><span>{pricing.loading ? "正在读取模型价格…" : pricing.error}</span>{pricing.error ? <button type="button" className="shrink-0 text-amber-600 underline underline-offset-2" onClick={pricing.reload}>重试</button> : null}</div> : null}
                </div>
                <div ref={scrollRef} id={listId} role="listbox" aria-label="可选模型" data-model-picker-scroll className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2" style={{ scrollbarWidth: "thin", touchAction: "pan-y" }}>
                    {options.length ? sections.map(section => <div key={section} role="group" aria-label={section}>
                        <div className="px-3 pb-1 pt-2 text-[10px] font-medium text-muted-foreground/65">{section}</div>
                        {options.filter(option => sectionFor(option.model) === section).map(option => {
                            const index = options.indexOf(option);
                            const row = catalogFor(option.model);
                            const selected = option.key === currentOption?.key;
                            return <button key={option.key} ref={element => { itemRefs.current[index] = element; }} id={`${listId}-${index}`} type="button" role="option" aria-selected={selected} tabIndex={-1}
                                onClick={() => choose(option)} onMouseEnter={() => setActiveIndex(index)} title={`型号：${option.model}${row?.referenceLatencySeconds ? "；耗时为上游参考，实际受排队影响" : ""}`}
                                className={cn("my-0.5 block w-full rounded-xl border border-transparent px-2.5 py-2.5 text-left outline-none transition-colors", selected ? "border-amber-500/15 bg-amber-500/[0.07]" : activeIndex === index ? "bg-muted/70" : "hover:bg-muted/50")}>
                                <div className="flex min-w-0 items-center gap-2"><ModelIcon model={option.model} /><span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-5">{row?.name || modelLabel(option.model, option)}</span>{row?.recommended ? <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">{row.recommendation || "推荐"}</span> : null}{selected ? <Check className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" /> : null}</div>
                                <p className="ml-6 mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{row?.description || row?.series || "平台模型"}{row?.referenceLatencySeconds ? ` · 上游参考约 ${row.referenceLatencySeconds} 秒` : ""}</p>
                                {row?.rates?.length ? <div className="ml-6 mt-1.5 flex flex-wrap gap-x-3 gap-y-1">{row.rates.map(rate => <span key={rate.resolution} className="text-[10px] tabular-nums text-amber-700 dark:text-amber-400" title={`¥${numberText(rate.yuan)}/${rate.unit}`}>{rate.resolution} · {numberText(rate.points)} 积分/{rate.unit}</span>)}</div>
                                    : <p className="ml-6 mt-1.5 whitespace-normal text-[11px] leading-4 tabular-nums text-amber-700/90 dark:text-amber-400/90">{row?.displayPrice || modelPricingText(pricingRows, option.model, capability || "text", pricing)}</p>}
                                {row?.referenceVideoMultiplier ? <p className="ml-6 mt-1 text-[10px] leading-4 text-muted-foreground/75">以上为基础单价 · 添加参考视频 ×{numberText(row.referenceVideoMultiplier)}</p> : null}
                            </button>;
                        })}
                    </div>) : <div className="px-6 py-10 text-center"><Search className="mx-auto mb-2 size-5 text-muted-foreground/45" /><p className="text-xs text-muted-foreground">{query ? "没有匹配的模型，试试其他关键词" : pricing.loading ? "正在加载模型…" : pricing.error || "暂无可用模型，请稍后刷新"}</p></div>}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 bg-muted/25 px-4 py-2.5 text-[10px] text-muted-foreground"><span>1 元 = 10 积分 · 按实际用量结算</span><span>{options.length} 个可选 · ↑↓ 选择</span></div>
            </Popover.Content>
        </Popover.Portal>
    </Popover.Root>;
}
