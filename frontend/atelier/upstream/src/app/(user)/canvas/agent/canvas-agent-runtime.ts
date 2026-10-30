import {
    CANVAS_AGENT_JSON_FALLBACK_SIGNAL,
    canvasAgentSystemPrompt,
    isCanvasAgentContextLimitError,
    requestCanvasAgentCheckpoint,
    requestCanvasAgentTurn,
} from "@/services/api/canvas-agent";
import type { AiConfig } from "@/stores/use-config-store";
import type {
    CanvasAgentContent,
    CanvasAgentJsonFallbackMode,
    CanvasAgentProtocolMessage,
    CanvasAgentState,
    CanvasAgentToolMode,
    CanvasAssistantMessageStatus,
    CanvasAssistantReference,
} from "../types";
import type { CanvasAgentContext } from "./canvas-agent-context";
import { buildCanvasAgentSkillPrompt, buildCompactCanvasAgentPrompt, canvasAgentForbidsMediaGeneration } from "./canvas-agent-skills";
import {
    compactCanvasAgentHistory,
    MAX_AGENT_INPUT_BYTES,
    MAX_AGENT_INPUT_TOKENS,
    estimateCanvasAgentInputTokens,
    measureCanvasAgentInputBytes,
    slimCanvasAgentMessages,
    serializeCanvasAgentMessagesForCheckpoint,
} from "./canvas-agent-memory";
import {
    CANVAS_AGENT_SKILL_FILE_TOOL,
    CANVAS_AGENT_TOOLS,
    canvasAgentActionLabel,
    isCanvasAgentMediaAction,
    normalizeCanvasAgentAction,
    parseCanvasAgentJson,
    userLikelyRequestedCanvasAction,
    type CanvasAgentAction,
    type CanvasAgentToolDefinition,
    type CanvasAgentToolResult,
} from "./canvas-agent-tools";

const MAX_AGENT_STEPS = 12;
/** 整轮运行总时长上限：单步已有 150s 硬超时，这里再兜一层，防止 12 步叠加成半小时。 */
const MAX_AGENT_RUN_MS = 6 * 60_000;

export type CanvasAgentRuntimeEvent = {
    status: CanvasAssistantMessageStatus;
    label: string;
    /** 思考型模型思维链增量（90ms 批量）；到达时 status 恒为 thinking，UI 追加到 message.reasoning。 */
    reasoningDelta?: string;
};

export type RunCanvasAgentInput = {
    config: AiConfig;
    initialState: CanvasAgentState;
    protocolMessages: CanvasAgentProtocolMessage[];
    userText: string;
    references: CanvasAssistantReference[];
    activeSkillContents?: Array<{ id: string; source: "system" | "user"; name: string; content: string; hasFiles?: boolean }>;
    contextCheckpoint?: string;
    preferredJsonMode?: CanvasAgentJsonFallbackMode;
    getContext: (state: CanvasAgentState) => CanvasAgentContext;
    executeAction: (action: CanvasAgentAction, signal?: AbortSignal) => Promise<CanvasAgentToolResult>;
    onEvent?: (event: CanvasAgentRuntimeEvent) => void;
    onCheckpoint?: (checkpoint: {
        state: CanvasAgentState;
        protocolMessages: CanvasAgentProtocolMessage[];
        contextCheckpoint?: string;
        jsonFallbackMode?: CanvasAgentJsonFallbackMode;
    }) => void;
    signal?: AbortSignal;
};

export type RunCanvasAgentResult = {
    reply: string;
    state: CanvasAgentState;
    protocolMessages: CanvasAgentProtocolMessage[];
    contextCheckpoint?: string;
    jsonFallbackMode?: CanvasAgentJsonFallbackMode;
};

export function createCanvasAgentState(): CanvasAgentState {
    return {
        phase: "intake",
        approvedNodeIds: [],
        referenceNodeIds: [],
        pendingTaskIds: [],
        completedTaskIds: [],
    };
}

