import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ArrowUp, Bot, Copy, History, LoaderCircle, PanelRightClose, Paperclip, Plus, RotateCcw, Settings2, Sparkles, Square, Trash2, Upload } from "lucide-react";
import { Button, Modal, Segmented, Switch, Tooltip } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { requestImageQuestion } from "@/services/api/image";
import { defaultConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasAgentConfig, CanvasAgentSkillSelection, CanvasAssistantMessage, CanvasAssistantReference, CanvasAssistantSession, CanvasNodeData } from "@/types/canvas";
import { CanvasAssistantComposer } from "./canvas-assistant-composer";

type CanvasAgentPanelProps = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    sessions: CanvasAssistantSession[];
    activeSessionId: string | null;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null) => void;
    onCreateTextNode: (text: string) => void;
    onOpenAssets?: () => void;
    onUpload?: () => void;
    onClose: () => void;
    initialRequest?: { prompt: string; skills: CanvasAgentSkillSelection[] } | null;
    onInitialRequestConsumed?: () => void;
};

function makeSession(): CanvasAssistantSession {
    const now = new Date().toISOString();
    return { id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: "新对话", messages: [], createdAt: now, updatedAt: now };
}

function toApiRole(role: CanvasAssistantMessage["role"]): "user" | "assistant" {
    return role === "assistant" ? "assistant" : "user";
}

