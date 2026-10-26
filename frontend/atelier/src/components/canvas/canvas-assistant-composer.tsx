"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowUp, ChevronDown, Film, FolderOpen, ImageIcon, Menu, Square, Upload, Video } from "lucide-react";
import { Button, Dropdown } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { canvasThemes } from "@/lib/canvas-theme";
import { modelOptionLabel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useModelPricing, modelPricingText } from "@/xoi/model-pricing";
import { CanvasNodeType, type CanvasAgentConfig, type CanvasAgentSkillSelection, type CanvasAssistantReference } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasReferenceAnalysisPopover } from "./canvas-reference-analysis-popover";
import { CanvasAgentSkillPopover } from "./canvas-agent-skill-popover";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";

export type CanvasAssistantComposerProps = {
    prompt: string;
    isRunning: boolean;
    codexControls?: ReactNode;
    references: CanvasAssistantReference[];
    availableReferences?: CanvasResourceReference[];
    pendingReferences?: CanvasResourceReference[];
    selectedSkills?: CanvasAgentSkillSelection[];
    agentConfig: CanvasAgentConfig;
    onAgentConfigChange: (patch: Partial<CanvasAgentConfig>) => void;
    onPromptChange: (prompt: string) => void;
    onReferenceIdsChange: (ids: string[]) => void;
    onSkillSelect?: (skill: CanvasAgentSkillSelection) => void;
    onSkillRemove?: (id: string, source: CanvasAgentSkillSelection["source"]) => void;
    onSubmit: (prompt?: string, referenceIds?: string[]) => void | Promise<void>;
    onStop?: () => void;
    onOpenUpload: () => void;
    onOpenAssets: () => void;
    onPasteImage: (file: File) => void;
};