export async function runCanvasAgent(input: RunCanvasAgentInput): Promise<RunCanvasAgentResult> {
    let state = input.initialState;
    // Budget the same text model/channel that transport actually uses, rather than the image default.
    const textConfig = { ...input.config, model: input.config.textModel || input.config.model, activeChannelId: input.config.textChannelId || input.config.activeChannelId };
    // DeepSeek 兼容线路对多轮原生 tool 消息的回包不稳定，统一使用可校验的 JSON 指令。
    let toolMode: CanvasAgentToolMode = input.preferredJsonMode || (/deepseek/i.test(input.config.textModel || input.config.model) ? "structured-json" : "native");
    let usedJsonFallbackMode = input.preferredJsonMode;
    let hasExecutedActions = false;
    let lastActionReply = "";
    let protocolError: string | undefined;
    let protocolErrorCount = 0;
    let expectedAction = false;
    let protocolMessages: CanvasAgentProtocolMessage[] = [
        ...input.protocolMessages,
        { role: "user" as const, content: buildUserContent(input.userText, input.references, input.config.textModel || input.config.model) },
    ];
    let contextCheckpoint = input.contextCheckpoint;
    // Skill 全文曾把 system prompt 撑到 40KB+（单份 4 万字的 Skill 也照塞），是请求体超网关 80KB 红线的主因。
    // 这里每份只注入前 6000 字、总量 16000 字封顶，剩余内容按需再取。
    // 人物/捏脸类方法论依赖完整模板与范例（截尾即失效），单独放宽到 12000 字。
    const SKILL_CONTENT_CHAR_LIMIT = 6_000;
    const SKILL_CONTENT_CHAR_LIMIT_CHARACTER = 12_000;
    const SKILL_TOTAL_CHAR_BUDGET = 16_000;
    const SKILL_TOTAL_CHAR_BUDGET_CHARACTER = 24_000;
    const isCharacterSkill = (skill: { name?: string; content?: string }) =>
        /捏脸|搓脸|定妆|角色脸|人物设定|character[-_ ]?face|原创角色|虚拟人/i.test(String(skill.name || "")) ||
        /捏脸九步法|一个强项，两个辅助|三庭五眼/.test(String(skill.content || "").slice(0, 4000));
    const activeSkillContents = (() => {
        if (!input.activeSkillContents?.length) return undefined;
        let total = 0;
        const parts: string[] = [];
        input.activeSkillContents.forEach((skill, index) => {
            const character = isCharacterSkill(skill);
            const perLimit = character ? SKILL_CONTENT_CHAR_LIMIT_CHARACTER : SKILL_CONTENT_CHAR_LIMIT;
            if (total >= (character ? SKILL_TOTAL_CHAR_BUDGET_CHARACTER : SKILL_TOTAL_CHAR_BUDGET)) return;
            let content = String(skill.content || "");
            if (content.length > perLimit) content = `${content.slice(0, perLimit)}…（${skill.name} 其余 ${content.length - perLimit} 字已省略）`;
            total += content.length;
            parts.push(`【Skill ${index + 1}：${skill.name}（${skill.source === "system" ? `系统 Skill ID：${skill.id}` : "用户 Skill"}）】\n${content}`);
        });
        return parts.length ? parts.join("\n\n") : undefined;
    })();
    const skillFileToolAvailable = Boolean(input.activeSkillContents?.some((skill) => skill.source === "system" && skill.hasFiles));
    const mediaGenerationForbidden = canvasAgentForbidsMediaGeneration(input.userText);
    const mediaToolNames = new Set(["generate_image", "edit_image", "generate_video", "generate_audio", "get_media_task_status"]);
    const mediaFilteredTools = mediaGenerationForbidden
        ? CANVAS_AGENT_TOOLS.filter((tool) => !mediaToolNames.has(tool.function.name))
        : CANVAS_AGENT_TOOLS;
    // “继续制作”不授权模型为了整理或重试而删用户节点。
    const deletionRequested = /(?:删除|删掉|清空|移除)/.test(input.userText) && !/(?:不|别|不要|禁止)(?:再|自动)?(?:删除|删掉|清空|移除)/.test(input.userText);
    const availableTools = deletionRequested ? mediaFilteredTools : mediaFilteredTools.filter(tool => !["delete_node", "delete_connection"].includes(tool.function.name));
    const scopedTools = scopeCanvasAgentTools(availableTools, input.userText);
    const agentTools = skillFileToolAvailable ? [...scopedTools, CANVAS_AGENT_SKILL_FILE_TOOL] : scopedTools;

    const emitCheckpoint = () => input.onCheckpoint?.({
        state,
        protocolMessages: persistCanvasAgentProtocolMessages(protocolMessages),
        contextCheckpoint,
        jsonFallbackMode: usedJsonFallbackMode,
    });

    const compactHistory = async (recentTokenBudget?: number) => {
        const compacted = await compactCanvasAgentHistory({
            protocolMessages,
            contextCheckpoint,
            recentTokenBudget,
            createCheckpoint: (previousCheckpoint, messages) => requestCanvasAgentCheckpoint({
                config: textConfig,
                previousCheckpoint,
                messages: serializeCanvasAgentMessagesForCheckpoint(messages),
                signal: input.signal,
            }),
        });
        if (!compacted.compacted) return false;
        protocolMessages = compacted.protocolMessages;
        contextCheckpoint = compacted.contextCheckpoint;
        emitCheckpoint();
        return true;
    };

    const runStartedAt = Date.now();
    // 当前 DeepSeek 兼容线路在约 11K 输入时偶发只返回 usage、choices 为空。
    // 画布历史先在 9K 前瘦身/压缩，给工具 JSON 和最终回执留下可靠余量。
    const inputTokenLimit = /deepseek/i.test(input.config.textModel || input.config.model) ? 9_000 : MAX_AGENT_INPUT_TOKENS;
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
        throwIfAborted(input.signal);
        if (Date.now() - runStartedAt > MAX_AGENT_RUN_MS) {
            return {
                reply: "本轮执行超过 6 分钟已自动停止；已经完成的操作保留在画布上，可以直接继续或重试。",
                state,
                protocolMessages: persistCanvasAgentProtocolMessages(protocolMessages),
                contextCheckpoint,
                jsonFallbackMode: usedJsonFallbackMode,
            };
        }
        input.onEvent?.({ status: "thinking", label: step ? "正在根据画布结果继续" : "正在理解画布和创作目标" });
        const context = input.getContext(state);
        let systemPrompt = buildCanvasAgentSkillPrompt(state.phase, input.userText, context, activeSkillContents, contextCheckpoint, skillFileToolAvailable);
        const compactPrompt = () => buildCompactCanvasAgentPrompt(context, activeSkillContents, contextCheckpoint, /deepseek/i.test(textConfig.model) ? 4_000 : 6_000);
        const nativeTools = toolMode === "native";
        const tools = nativeTools ? agentTools : [];
        const buildFullPrompt = () => canvasAgentSystemPrompt(textConfig, systemPrompt, nativeTools ? [] : agentTools, nativeTools);
        const overBudget = () => {
            const request = { systemPrompt: buildFullPrompt(), messages: protocolMessages, tools };
            return measureCanvasAgentInputBytes(request) >= MAX_AGENT_INPUT_BYTES || estimateCanvasAgentInputTokens(request) >= inputTokenLimit;
        };
        if (overBudget()) {
            // ① 无损瘦身：截断工具结果、历史图片换占位。不调模型、不花钱，绝大多数情况到这就够了。
            protocolMessages = slimCanvasAgentMessages(protocolMessages);
            emitCheckpoint();
            // ② 先免费压缩本轮手册；不能先购买摘要，随后才发现手册本身仍占满预算。
            if (overBudget()) systemPrompt = compactPrompt();
            // ③ 小上下文线路不能固定留下 3K 历史，还需为工具定义、画布快照和检查点留空间。
            if (overBudget() && await compactHistory(/deepseek/i.test(textConfig.model) ? 1_000 : undefined)) {
                systemPrompt = compactPrompt();
            }
        }
        // The built-in manuals themselves can exceed a small model's context even with zero history.
        // Switch to a complete concise contract instead of repeatedly summarizing an empty history.
        if (overBudget()) systemPrompt = compactPrompt();

        // 思考过程旁路：SSE reasoning 增量 90ms 批量上报，避免每个 token 触发一次 UI 更新。
        // await 结束后同步 flush 保住最后一批尾巴；flush 恒早于下一步 onEvent，无状态回跳。
        let pendingReasoningFlush: (() => void) | null = null;
        const flushPendingReasoning = () => { pendingReasoningFlush?.(); pendingReasoningFlush = null; };
        const requestTurn = () => {
            if (overBudget()) {
                console.warn("[canvas-agent] 输入预算不足", { model: textConfig.model, limit: inputTokenLimit, promptBytes: new TextEncoder().encode(buildFullPrompt()).length, historyBytes: new TextEncoder().encode(JSON.stringify(protocolMessages)).length, inputTokens: estimateCanvasAgentInputTokens({ systemPrompt: buildFullPrompt(), messages: protocolMessages, tools }) });
                throw new Error("本轮内容仍超过模型输入上限，已在调用前停止。画布内容已保留，请把长稿放入文字节点后引用，或减少本轮引用的节点。");
            }
            let reasoningBuffer = "";
            let reasoningTimer: ReturnType<typeof setTimeout> | null = null;
            const emitReasoning = () => {
                reasoningTimer = null;
                if (!reasoningBuffer) return;
                const delta = reasoningBuffer;
                reasoningBuffer = "";
                input.onEvent?.({ status: "thinking", label: "正在思考", reasoningDelta: delta });
            };
            pendingReasoningFlush = () => {
                if (reasoningTimer) { clearTimeout(reasoningTimer); reasoningTimer = null; }
                emitReasoning();
            };
            return requestCanvasAgentTurn({
                config: textConfig,
                systemPrompt,
                messages: protocolMessages,
                tools: agentTools,
                toolMode,
                signal: input.signal,
                onDelta: input.onEvent ? (delta) => {
                    if (typeof delta.reasoning !== "string" || !delta.reasoning) return;
                    reasoningBuffer += delta.reasoning;
                    if (!reasoningTimer) reasoningTimer = setTimeout(emitReasoning, 90);
                } : undefined,
            });
        };
        let turn: Awaited<ReturnType<typeof requestCanvasAgentTurn>>;
        try {
            turn = await requestTurn();
            flushPendingReasoning();
            // 非流式线路（glm/mimo 等）在完成后一次性返回完整思维链：补进消息供折叠查看。
            if (turn.reasoningContent !== undefined) {
                input.onEvent?.({ status: "thinking", label: "思考完成", reasoningDelta: turn.reasoningContent });
            }
        } catch (error) {
            flushPendingReasoning();
            if (hasExecutedActions && isEmptyCanvasAgentFollowupError(error)) {
                const reply = lastActionReply || "本轮画布操作已经完成，结果已保留。";
                protocolMessages = [...protocolMessages, { role: "assistant" as const, content: reply }];
                return { reply, state, protocolMessages: persistCanvasAgentProtocolMessages(protocolMessages), contextCheckpoint, jsonFallbackMode: usedJsonFallbackMode };
            }
            if (!isCanvasAgentContextLimitError(error) || !(await compactHistory())) throw error;
            systemPrompt = buildCanvasAgentSkillPrompt(state.phase, input.userText, context, activeSkillContents, contextCheckpoint, skillFileToolAvailable);
            try {
                turn = await requestTurn();
                flushPendingReasoning();
            } catch (retryError) {
                if (hasExecutedActions && isEmptyCanvasAgentFollowupError(retryError)) {
                    const reply = lastActionReply || "本轮画布操作已经完成，结果已保留。";
                    protocolMessages = [...protocolMessages, { role: "assistant" as const, content: reply }];
                    return { reply, state, protocolMessages: persistCanvasAgentProtocolMessages(protocolMessages), contextCheckpoint, jsonFallbackMode: usedJsonFallbackMode };
                }
                throw retryError;
            }
        }
        toolMode = turn.toolMode;
        if (!protocolError && !turn.toolError && toolMode === "native" && !turn.toolCalls.length && turn.content.trim() === CANVAS_AGENT_JSON_FALLBACK_SIGNAL) {
            expectedAction = true;
            toolMode = "structured-json";
            step -= 1;
            continue;
        }

        // 截断/非法 JSON 不再让整轮直接崩掉：转成本轮反馈，让模型拆小批次重发（造物同款容错）
        let parsedJson: Awaited<ReturnType<typeof parseCanvasAgentJson>>;
        let parseError: string | undefined;
        try {
            parsedJson = await parseCanvasAgentJson(turn.content, { allowRepair: toolMode !== "native" });
        } catch (error) {
            parsedJson = { parsed: false, actions: [], reply: turn.content.trim() } as Awaited<ReturnType<typeof parseCanvasAgentJson>>;
            parseError = (error instanceof Error ? error.message : "JSON 解析失败") + "。请把本轮操作拆成更小的批次：最多 3 个 action，arguments 只保留必填字段后重发。";
        }
        if (toolMode !== "native" && parsedJson.parsed) usedJsonFallbackMode = toolMode;
        const assistantToolMessage: CanvasAgentProtocolMessage = {
            role: "assistant",
            content: turn.content || undefined,
            ...(turn.reasoningContent !== undefined ? { reasoningContent: turn.reasoningContent } : {}),
            ...(turn.responseItems?.length ? { responseItems: turn.responseItems } : {}),
            ...(turn.toolCalls.length ? { toolCalls: turn.toolCalls } : {}),
        };
        let nativeActions: CanvasAgentAction[] = [];
        let actionError = turn.toolError || (turn.toolCalls.length
            ? turn.toolCalls.find((toolCall) => toolCall.argumentsError)?.argumentsError
            : parseError || parsedJson.error);
        if (!actionError) {
            try {
                nativeActions = turn.toolCalls.map((toolCall) => normalizeCanvasAgentAction(toolCall.name, toolCall.arguments, toolCall.id));
            } catch (error) {
                actionError = error instanceof Error ? error.message : "工具参数无效";
            }
        }
        if (!actionError && expectedAction && !nativeActions.length && !parsedJson.actions.length) {
            actionError = "本轮必须返回可执行的画布工具指令";
        }
        if (actionError) {
            // 造物同款稳健性：兼容线路的原生 tool calling 首次出错，本轮即降级为
            // structured-json 重试；面板会按渠道把降级记进会话，后续轮次不再先撞墙。
            if (toolMode === "native") {
                toolMode = "structured-json";
                usedJsonFallbackMode = "structured-json";
            }
            // 长稿（分镜/宣传片类）在小上下文线路上容易连续产出非法工具指令：
            // 允许两轮纠错，最终失败时给出可操作建议（换模型/拆小批次），不再裸报协议错误。
            if (protocolErrorCount >= 2) {
                const deepseekLine = /deepseek/i.test(textConfig.model || textConfig.textModel || "");
                throw new Error(
                    `工具指令仍无效，本批操作未执行：${actionError}。${deepseekLine ? "当前文本模型（DeepSeek 线路）在长稿上稳定性不足，建议在 Agent 设置里换用更强的文本模型（如 GPT / Claude / Gemini 系）后重试；" : "建议在 Agent 设置里切换 Chat / Responses 或更换支持 Tool Calling 的文本模型；"}也可以把长稿拆成更小的批次（每次 3–5 个分镜）继续，画布内容已全部保留。`,
                );
            }
            protocolErrorCount += 1;
            protocolError = actionError;
            const feedback = JSON.stringify({
                ok: false,
                code: "invalid_tool_arguments",
                message: actionError + "。本批操作均未执行，未创建节点或提交生成。请按工具定义修正调用；JSON 模式只返回 actions 和 reply，所有工具参数放入 arguments，工具名不得含 Markdown 转义。只修正格式与参数位置，保留完整定稿、已确认总时长和来源引用，不得删减提示词或改用默认时长；不要声称已提交。",
            });
            protocolMessages = [
                ...protocolMessages,
                ...(assistantToolMessage.content || assistantToolMessage.reasoningContent || assistantToolMessage.responseItems?.length || assistantToolMessage.toolCalls?.length ? [assistantToolMessage] : []),
                ...(turn.toolCalls.length
                    ? turn.toolCalls.map((toolCall) => ({ role: "tool" as const, toolCallId: toolCall.id, name: toolCall.name, content: feedback }))
                    : [{ role: "user" as const, content: "工具执行结果（只可依据这些真实结果继续）：\n" + feedback }]),
            ];
            emitCheckpoint();
            step -= 1;
            continue;
        }
        const arrangeRequested = canvasAgentAllowsArrangement(input.userText);
        const requestedActions = nativeActions.length ? nativeActions : parsedJson.actions;
        const allowedNames = new Set(agentTools.map(tool => tool.function.name));
        if (requestedActions.some(action => !allowedNames.has(action.name))) {
            throw new Error("模型返回了本轮未开放的工具，本批操作未执行；画布与已有任务已保留");
        }
        if (!deletionRequested && requestedActions.some(action => action.name === "delete_node" || action.name === "delete_connection")) {
            throw new Error("本轮未要求删除，已保留所有节点与连线；请直接在现有节点继续制作");
        }
        const actions = requestedActions.filter((action) => action.name !== "arrange_nodes" || arrangeRequested);
        const rejectedToolMessages: CanvasAgentProtocolMessage[] = nativeActions.filter((action) => action.name === "arrange_nodes" && !arrangeRequested).map((action) => ({
            role: "tool",
            toolCallId: action.id,
            name: action.name,
            content: JSON.stringify({ ok: false, code: "action_not_requested", message: "用户没有要求整理画布，未执行节点排列" }),
        }));

        if (!actions.length && protocolError) {
            throw new Error("修正后仍未返回可执行的工具指令，本批操作未执行：" + protocolError + "。建议在 Agent 设置里更换更强的文本模型（GPT / Claude / Gemini 系对长稿更稳），或把本轮需求拆成更小的批次；画布内容已保留。");
        }

        if (!actions.length && rejectedToolMessages.length) {
            protocolMessages = [
                ...protocolMessages,
                { role: "assistant", content: turn.content || undefined, ...(turn.reasoningContent !== undefined ? { reasoningContent: turn.reasoningContent } : {}), responseItems: turn.responseItems, toolCalls: nativeActions.map((action) => ({ id: action.id, name: action.name, arguments: action.arguments })) },
                ...rejectedToolMessages,
            ];
            emitCheckpoint();
            continue;
        }

        if (!actions.length) {
            const reply = (parsedJson.parsed ? parsedJson.reply : turn.content).trim();
            if (!hasExecutedActions && !reply && userLikelyRequestedCanvasAction(input.userText)) {
                const unsupported = "当前接口没有返回可执行的画布工具指令。请在 Agent 设置中尝试切换 Chat / Responses，或更换支持 Tool Calling 或稳定 JSON 输出的文本模型。";
                protocolMessages = [...protocolMessages, { role: "assistant" as const, content: unsupported }];
                return { reply: unsupported, state, protocolMessages: persistCanvasAgentProtocolMessages(protocolMessages), contextCheckpoint, jsonFallbackMode: usedJsonFallbackMode };
            }
            const finalReply = reply || "我已经读取当前画布。请告诉我下一步要继续完善哪一部分。";
            protocolMessages = [...protocolMessages, { role: "assistant" as const, content: finalReply, ...(turn.responseItems?.length ? { responseItems: turn.responseItems } : {}) }];
            return { reply: finalReply, state, protocolMessages: persistCanvasAgentProtocolMessages(protocolMessages), contextCheckpoint, jsonFallbackMode: usedJsonFallbackMode };
        }

        expectedAction = false;
        protocolError = undefined;
        input.onEvent?.({ status: "running", label: actions.length === 1 ? canvasAgentActionLabel(actions[0]) : "正在执行 " + actions.length + " 个画布操作" });

        const results = await executeActions(actions, state, input.executeAction, input.signal, input.onEvent);
        hasExecutedActions = true;
        state = results.state;
        lastActionReply = summarizeCanvasAgentToolResults(results.items);

        if (nativeActions.length && toolMode === "native") {
            protocolMessages = [
                ...protocolMessages,
                assistantToolMessage,
                ...results.items.map(({ action, result }) => ({
                    role: "tool" as const,
                    toolCallId: action.id,
                    name: action.name,
                    content: JSON.stringify(result),
                })),
                ...rejectedToolMessages,
            ];
        } else {
            protocolMessages = [
                ...protocolMessages,
                assistantToolMessage,
                {
                    role: "user" as const,
                    content: "工具执行结果（只可依据这些真实结果继续）：\n" + JSON.stringify(results.items.map(({ action, result }) => ({ tool: action.name, id: action.id, result }))),
                },
            ];
        }
        emitCheckpoint();
    }

    const reply = "本轮已达到安全操作步数上限，当前已完成的节点和任务都已保存。你可以让我继续下一步。";
    protocolMessages = [...protocolMessages, { role: "assistant" as const, content: reply }];
    return { reply, state, protocolMessages: persistCanvasAgentProtocolMessages(protocolMessages), contextCheckpoint, jsonFallbackMode: usedJsonFallbackMode };
}

