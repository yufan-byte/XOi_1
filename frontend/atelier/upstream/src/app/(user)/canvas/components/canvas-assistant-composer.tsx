"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowUp, ChevronDown, FolderOpen, Film, Menu, Square, Upload, SlidersHorizontal } from "lucide-react";
import { Button, Dropdown } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { plainModelName } from "@/xoi/model-pricing";
import { CanvasNodeType, type CanvasAgentConfig, type CanvasAgentSkillSelection, type CanvasAssistantReference } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { CanvasReferenceAnalysisPopover } from "./canvas-reference-analysis-popover";
import { CanvasAgentSkillPopover } from "./canvas-agent-skill-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";

export type CanvasAssistantComposerProps = {
    prompt: string;
    isRunning: boolean;
    codexControls?: ReactNode;
    references: CanvasAssistantReference[];
    availableReferences?: CanvasResourceReference[];
    pendingReferences?: CanvasResourceReference[];
    selectedSkills?: CanvasAgentSkillSelection[];
    agentConfig: CanvasAgentConfig;
    onOpenModels: () => void;
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
    onOpenModels,
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
    const textModel = agentConfig.textModel || effectiveConfig.textModel;
    const [analyzeOpen, setAnalyzeOpen] = useState(false);
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
                <div className="mt-1 flex items-center justify-between gap-2 border-t px-1 pt-2" style={{ borderColor: theme.node.stroke }}>
                    <button type="button" onClick={onOpenModels} aria-label="选择画布模型" className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs opacity-75 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5">
                        <SlidersHorizontal className="size-3.5 shrink-0" /><span className="max-w-[160px] truncate">{plainModelName(textModel) || "选择文本模型"}</span><ChevronDown className="size-3 shrink-0 opacity-50" />
                    </button>
                    <span aria-live="polite" className="shrink-0 text-[10px]" style={Array.from(prompt).length > CANVAS_AGENT_INPUT_CHAR_LIMIT ? { color: "#ef4444", opacity: 0.9 } : { opacity: 0.45 }}>
                        {Array.from(prompt).length > CANVAS_AGENT_INPUT_SOFT_HINT ? `${Array.from(prompt).length}/${CANVAS_AGENT_INPUT_CHAR_LIMIT}${Array.from(prompt).length > CANVAS_AGENT_INPUT_CHAR_LIMIT ? " · 超限，发送已锁定" : ""}` : "本画布设置"}
                    </span>
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
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button
                            type="primary"
                            shape="circle"
                            className="!size-10 !min-w-10"
                            disabled={!isRunning && (!prompt.trim() || Array.from(prompt).length > CANVAS_AGENT_INPUT_CHAR_LIMIT)}
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

/** Agent 输入上限：与面板发送口同值；计数器超 3800 字开始提示，超 5000 字锁定发送。 */
const CANVAS_AGENT_INPUT_CHAR_LIMIT = 5_000;
const CANVAS_AGENT_INPUT_SOFT_HINT = 3_800;

export function assistantToPromptReference(reference: CanvasAssistantReference): CanvasResourceReference {
    const kind = reference.type === CanvasNodeType.Video ? "video" : reference.type === CanvasNodeType.Audio ? "audio" : reference.type === CanvasNodeType.Text ? "text" : "image";
    return { id: reference.id, nodeId: reference.id, kind, label: reference.label || reference.title, title: reference.title, previewUrl: reference.dataUrl || reference.url, text: reference.text, active: true };
}