export function CanvasAssistantComposer({
    prompt,
    isRunning,
    codexControls,
    references,
    availableReferences,
    pendingReferences,
    selectedSkills,
    agentConfig,
    onAgentConfigChange,
    onPromptChange,
    onReferenceIdsChange,
    onSkillSelect,
    onSkillRemove,
    onSubmit,
    onStop,
    onOpenUpload,
    onOpenAssets,
    onPasteImage,
}: CanvasAssistantComposerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const effectiveConfig = useEffectiveConfig();
    const updateGlobalConfig = useConfigStore((state) => state.updateConfig);
    const pricing = useModelPricing();
    const pricingRows = pricing.rows;
    const [showModelDetails, setShowModelDetails] = useState(false);
    const [analyzeOpen, setAnalyzeOpen] = useState(false);
    const imageConfig = useMemo(() => ({ ...effectiveConfig, quality: agentConfig.imageQuality, size: agentConfig.imageSize }), [agentConfig.imageQuality, agentConfig.imageSize, effectiveConfig]);
    const videoConfig = useMemo(() => ({ ...effectiveConfig, vquality: agentConfig.videoQuality, size: agentConfig.videoSize }), [agentConfig.videoQuality, agentConfig.videoSize, effectiveConfig]);
    const promptReferences = useMemo(() => {
        const seen = new Set<string>();
        return [...(availableReferences || []), ...references.map(assistantToPromptReference)].filter((reference) => {
            if (seen.has(reference.nodeId)) return false;
            seen.add(reference.nodeId);
            return true;
        });
    }, [availableReferences, references]);
    const submit = (nextPrompt = prompt, referenceIds = references.map((reference) => reference.id)) => onSubmit(nextPrompt, referenceIds);

    return (
        <div className="px-2 pb-2" onWheelCapture={(event) => event.stopPropagation()}>
            <div className="rounded-2xl border px-3 pb-3 pt-3" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}>
                <CanvasPromptChipInput
                    value={prompt}
                    references={promptReferences}
                    pendingReferences={pendingReferences}
                    skills={selectedSkills}
                    onSkillRemove={onSkillRemove}
                    onChange={onPromptChange}
                    onReferenceIdsChange={onReferenceIdsChange}
                    onPasteImage={onPasteImage}
                    onSubmit={submit}
                    className="thin-scrollbar min-h-24 max-h-[220px] w-full px-1 pb-8 pt-0 text-sm leading-6"
                    style={{ color: theme.node.text }}
                    placeholder="描述创作目标，或让我继续操作画布"
                    placeholderClassName="!left-1 !top-0"
                />
                <div className="mt-1 border-t pt-2" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex min-w-0 items-center justify-between gap-2 px-1 text-[11px]">
                        <span className="min-w-0 truncate opacity-70">Agent 思考 · {modelOptionLabel(effectiveConfig, effectiveConfig.textModel) || "系统文本模型"}</span>
                        <button type="button" className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] hover:bg-black/5" style={{ color: theme.node.activeStroke }} aria-expanded={showModelDetails} onClick={() => setShowModelDetails((open) => !open)}>
                            模型与积分 <ChevronDown className={`size-3 transition-transform ${showModelDetails ? "rotate-180" : ""}`} />
                        </button>
                    </div>
                    {showModelDetails ? (
                        <div className="mt-2 max-h-[min(34vh,260px)] space-y-2 overflow-y-auto rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                            {pricing.error ? <div className="flex items-center justify-between gap-2 text-[11px]" role="status"><span>{pricing.error}</span><button type="button" className="shrink-0 underline" onClick={pricing.reload}>重试</button></div> : null}
                            <div className="flex items-center justify-between gap-2 text-[11px]"><span>对话规划</span><span className="text-right opacity-65">{modelPricingText(pricingRows, effectiveConfig.textModel, "text", pricing)}</span></div>
                            <div className="min-w-0 rounded-lg border p-2" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                                <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]"><span className="inline-flex shrink-0 items-center gap-1 font-medium"><ImageIcon className="size-3" />图片模型</span><span className="min-w-0 truncate text-right opacity-60">{modelPricingText(pricingRows, effectiveConfig.imageModel, "image", pricing)}</span></div>
                                <ModelPicker config={effectiveConfig} value={effectiveConfig.imageModel} capability="image" fullWidth className="!h-8 !min-w-0 !rounded-lg !px-2 !text-xs" onChange={(imageModel) => updateGlobalConfig("imageModel", imageModel)} />
                            </div>
                            <div className="min-w-0 rounded-lg border p-2" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                                <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]"><span className="inline-flex shrink-0 items-center gap-1 font-medium"><Video className="size-3" />视频模型</span><span className="min-w-0 truncate text-right opacity-60">{modelPricingText(pricingRows, effectiveConfig.videoModel, "video", pricing)}</span></div>
                                <ModelPicker config={effectiveConfig} value={effectiveConfig.videoModel} capability="video" fullWidth className="!h-8 !min-w-0 !rounded-lg !px-2 !text-xs" onChange={(videoModel) => updateGlobalConfig("videoModel", videoModel)} />
                            </div>
                            <p className="m-0 text-[10px] leading-4 opacity-55">选择模型不扣积分，实际生成时按模型用量结算。</p>
                        </div>
                    ) : null}
                </div>
                <div className="@container mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                items: [
                                    { key: "upload", icon: <Upload className="size-4" />, label: "上传文件" },
                                    { key: "assets", icon: <FolderOpen className="size-4" />, label: "我的素材" },
                                    { type: "divider" },
                                    { key: "analyze", icon: <Film className="size-4" />, label: "拆解参考视频", disabled: isRunning },
                                ],
                                onClick: ({ key }) => {
                                    if (key === "analyze") { setAnalyzeOpen(true); return; }
                                    key === "upload" ? onOpenUpload() : onOpenAssets();
                                },
                            }}
                        >
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={{ color: theme.node.text }} icon={<Menu className="size-4" />} aria-label="添加素材" />
                        </Dropdown>
                        {onSkillSelect && onSkillRemove ? <CanvasAgentSkillPopover selectedSkills={selectedSkills} onSelect={onSkillSelect} onDeleteSelected={onSkillRemove} onInsertExample={example => onPromptChange([prompt.trim(), example].filter(Boolean).join("\n\n"))} /> : null}
                        <CanvasReferenceAnalysisPopover references={references} model={effectiveConfig.textModel} skills={selectedSkills} disabled={isRunning} hideTrigger open={analyzeOpen} onOpenChange={setAnalyzeOpen} onInsert={report => onPromptChange([prompt.trim(), report].filter(Boolean).join("\n\n"))} />
                        {codexControls}
                        <CanvasImageSettingsPopover
                            config={imageConfig}
                            placement="topLeft"
                            showCount={false}
                            buttonIcon={<ImageIcon className="size-3.5" />}
                            buttonClassName="!h-8 !max-w-[116px] !justify-start !rounded-full !px-2.5"
                            onConfigChange={(key, value) => {
                                if (key === "quality") onAgentConfigChange({ imageQuality: value });
                                else if (key === "size") onAgentConfigChange({ imageSize: value });
                            }}
                        />
                        <CanvasVideoSettingsPopover
                            config={videoConfig}
                            placement="topLeft"
                            visualOnly
                            buttonIcon={<Video className="size-3.5" />}
                            buttonClassName="!h-8 !max-w-[124px] !justify-start !rounded-full !px-2.5"
                            onConfigChange={(key, value) => {
                                if (key === "vquality") onAgentConfigChange({ videoQuality: value });
                                else if (key === "size") onAgentConfigChange({ videoSize: value });
                            }}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button
                            type="primary"
                            shape="circle"
                            className="!size-10 !min-w-10"
                            disabled={!isRunning && !prompt.trim()}
                            onClick={() => (isRunning ? onStop?.() : void submit())}
                            aria-label={isRunning ? "停止" : "发送"}
                            icon={isRunning ? <Square className="size-4 fill-current" /> : <ArrowUp className="size-4" />}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function assistantToPromptReference(reference: CanvasAssistantReference): CanvasResourceReference {
    const kind = reference.type === CanvasNodeType.Video ? "video" : reference.type === CanvasNodeType.Audio ? "audio" : reference.type === CanvasNodeType.Text ? "text" : "image";
    return { id: reference.id, nodeId: reference.id, kind, label: reference.label || reference.title, title: reference.title, previewUrl: reference.dataUrl || reference.url, text: reference.text, active: true };
}