function scopeCanvasAgentTools(tools: CanvasAgentToolDefinition[], userText: string): CanvasAgentToolDefinition[] {
    if (/只读/.test(userText)) return tools.filter(tool => /^(?:get_|query_)/.test(tool.function.name));
    const asksVideo = /视频|成片/.test(userText);
    const asksImage = /图片|图像|分镜图|海报|封面/.test(userText);
    const onlyVideo = asksVideo && /(?:只|仅).{0,12}(?:制作|生成|做).{0,8}(?:[^，。；]*视频)|不要.{0,12}(?:生成|制作|重做).{0,6}(?:图片|分镜图)/.test(userText);
    const onlyImage = asksImage && /(?:只|仅).{0,12}(?:制作|生成|做).{0,8}(?:[^，。；]*(?:图片|分镜图))|不要.{0,12}(?:生成|制作).{0,6}(?:视频|成片)/.test(userText);
    if (!onlyVideo && !onlyImage) return tools;
    const common = new Set([
        "get_canvas_summary",
        "get_selected_nodes",
        "query_canvas_nodes",
        "get_node",
        "get_upstream_nodes",
        "get_downstream_nodes",
        "get_connected_nodes",
        "get_generation_config",
        "get_generation_task",
        "get_media_task_status",
        "set_agent_state",
        "create_connection",
        "update_node",
    ]);
    common.add(onlyVideo ? "generate_video" : "generate_image");
    if (onlyImage && /修改|编辑|改图/.test(userText)) common.add("edit_image");
    return tools.filter((tool) => common.has(tool.function.name));
}