/** 原版参考项目的右侧 Agent 面板布局：历史、新对话、设置、Codex 入口和底部创作输入框。 */
export function CanvasAgentPanel({ nodes, selectedNodeIds, sessions, activeSessionId, onSessionsChange, onCreateTextNode, onOpenAssets, onUpload, onClose, initialRequest, onInitialRequestConsumed }: CanvasAgentPanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const config = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [view, setView] = useState<"chat" | "history">("chat");
    const [prompt, setPrompt] = useState("");
    const [running, setRunning] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [panelWidth, setPanelWidth] = useState(() => Number(localStorage.getItem("canvas-agent-panel-width")) || 464);
    const [composerConfig, setComposerConfig] = useState(config);
    const [agentConfig, setAgentConfig] = useState<CanvasAgentConfig>({
        textApiMode: "chat" as const,
        textReasoningEnabled: false,
        autoGenerateMedia: true,
        imageQuality: config.quality || "auto",
        imageSize: config.size || "1:1",
        videoQuality: config.vquality || "720",
        videoSize: /^\d+x\d+$/.test(config.size || "") ? config.size : "1280x720",
    });
    const [handoffSkills, setHandoffSkills] = useState<CanvasAgentSkillSelection[]>([]);
    const [handoffSkillContents, setHandoffSkillContents] = useState<Array<{ name: string; content: string }>>([]);
    const consumedRequestRef = useRef<string>("");
    useEffect(() => setComposerConfig(config), [config]);
    useEffect(() => {
        if (!initialRequest || consumedRequestRef.current === initialRequest.prompt) return;
        consumedRequestRef.current = initialRequest.prompt;
        setPrompt(initialRequest.prompt);
        setHandoffSkills(initialRequest.skills || []);
        setHandoffSkillContents([]);
        onInitialRequestConsumed?.();
    }, [initialRequest, onInitialRequestConsumed]);
    const abortRef = useRef<AbortController | null>(null);
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (!running) {
            setElapsed(0);
            return;
        }
        const started = Date.now();
        const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
        return () => window.clearInterval(timer);
    }, [running]);
    const session = useMemo(() => sessions.find((item) => item.id === activeSessionId) || sessions[0] || null, [activeSessionId, sessions]);
    const messages = session?.messages || [];
    const selectedNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id)), [nodes, selectedNodeIds]);
    const selectedReferences = useMemo<CanvasAssistantReference[]>(() => selectedNodes.map((node) => ({
        id: node.id,
        type: node.type,
        title: node.title,
        label: node.title || node.type,
        text: node.type === "text" ? node.metadata?.content : undefined,
        dataUrl: node.metadata?.images?.find((image) => image.id === node.metadata?.primaryImageId)?.content || node.metadata?.images?.[0]?.content,
    })), [selectedNodes]);
    const commit = (next: CanvasAssistantSession[], id: string | null = session?.id || null) => onSessionsChange(next, id);

    const startResize = (event: React.MouseEvent) => {
        event.preventDefault();
        const move = (moveEvent: MouseEvent) => {
            const next = Math.min(760, Math.max(464, window.innerWidth - moveEvent.clientX));
            setPanelWidth(next);
        };
        const stop = () => {
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
            setPanelWidth((value) => {
                localStorage.setItem("canvas-agent-panel-width", String(value));
                return value;
            });
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    };

    const loadSkillContents = async (skills: CanvasAgentSkillSelection[]) => {
        const withPaths = skills.filter((skill) => skill.path);
        if (!withPaths.length) return [];
        const loaded = await Promise.all(
            withPaths.map(async (skill) => {
                try {
                    const response = await fetch("/api/setting/skillManagement/getSkillContent", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: localStorage.getItem("token") || "" },
                        body: JSON.stringify({ path: skill.path }),
                    });
                    if (!response.ok) return null;
                    const payload = await response.json();
                    const content = typeof payload?.data === "string" ? payload.data : typeof payload === "string" ? payload : "";
                    return content.trim() ? { name: skill.name, content } : null;
                } catch {
                    return null;
                }
            }),
        );
        return loaded.filter((item): item is { name: string; content: string } => Boolean(item));
    };

    const send = async (preset?: string) => {
        const text = (preset || prompt).trim();
        if (!text || running) return;
        const current = session || makeSession();
        const now = Date.now();
        const userMessage: CanvasAssistantMessage = { id: `user-${now}`, role: "user", text };
        const assistantMessage: CanvasAssistantMessage = { id: `assistant-${now}`, role: "assistant", text: "", meta: "正在理解画布和创作目标" };
        const nodeContext = nodes.map((node) => ({ id: node.id, type: node.type, title: node.title, prompt: node.metadata?.prompt, content: node.type === "text" ? node.metadata?.content : undefined, status: node.metadata?.status }));
        const skillContext = handoffSkills.length ? `\n\n【本次已选择 Skills】${handoffSkills.map((skill) => skill.name).join("、")}\n请将这些专业方法融入回答。` : "";
        const skillContents = handoffSkillContents.length ? handoffSkillContents : await loadSkillContents(handoffSkills);
        if (skillContents.length) setHandoffSkillContents(skillContents);
        const skillPrompt = skillContents.length
            ? `\n\n【用户所选 Skill 根内容】\n必须完整读取并遵循以下 Skill；所选 Skill 决定创作流程、输出格式和专业方法，用户明确指令优先。\n${skillContents.map((skill) => `【完整 Skill：${skill.name}】\n${skill.content}`).join("\n\n")}`
            : "";
        const composerSettings = `\n\n【本次创作设置】图片：${agentConfig.imageQuality} · ${agentConfig.imageSize}；视频：${agentConfig.videoQuality} · ${agentConfig.videoSize}；推理：${agentConfig.textReasoningEnabled ? "开启" : "关闭"}。请在需要生成媒体或创建画布节点时严格使用这些参数。`;
        const context = nodes.length
            ? `\n\n【当前画布真实上下文】${JSON.stringify(nodeContext)}\n请结合节点 ID、类型、标题、正文和状态回答；不要编造不存在的节点或任务。${skillContext}${composerSettings}`
            : `\n\n【当前画布】还是空的，请从创作目标开始。${skillContext}${composerSettings}`;
        const base = { ...current, title: current.messages.length ? current.title : text.slice(0, 18) || "新对话", messages: [...current.messages, userMessage, assistantMessage], updatedAt: new Date().toISOString() };
        const baseSessions = sessions.some((item) => item.id === current.id) ? sessions.map((item) => (item.id === current.id ? base : item)) : [base, ...sessions];
        commit(baseSessions, current.id);
        setPrompt("");
        setRunning(true);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            // Agent 永远取文本模型；旧面板把当前图片模型 config.model 发给文本接口，会触发供应商 503。
            // Use the composer-local config, which is updated by the exact
            // image/video popovers. Reading `config` here discarded every
            // selection before submission, so canvas generation saw defaults.
            const textConfig = {
                ...composerConfig,
                model: "",
                textModel: composerConfig.textModel || defaultConfig.textModel,
                quality: agentConfig.imageQuality,
                size: agentConfig.imageSize,
                vquality: agentConfig.videoQuality,
                reasoning: agentConfig.textReasoningEnabled ? "high" : undefined,
                systemPrompt: [composerConfig.systemPrompt, skillPrompt].filter(Boolean).join("\n\n"),
            };
            const prior = current.messages
                .filter((item) => item.text)
                .slice(-12)
                .map((item) => ({ role: toApiRole(item.role), content: item.text }));
            const answer = await requestImageQuestion(textConfig, [...prior, { role: "user", content: `${text}${context}` }], () => undefined, { signal: controller.signal });
            const completed = { ...base, messages: base.messages.map((item) => (item.id === assistantMessage.id ? { ...item, text: answer, meta: undefined } : item)), updatedAt: new Date().toISOString() };
            commit(
                baseSessions.map((item) => (item.id === current.id ? completed : item)),
                current.id,
            );
        } catch (error) {
            const raw = error instanceof DOMException && error.name === "AbortError" ? "已停止继续执行。已经生成的对话内容会保留。" : error instanceof Error ? error.message : "Agent 请求失败";
            const answer = raw.includes("503") ? "API 请求返回 503：当前文本模型或供应商暂时不可用。请点击右上角设置，选择可用的文本模型（不要选择图片模型），并检查供应商状态。" : raw;
            const failed = { ...base, messages: base.messages.map((item) => (item.id === assistantMessage.id ? { ...item, text: answer, meta: undefined } : item)), updatedAt: new Date().toISOString() };
            commit(
                baseSessions.map((item) => (item.id === current.id ? failed : item)),
                current.id,
            );
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setRunning(false);
        }
    };

    const iconButton = "grid size-8 place-items-center rounded-full text-stone-300 transition hover:bg-white/10 hover:text-white";
    return (
        <aside
            data-canvas-agent-panel="true"
            data-canvas-no-zoom
            className="relative flex h-full max-w-full shrink-0 flex-col border-l shadow-2xl"
            style={{ width: panelWidth, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <button type="button" className="absolute inset-y-0 left-0 z-40 w-4 -translate-x-1/2 cursor-col-resize" onMouseDown={startResize} aria-label="调整右侧面板宽度" title="拖动调整面板宽度" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Bot className="size-4" />
                    创作 Agent
                    <button type="button" className="ml-1 inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs" style={{ color: theme.node.text, borderColor: theme.toolbar.border }} title="切换到 Codex">
                        <ArrowLeftRight className="size-3.5" />
                        Codex
                    </button>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" className={iconButton} aria-label="历史记录" onClick={() => setView((current) => (current === "history" ? "chat" : "history"))}>
                        <History className="size-4" />
                    </button>
                    <button
                        type="button"
                        className={iconButton}
                        aria-label="新建对话"
                        onClick={() => {
                            const next = makeSession();
                            commit([next, ...sessions], next.id);
                            setView("chat");
                        }}
                    >
                        <Plus className="size-4" />
                    </button>
                    <button type="button" className={iconButton} aria-label="Agent 设置" onClick={() => setSettingsOpen(true)}>
                        <Settings2 className="size-4" />
                    </button>
                    <button type="button" className={iconButton} aria-label="收起 Agent" onClick={onClose}>
                        <PanelRightClose className="size-4" />
                    </button>
                </div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {view === "history" ? (
                    <div className="space-y-1">
                        <div className="mb-3 text-xs font-medium opacity-55">对话历史</div>
                        {(sessions.length ? sessions : [session]).filter(Boolean).map((item) => (
                            <div key={item!.id} className="group flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/10" style={item!.id === session?.id ? { background: theme.toolbar.activeBg } : undefined}>
                                <button
                                    type="button"
                                    className="min-w-0 flex-1 truncate py-1 text-left text-sm"
                                    onClick={() => {
                                        commit(sessions, item!.id);
                                        setView("chat");
                                    }}
                                >
                                    {item!.title}
                                    <span className="ml-2 text-xs opacity-45">{item!.messages.length} 条</span>
                                </button>
                                <button
                                    type="button"
                                    className="grid size-7 place-items-center rounded-full opacity-70 transition hover:bg-white/10 hover:opacity-100"
                                    title="删除对话"
                                    aria-label="删除对话"
                                    onClick={() => {
                                        const next = sessions.filter((entry) => entry.id !== item!.id);
                                        const fallback = next[0] || makeSession();
                                        commit(next.length ? next : [fallback], next[0]?.id || fallback.id);
                                    }}
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : messages.length ? (
                    messages.map((message) => (
                        <div key={message.id} className={`flex flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
                            {message.text ? (
                                <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6" style={{ background: message.role === "user" ? theme.toolbar.activeBg : theme.node.fill }}>
                                    {message.role === "assistant" ? (
                                        <div className="mb-1 flex items-center gap-1.5 text-xs opacity-60">
                                            <Bot className="size-3.5" />
                                            Agent
                                        </div>
                                    ) : null}
                                    {message.text}
                                </div>
                            ) : message.meta ? (
                                <div className="flex items-center gap-2 rounded-2xl px-3 py-2 text-sm opacity-65" style={{ background: theme.node.fill }}>
                                    <LoaderCircle className="size-3.5 animate-spin" />
                                    {message.meta}
                                    <span className="ml-1">{elapsed}秒</span>
                                    <span className="opacity-70">{Math.min(90, 10 + elapsed * 10)}%</span>
                                </div>
                            ) : null}
                            {message.role === "assistant" && message.text ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <button type="button" className="rounded-full border px-2.5 py-1 text-[11px] opacity-70 hover:opacity-100" style={{ borderColor: theme.toolbar.border }} title="回写到画布" onClick={() => onCreateTextNode(message.text)}>
                                        <Plus className="mr-1 inline size-3" />
                                        回写画布
                                    </button>
                                    <button
                                        type="button"
                                        className="grid size-7 place-items-center rounded-full border opacity-65 hover:opacity-100"
                                        style={{ borderColor: theme.toolbar.border }}
                                        title="复制"
                                        onClick={() => void navigator.clipboard?.writeText(message.text)}
                                    >
                                        <Copy className="size-3.5" />
                                    </button>
                                    <button type="button" className="grid size-7 place-items-center rounded-full border opacity-65 hover:opacity-100" style={{ borderColor: theme.toolbar.border }} title="重试" onClick={() => void send(message.text)}>
                                        <RotateCcw className="size-3.5" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ))
                ) : (
                    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                        <div className="grid size-12 place-items-center rounded-2xl" style={{ background: theme.node.fill }}>
                            <Sparkles className="size-5" />
                        </div>
                        <div className="mt-4 text-base font-medium">从一个想法开始</div>
                        <div className="mt-2 max-w-[260px] text-sm leading-6 opacity-55">描述故事、宣传片或现有素材，Agent 会理解画布并直接帮你继续创作</div>
                    </div>
                )}
            </div>
            <div className="px-2 pb-2">
                {selectedNodes.length ? (
                    <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                        <span className="self-center text-[11px] opacity-45">已引用</span>
                        {selectedNodes.slice(0, 4).map((node) => (
                            <span key={node.id} className="max-w-[150px] truncate rounded-full border px-2 py-1 text-[11px] opacity-75" style={{ borderColor: theme.toolbar.border }}>
                                {node.title || node.type}
                            </span>
                        ))}
                        {selectedNodes.length > 4 ? <span className="self-center text-[11px] opacity-45">+{selectedNodes.length - 4}</span> : null}
                    </div>
                ) : null}
                {handoffSkills.length ? (
                    <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                        <span className="self-center text-[11px] opacity-45">已选 Skill</span>
                        {handoffSkills.map((skill) => (
                            <span key={skill.id} className="rounded-full px-2 py-1 text-[11px]" style={{ background: theme.toolbar.activeBg }}>
                                {skill.name}
                            </span>
                        ))}
                    </div>
                ) : null}
                <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                    <button type="button" className="rounded-full border px-2.5 py-1 text-[11px] opacity-70 hover:opacity-100" style={{ borderColor: theme.toolbar.border }} onClick={() => void send("把当前画布整理成一个清晰的创作计划")}>
                        整理画布
                    </button>
                    <button type="button" className="rounded-full border px-2.5 py-1 text-[11px] opacity-70 hover:opacity-100" style={{ borderColor: theme.toolbar.border }} onClick={() => void send("为当前创意写一段电影感分镜脚本")}>
                        写分镜
                    </button>
                    <button
                        type="button"
                        className="rounded-full border px-2.5 py-1 text-[11px] opacity-70 hover:opacity-100"
                        style={{ borderColor: theme.toolbar.border }}
                        onClick={() => {
                            const latest = [...messages].reverse().find((item) => item.role === "assistant" && item.text);
                            if (latest) onCreateTextNode(latest.text);
                        }}
                    >
                        创建并回写
                    </button>
                </div>
                <CanvasAssistantComposer
                    prompt={prompt}
                    isRunning={running}
                    references={selectedReferences}
                    availableReferences={selectedReferences.map((reference) => ({ id: reference.id, nodeId: reference.id, kind: reference.type === "video" ? "video" : reference.type === "audio" ? "audio" : reference.type === "text" ? "text" : "image", label: reference.label || reference.title, title: reference.title, previewUrl: reference.dataUrl || reference.url, text: reference.text, active: true }))}
                    selectedSkills={handoffSkills}
                    agentConfig={agentConfig}
                    onAgentConfigChange={(patch) => setAgentConfig((current) => ({ ...current, ...patch }))}
                    onPromptChange={setPrompt}
                    onReferenceIdsChange={() => undefined}
                    onSkillSelect={(skill) =>
                        setHandoffSkills((current) => {
                            const exists = current.some((item) => item.id === skill.id && item.source === skill.source);
                            return exists ? current.map((item) => (item.id === skill.id && item.source === skill.source ? skill : item)) : [...current, skill].slice(-5);
                        })
                    }
                    onSkillRemove={(id, source) => setHandoffSkills((current) => current.filter((item) => item.id !== id || item.source !== source))}
                    onSubmit={(nextPrompt) => send(nextPrompt)}
                    onStop={() => abortRef.current?.abort()}
                    onOpenUpload={() => onUpload?.()}
                    onOpenAssets={() => onOpenAssets?.()}
                    onPasteImage={() => onUpload?.()}
                />
            </div>
            <Modal title="Agent 设置" open={settingsOpen} centered width={520} onCancel={() => setSettingsOpen(false)} footer={<Button type="primary" onClick={() => setSettingsOpen(false)}>完成</Button>}>
                <div className="flex items-center justify-between gap-6 py-2">
                    <div><div className="text-sm font-medium">文本接口</div><div className="mt-1 text-xs opacity-55">选择 Chat Completions 或 Responses 接口</div></div>
                    <Segmented value={agentConfig.textApiMode} options={[{ label: "Chat", value: "chat" }, { label: "Responses", value: "responses" }]} onChange={(textApiMode) => setAgentConfig((current) => ({ ...current, textApiMode: textApiMode as CanvasAgentConfig["textApiMode"] }))} />
                </div>
                <div className="flex items-center justify-between gap-6 py-2">
                    <div><div className="text-sm font-medium">自动生成图片/视频/音频</div><div className="mt-1 text-xs opacity-55">允许 Agent 根据对话中的创作设置继续媒体工作流</div></div>
                    <Switch checked={agentConfig.autoGenerateMedia} onChange={(autoGenerateMedia) => setAgentConfig((current) => ({ ...current, autoGenerateMedia }))} />
                </div>
                <div className="mt-3 border-t pt-3 text-xs opacity-55" style={{ borderColor: theme.toolbar.border }}>
                    模型与供应商连接沿用全局 AI 设置。
                    <Button type="link" size="small" onClick={() => { setSettingsOpen(false); openConfigDialog(false, "channels"); }}>打开全局设置</Button>
                </div>
            </Modal>
        </aside>
    );
}