function isEmptyCanvasAgentFollowupError(error: unknown) {
    return error instanceof Error && /文本模型已响应，但没有返回可识别的正文或工具指令/.test(error.message);
}

function summarizeCanvasAgentToolResults(items: Array<{ action: CanvasAgentAction; result: CanvasAgentToolResult }>) {
    const succeeded = items.filter(({ result }) => result.ok);
    const failed = items.filter(({ result }) => !result.ok);
    const actionNames = [...new Set(succeeded.map(({ action }) => canvasAgentActionLabel(action)))];
    const completedText = succeeded.length
        ? `已完成${actionNames.length ? `：${actionNames.join("、")}` : ` ${succeeded.length} 项画布操作`}。`
        : "";
    const failedText = failed.length
        ? `另有 ${failed.length} 项未完成：${failed.map(({ result }) => result.message || result.code || "未知错误").join("；")}。`
        : "";
    return `${completedText}${failedText}`.trim() || "本轮画布操作已经执行，结果已保留。";
}

export function canvasAgentAllowsArrangement(userText: string) {
    return /整理|排列|排序|对齐|布局|排版|重新摆放/.test(userText) && !/(不要|别|无需|不用).{0,8}(整理|排列|排序|对齐|布局|排版|重新摆放)/.test(userText);
}

export async function executeActions(
    actions: CanvasAgentAction[],
    initialState: CanvasAgentState,
    executeAction: (action: CanvasAgentAction) => Promise<CanvasAgentToolResult>,
    signal?: AbortSignal,
    onEvent?: (event: CanvasAgentRuntimeEvent) => void,
) {
    let state = initialState;
    const executeOne = async (action: CanvasAgentAction) => {
        throwIfAborted(signal);
        onEvent?.({ status: "running", label: canvasAgentActionLabel(action) });
        try {
            const result = await executeAction(action);
            if (action.name === "set_agent_state" && result.ok) state = applyAgentState(state, action.arguments);
            else state = applyTaskResult(state, result);
            return { action, result };
        } catch (error) {
            return {
                action,
                result: {
                    ok: false,
                    code: "tool_execution_failed",
                    message: error instanceof Error ? error.message : "工具执行失败",
                } satisfies CanvasAgentToolResult,
            };
        }
    };

    const items = actions.every(isCanvasAgentMediaAction)
        ? await Promise.all(actions.map(executeOne))
        : await actions.reduce<Promise<Array<{ action: CanvasAgentAction; result: CanvasAgentToolResult }>>>(
            async (pending, action) => [...(await pending), await executeOne(action)],
            Promise.resolve([]),
        );
    return { items, state };
}

function buildUserContent(text: string, references: CanvasAssistantReference[], modelName: string): CanvasAgentContent {
    const referenceText = references.length
        ? "\n\n本次输入中的节点占位与真实节点一一对应，请按占位分别理解和操作：" + references.map((item) => `${item.label || item.title} → 节点 ${item.id}（${item.title}）`).join("；")
        : "";
    const imageReferences = references.filter((item) => item.dataUrl && (/^data:image\//.test(item.dataUrl) || /^https?:\/\//.test(item.dataUrl)));
    const imageOrderText = imageReferences.length ? "\n随消息附带的图片顺序：" + imageReferences.map((item, index) => `第 ${index + 1} 张 = ${item.label || item.title}`).join("；") : "";
    const images = supportsCanvasAgentImageInput(modelName)
        ? imageReferences.map((item) => ({ type: "image_url" as const, image_url: { url: item.dataUrl as string } }))
        : [];
    if (!images.length) return text + referenceText;
    return [{ type: "text", text: text + referenceText + imageOrderText }, ...images];
}

function supportsCanvasAgentImageInput(modelName: string) {
    const model = modelName.trim().toLowerCase();
    return model === "mimo-v2.5" || /gpt-(?:4o|4\.1|5)|(?:^|[\\/_-])o[134](?:[\\/_-]|$)|gemini|claude|qwen.*(?:vl|vision)|glm-4v|pixtral|llava|internvl|deepseek.*vl|vision/.test(model);
}

function persistCanvasAgentProtocolMessages(messages: CanvasAgentProtocolMessage[]) {
    return messages.map((message): CanvasAgentProtocolMessage => {
        if ((message.role === "user" || message.role === "system") && Array.isArray(message.content)) {
            const text = message.content
                .filter((item) => item.type === "text")
                .map((item) => item.text)
                .join("\n")
                .trim();
            return { role: message.role, content: text || "本轮包含图片引用；媒体内容未写入会话记录。" };
        }
        return message;
    });
}

function applyAgentState(state: CanvasAgentState, patch: Record<string, unknown>): CanvasAgentState {
    return {
        ...state,
        phase: typeof patch.phase === "string" ? (patch.phase as CanvasAgentState["phase"]) : state.phase,
        brief: typeof patch.brief === "string" ? patch.brief : state.brief,
        targetDurationSeconds: typeof patch.targetDurationSeconds === "number" ? patch.targetDurationSeconds : state.targetDurationSeconds,
        approvedPlan: typeof patch.approvedPlan === "string" ? patch.approvedPlan : state.approvedPlan,
        approvedNodeIds: Array.isArray(patch.approvedNodeIds) ? (patch.approvedNodeIds as string[]) : state.approvedNodeIds,
        referenceNodeIds: Array.isArray(patch.referenceNodeIds) ? (patch.referenceNodeIds as string[]) : state.referenceNodeIds,
    };
}

function applyTaskResult(state: CanvasAgentState, result: CanvasAgentToolResult): CanvasAgentState {
    const taskId = typeof result.taskId === "string" ? result.taskId : "";
    if (!taskId) return state;
    const completed = result.status === "success" || result.status === "completed";
    const terminal = completed || result.status === "error" || result.status === "failed";
    return {
        ...state,
        pendingTaskIds: terminal ? state.pendingTaskIds.filter((id) => id !== taskId) : [...new Set([...state.pendingTaskIds, taskId])],
        completedTaskIds: completed ? [...new Set([...state.completedTaskIds, taskId])] : state.completedTaskIds,
    };
}

function throwIfAborted(signal?: AbortSignal) {
    if (!signal?.aborted) return;
    const error = new Error("Agent 已停止");
    error.name = "AbortError";
    throw error;
}
