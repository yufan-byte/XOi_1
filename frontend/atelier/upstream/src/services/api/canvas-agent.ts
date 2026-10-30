import { mimoTextModels } from "@/lib/mimo-tts";
import { dataUrlToGeminiInlineData, geminiActionUrl, geminiDirectHeaders, geminiErrorMessage, isGeminiConfig } from "@/lib/gemini";
import { aiApiUrl, aiHeaders, refreshRemoteUser } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { channelProtocolForConfig, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import type { CanvasAgentProtocolMessage, CanvasAgentToolCall, CanvasAgentToolMode } from "@/app/(user)/canvas/types";
import type { CanvasAgentToolDefinition } from "@/app/(user)/canvas/agent/canvas-agent-tools";
import { calibrateCanvasAgentTokenEstimate } from "@/app/(user)/canvas/agent/canvas-agent-memory";
import { parseDeepSeekToolCalls } from "./deepseek-tool-calls";
import { parseChatCompletionStream } from "./chat-completion-stream";

export type CanvasAgentModelTurn = {
    content: string;
    reasoningContent?: string;
    responseItems?: unknown[];
    toolCalls: CanvasAgentToolCall[];
    toolError?: string;
    toolMode: CanvasAgentToolMode;
};

export const CANVAS_AGENT_JSON_FALLBACK_SIGNAL = "__CANVAS_AGENT_JSON_FALLBACK__";
const MISSING_TOOL_NAME_ERROR = "工具调用缺少名称";
// 画布 Agent 单轮输出上限。不传时 DeepSeek 等上游默认只给 4K 输出，
// JSON 工具模式 / 思考模型（思维链计入输出）一轮就会撞上限被截断（finish_reason=length）。
const CANVAS_AGENT_MAX_OUTPUT_TOKENS = 8192;
// 当前 DeepSeek 兼容线路的上下文按 16K 校验，而且 max_tokens 也会占用上下文预算。
// 固定预留 8192 会让一个约 11K 的正常画布请求直接变成 503，即使模型实际只需输出几百 token。
// Agent 每一步最多执行少量工具，2K 足够；复杂任务会自然进入下一步，整体更稳定也更省钱。
const DEEPSEEK_AGENT_MAX_OUTPUT_TOKENS = 2048;
/** 思考型/推理线路模型走 SSE：思维链边生成边传输，思考多久都不会撞上整包超时。 */
const THINKING_STREAM_MODELS = /deepseek|glm-|mimo/i;
/** 单次模型请求的硬超时：上游卡住时不能无限等，否则界面永远停在"正在根据画布结果继续"。
 * 300 秒给思考型模型（deepseek 等）留足思维链预算：思维链 + 长结构化输出经常超过 150 秒。 */
const CANVAS_AGENT_REQUEST_TIMEOUT_MS = 300_000;
/** 非流式兜底线路（个别渠道不支持 stream）的整包超时：上游慢线路实测 8 分钟仍能成功返回，
 * 掐太紧等于"已计费却丢结果"。放宽到 10 分钟，与流式活动超时双轨并行。 */
const CANVAS_AGENT_NONSTREAM_TIMEOUT_MS = 600_000;

// 部分上游对 max_tokens 上限校验严格（超限直接报错而不是截断），此时降级为不传再试。
function isMaxTokensParamError(message: string) {
    return /max[_ ]?(?:output_)?tokens/i.test(message) && /too large|exceed|invalid|must be|at most|maximum|unknown|unrecognized|unexpected|不支持|超出|上限/i.test(message);
}

// 个别渠道不认 stream 参数；明确拒绝时降级为非流式重试一次（走宽超时）。
function isStreamParamError(message: string) {
    return /\bstream\b/i.test(message) && /not support|unsupported|not allowed|invalid|unknown|unrecognized|unexpected|must be|不支持|不允许|无效/i.test(message);
}

export function canvasAgentMaxOutputTokens(
    config: AiConfig,
    systemPrompt: string,
    messages: CanvasAgentProtocolMessage[],
    tools: CanvasAgentToolDefinition[],
) {
    if (!/deepseek/i.test(config.model)) return CANVAS_AGENT_MAX_OUTPUT_TOKENS;
    // 输入在 runtime 独立压缩到 13K 以内，固定保留 2K 给可执行指令。
    // 不能再用偏保守的输入估算二次挤压到 768，否则连两个分镜工具都写不完。
    return DEEPSEEK_AGENT_MAX_OUTPUT_TOKENS;
}

type RequestCanvasAgentTurnInput = {
    config: AiConfig;
    systemPrompt: string;
    messages: CanvasAgentProtocolMessage[];
    tools: CanvasAgentToolDefinition[];
    toolMode: CanvasAgentToolMode;
    signal?: AbortSignal;
    /** 思考过程实时上报：把 reasoning 增量接到 UI 上滚动展示。 */
    onDelta?: (delta: CanvasAgentStreamDelta) => void;
};

type AiErrorPayload = {
    code?: number | string;
    msg?: string;
    message?: string;
    error?: { code?: string; type?: string; message?: string };
};

type ChatCompletionPayload = AiErrorPayload & {
    usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
    choices?: Array<{
        finish_reason?: string | null;
        message?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: Array<{
                id?: string;
                function?: { name?: string; arguments?: unknown };
            }>;
        };
    }>;
    data?: {
        usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
        choices?: Array<{
            finish_reason?: string | null;
            message?: {
                content?: string | null;
                reasoning_content?: string | null;
                tool_calls?: Array<{
                    id?: string;
                    function?: { name?: string; arguments?: unknown };
                }>;
            };
        }>;
    };
};

type ResponsesOutputItem = Record<string, unknown> & {
    type?: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: unknown;
    content?: Array<{ type?: string; text?: string }>;
};

type ResponsesResult = {
    id?: string;
    status?: string;
    incomplete_details?: { reason?: string } | null;
    output_text?: string;
    output?: ResponsesOutputItem[];
    usage?: { input_tokens?: number };
};

type ResponsesPayload = AiErrorPayload & ResponsesResult & { data?: ResponsesResult };

class CanvasAgentRequestError extends Error {
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "CanvasAgentRequestError";
        this.status = status;
        this.code = code;
    }
}

type CanvasAgentAiConfig = AiConfig & { textReasoningEnabled?: boolean };

function applyCanvasAgentReasoning(body: Record<string, unknown>, config: CanvasAgentAiConfig, mode: "chat" | "responses" | "gemini") {
    // DeepSeek 的缺省模式可能仍会思考；仅省略 reasoning_effort 并不能关闭它。
    // 画布执行器需要正文/工具指令，不能让隐藏思考吃光有限的单步输出预算。
    if (mode === "chat" && /deepseek/i.test(config.model)) {
        body.thinking = { type: "disabled" };
        // 造物 V4.1 的参数目录用 reasoning_effort（默认 high），thinking 字段可能被忽略。
        if (/deepseek-v4\.1(?:-|$)/i.test(config.model)) body.reasoning_effort = "none";
        return;
    }
    if (!config.textReasoningEnabled) return;
    if (mode === "responses") body.reasoning = { effort: "high" };
    else if (mode === "gemini") body.generationConfig = { ...((body.generationConfig as Record<string, unknown> | undefined) || {}), thinkingConfig: config.model.toLowerCase().includes("2.5") ? { thinkingBudget: -1 } : { thinkingLevel: "high" } };
    // DeepSeek 思考模型默认即思考；reasoning_effort=high 会被上游映射成超大思维链预算，
    // 连同正文一起吃光 max_tokens（实测 8192 全部变成 reasoning_tokens，正文 0 字被截）。
    else if (/deepseek/i.test(config.model)) return;
    else if (channelProtocolForConfig(config) === "mimo") body.thinking = { type: "enabled" };
    else body.reasoning_effort = "high";
}

function isReasoningParamError(message: string) {
    return /reasoning[_ ]?effort|thinking[_ ]?(?:type|budget|level)/i.test(message) && /too large|exceed|invalid|must be|at most|maximum|unknown|unrecognized|unexpected|not support|unsupported|不支持|超出|上限/i.test(message);
}

/**
 * 文本接口自动适配（2026-10-27）：不再让用户手选 Chat / Responses。
 * 这是托管的 Web 服务，用户只该选模型。默认走兼容性最好的 Chat Completions，
 * 只有上游明确拒绝（要求 Responses / 找不到 chat 端点）时才自动切过去，
 * 并按「渠道+模型」记住结果，后续轮次不再重复试错。
 */
const preferredApiMode = new Map<string, "chat" | "responses">();
function apiModeKey(config: AiConfig) {
    return `${config.apiMode}:${config.textChannelId || config.activeChannelId || config.baseUrl}:${config.textModel || config.model}`;
}
function apiModeFallback(error: unknown, mode: "chat" | "responses"): "chat" | "responses" | undefined {
    if (!(error instanceof CanvasAgentRequestError)) return undefined;
    if (![400, 404, 405, 415, 422, 501].includes(error.status)) return undefined;
    const detail = `${error.code || ""} ${error.message}`.toLowerCase();
    const rejected = /not support|unsupported|not found|no such|不支持|未实现|无法使用|请使用|only (?:available|supported)|must use/i.test(detail);
    if (mode === "chat" && rejected && /responses/.test(detail)) return "responses";
    if (mode === "responses" && rejected) return "chat";
    return undefined;
}

/**
 * 上游供应商闪断（EOF / do request failed / 网关 5xx）：请求在网关侧已失败、
 * 没有产生任何计费内容，自动重试一次是安全的。区别于「成功但截断」——那种
 * 已可能计费，绝不能悄悄重发。
 */
function isUpstreamFlakeError(error: unknown): boolean {
    if (!(error instanceof CanvasAgentRequestError) || error.status < 500) return false;
    if (error.code === "empty_model_output") return false;
    return /do request failed|upstream error|eof|bad gateway|service unavailable|gateway timeout|connection reset|context deadline|上游|过载|负载已饱和/i.test(`${error.code || ""} ${error.message}`);
}

function friendlyUpstreamFlakeMessage(error: CanvasAgentRequestError): string {
    return `上游模型服务连接闪断（${error.status}，网关到供应商的请求被中断），本步画布操作未执行、未产生内容。已自动重试一次仍失败；请直接重发这条消息，连续出现就换一个文本模型或稍后再试。原始错误：${error.message.slice(0, 120)}`;
}

export async function requestCanvasAgentTurn(input: RequestCanvasAgentTurnInput): Promise<CanvasAgentModelTurn> {
    const requestConfig = {
        ...input.config,
        model: input.config.textModel || input.config.model,
        activeChannelId: input.config.textChannelId || input.config.activeChannelId,
        textChannelId: input.config.textChannelId,
    };
    let messages = input.messages;
    let toolMode = input.toolMode;
    let requestError: unknown;
    let upstreamFlakeRetried = false;
    const configKey = apiModeKey(requestConfig);
    let apiMode: "chat" | "responses" = preferredApiMode.get(configKey) || "chat";

    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const tools = toolMode === "native" ? input.tools : [];
            const jsonTools = toolMode === "native" ? [] : input.tools;
            const systemPrompt = canvasAgentSystemPrompt(requestConfig, input.systemPrompt, jsonTools, toolMode === "native");
            const jsonSchema = toolMode === "structured-json" && jsonTools.length ? canvasAgentJsonSchema(jsonTools) : undefined;
            const message = await requestCompletion({ ...requestConfig, apiMode }, systemPrompt, messages, tools, jsonSchema, input.signal, input.onDelta);
            preferredApiMode.set(configKey, apiMode);
            return { ...message, toolMode };
        } catch (error) {
            requestError = error;
            if (isCanvasAgentContextLimitError(error)) throw error;
            // 上游闪断（EOF / do request failed）：网关侧失败、无计费内容，静默重试一次。
            if (isUpstreamFlakeError(error)) {
                if (!upstreamFlakeRetried) {
                    upstreamFlakeRetried = true;
                    await new Promise(resolve => setTimeout(resolve, 900));
                    continue;
                }
                if (error instanceof CanvasAgentRequestError) throw new CanvasAgentRequestError(friendlyUpstreamFlakeMessage(error), error.status, error.code);
            }
            const switched = apiModeFallback(error, apiMode);
            if (switched && switched !== apiMode) {
                apiMode = switched;
                preferredApiMode.set(configKey, switched);
                continue;
            }
            if (hasImageContent(messages) && isImageCompatibilityError(error)) {
                messages = stripImageContent(messages);
                continue;
            }
            if (toolMode === "native" && isToolCompatibilityError(error, "tools")) {
                toolMode = "structured-json";
                continue;
            }
            if (toolMode === "structured-json" && isToolCompatibilityError(error, "structured-json")) {
                toolMode = "prompt-json";
                continue;
            }
            throw error;
        }
    }
    throw requestError;
}

export function canvasAgentSystemPrompt(config: AiConfig, prompt: string, jsonTools: CanvasAgentToolDefinition[] = [], nativeTools = false) {
    const rawConfigured = (config.systemPrompts.text || config.systemPrompt).trim();
    // 用户配置里可能带入整份长篇通用提示；DeepSeek 兼容线路按输入+输出共 16K
    // 校验，保留首尾约束即可，避免长提示把工具调用顶出上下文。
    const configured = /deepseek/i.test(config.model) && rawConfigured.length > 1_400
        ? `${rawConfigured.slice(0, 1_000)}\n…（通用提示已为本轮压缩）…\n${rawConfigured.slice(-400)}`
        : rawConfigured;
    if (nativeTools) prompt += "\n\n【原生工具回退信号】\n需要执行任何画布操作时必须返回原生工具调用；若本轮无法返回任何原生工具调用，只输出 " + CANVAS_AGENT_JSON_FALLBACK_SIGNAL + "，不得附加文字、Markdown 或声称已完成。仅咨询、解释、分析且无需执行画布操作时正常文字回答，禁止输出此信号。";
    // 原生工具定义会单独放在请求的 tools 字段；这里再把 2 万字通用提示完整拼进去，
    // DeepSeek 会把输入误判为上下文超限并返回 503。保留首尾约束，确保本轮意图和
    // 画布执行协议仍在，具体工具 schema 交给 API 的 tools 字段。
    let result = configured ? configured + "\n\n" + prompt : prompt;
    if (/deepseek/i.test(config.model) && result.length > 12_000) {
        result = `${result.slice(0, 9_000)}\n…（画布提示已为本轮压缩）…\n${result.slice(-3_000)}`;
    }
    if (jsonTools.length) result += "\n\n【JSON 工具定义】\n当前画布执行器会解析并执行回复中的 actions。需要操作画布时必须直接返回合法的 actions JSON；接口没有原生 Tool Calling 不代表没有画布执行能力，不得因此拒绝执行或要求用户手动提交。所有工具参数都放在对应 action 的 arguments 中。严禁输出 <tool_use>、<function=…>、<parameter=…> 之类 XML 标签——执行器不识别 XML，只识别 reply + actions（每项含 tool 与 arguments 对象）形式的 JSON，可放在一个 json 代码块中。\n" + JSON.stringify(jsonTools.map(({ function: tool }) => tool), /deepseek/i.test(config.model) ? (key, value) => key === "description" && typeof value === "string" ? value.slice(0, 80) : value : undefined);
    return result;
}

export async function requestCanvasAgentCheckpoint(input: {
    config: AiConfig;
    previousCheckpoint?: string;
    messages: unknown;
    signal?: AbortSignal;
}) {
    const turn = await requestCanvasAgentTurn({
        config: input.config,
        systemPrompt: "生成画布长期对话检查点：仅保留目标、型号/时长/预算等硬要求、关键创作决定、重要节点ID的职责、待办。旧错误已被用户说明修好时不继续阻止执行；节点正文与任务状态以之后真实画布为准。不复述原稿、错误日志、模型思考和Base64。直接输出中文要点，控制在1000汉字以内。",
        messages: [{
            role: "user",
            content: `【旧检查点】\n${input.previousCheckpoint || "无"}\n\n【本次归档的完整旧轮次】\n${JSON.stringify(input.messages)}`,
        }],
        tools: [],
        toolMode: "prompt-json",
        signal: input.signal,
    });
    return turn.content.trim();
}

async function requestCompletion(config: AiConfig, systemPrompt: string, messages: CanvasAgentProtocolMessage[], tools: CanvasAgentToolDefinition[], jsonSchema?: Record<string, unknown>, signal?: AbortSignal, onDelta?: (delta: CanvasAgentStreamDelta) => void) {
    if (config.apiMode === "responses") return requestResponsesCompletion(config, systemPrompt, messages, tools, jsonSchema, signal);
    if (isGeminiConfig(config)) return requestGeminiCompletion(config, systemPrompt, messages, tools, jsonSchema, signal);
    const baseBody: Record<string, unknown> = {
        model: config.model,
        messages: [{ role: "system", content: systemPrompt }, ...messages.map(message => toRequestMessage(message, !tools.length))],
        // 造物推理线路推荐 SSE，避免非流式聚合丢掉 choices 或思考期间连接被中断。
        // 流式必须覆盖 glm/mimo 思考系：实测 glm-5.3-flash 非流式整包要 8 分钟，
        // 前端硬超时会在模型仍在工作时掐断连接（上游照常计费，结果全丢）。
        stream: THINKING_STREAM_MODELS.test(config.model),
    };
    if (baseBody.stream) baseBody.stream_options = { include_usage: true };
    if (tools.length) {
        baseBody.tools = tools;
        baseBody.tool_choice = "auto";
    }
    // 与造物画布一致：只开 json_object，不强制 json_schema——schema 约束下模型容易把输出撑到上限
    if (jsonSchema) baseBody.response_format = { type: "json_object" };

    // 仅在明确的参数拒绝（非成功响应）时兼容重试。成功但截断的响应已经可能计费，
    // 不能悄悄再调用两次；保留可解析的内容/工具，空输出直接停止本轮。
    let applyReasoning = true;
    let applyMaxTokens = true;
    let applyStream = baseBody.stream === true;
    const maxOutputTokens = canvasAgentMaxOutputTokens(config, systemPrompt, messages, tools);
    for (let attempt = 0; attempt < 4; attempt++) {
        const body: Record<string, unknown> = { ...baseBody };
        if (applyReasoning) applyCanvasAgentReasoning(body, config, "chat");
        if (applyMaxTokens) body.max_tokens = maxOutputTokens;
        if (!applyStream) { delete body.stream; delete body.stream_options; }
        // 合并调用方 signal 与硬超时：上游卡死时一定进入可重试/可报错状态。
        // 流式：每收到数据就重置计时，思考模型边想边吐不算卡死，"完全无数据" 300 秒才判死；
        // 非流式兜底：整包等待放宽到 10 分钟，避免"上游仍在工作、已计费却被掐断丢结果"。
        const requestTimeoutMs = applyStream ? CANVAS_AGENT_REQUEST_TIMEOUT_MS : CANVAS_AGENT_NONSTREAM_TIMEOUT_MS;
        const timeoutController = new AbortController();
        let timeoutTimer = setTimeout(() => timeoutController.abort(), requestTimeoutMs);
        const resetActivityTimeout = () => {
            clearTimeout(timeoutTimer);
            timeoutTimer = setTimeout(() => timeoutController.abort(), CANVAS_AGENT_REQUEST_TIMEOUT_MS);
        };
        const mergedSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
        // billingGate 按 init.signal 识别画布工作流共享预算；AbortSignal.any 会生成新对象导致
        // 查找落空、Agent 每一步都单独弹费用确认。挂回原 signal 引用让整轮复用同一张预算单。
        (mergedSignal as AbortSignal & { __xoiWorkflowSignal?: AbortSignal }).__xoiWorkflowSignal = signal ?? undefined;
        const requestChatCompletion = () => fetch(aiApiUrl(config, "/chat/completions"), {
            method: "POST",
            headers: aiHeaders(config, "application/json"),
            body: JSON.stringify(body),
            signal: mergedSignal,
        });
        let response: Response;
        let payloadResponse: Awaited<ReturnType<typeof readResponsePayload<ChatCompletionPayload>>>;
        try {
            response = await requestChatCompletion();
            // 超时必须覆盖响应体；SSE 的 headers 往往立即到达，正文仍可能卡住。
            payloadResponse = await readResponsePayload<ChatCompletionPayload>(response, {
                onDelta,
                onActivity: onDelta ? resetActivityTimeout : undefined,
            });
        } catch (error) {
            if (!signal?.aborted && timeoutController.signal.aborted) {
                throw new CanvasAgentRequestError(
                    applyStream
                        ? "文本模型 300 秒内没有任何新数据，本轮已停止；费用待核对，未自动重试。通常是上游排队或卡死，直接重发即可。"
                        : "文本模型 600 秒内未完成整包响应，本轮已停止；费用待核对，未自动重试。上游慢线路偶尔需要更久，建议重发或换流式友好的文本模型。",
                    504,
                );
            }
            // 浏览器 fetch 抛 TypeError("Failed to fetch" / Safari "Load failed") 时，
            // 用户完全看不出发生了什么。翻译成可操作的话。
            if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
                throw new CanvasAgentRequestError("和模型服务的连接中断了（网络层断开，不是画布操作失败）。已生成的节点和已提交的任务都保留；直接再发一次即可，连续出现就换一个文本模型重试。", 0);
            }
            throw error;
        } finally {
            clearTimeout(timeoutTimer);
        }
        if (!response.ok && applyMaxTokens && isMaxTokensParamError(payloadResponse.rawText)) {
            applyMaxTokens = false;
            continue;
        }
        if (!response.ok && applyStream && isStreamParamError(payloadResponse.rawText)) {
            applyStream = false;
            continue;
        }
        if (!response.ok && applyReasoning && isReasoningParamError(payloadResponse.rawText)) {
            applyReasoning = false;
            continue;
        }
        const { payload, rawText } = payloadResponse;
        const choice = payload.choices?.[0] || payload.data?.choices?.[0];
        const message = choice?.message;
        if (!response.ok || payload.error || (typeof payload.code === "number" && payload.code !== 0 && payload.code !== 200) || (typeof payload.code === "string" && payload.code !== "0" && payload.code !== "200" && !message)) {
            throw new CanvasAgentRequestError(readError(payload, response.status, rawText), response.status, readErrorCode(payload));
        }
        if (!message) {
            const usage = payload.usage || payload.data?.usage;
            console.warn("[canvas-agent] 无法识别模型响应", { model: config.model, type: response.headers.get("content-type"), keys: Object.keys(payload), usage, requestId: response.headers.get("x-request-id") || response.headers.get("x-oneapi-request-id") });
            refreshRemoteUser(config);
            // HTTP 200 + usage 已可能计费，不能伪装成上下文错误让 runtime 再花钱摘要和重试。
            throw new CanvasAgentRequestError("文本模型已响应，但没有返回可识别的正文或工具指令；上游返回空结果，费用待核对，本轮未自动重试", response.status, "empty_model_output");
        }
        if (!message.tool_calls?.length && /deepseek/i.test(config.model) && typeof message.content === "string") {
            const parsed = parseDeepSeekToolCalls(message.content, new Set(tools.map(tool => tool.function.name)));
            if (parsed) { message.content = parsed.content; message.tool_calls = parsed.toolCalls; }
        }
        console.info("[canvas-agent] 模型回包", { model: config.model, finish: choice?.finish_reason, usage: payload.usage || payload.data?.usage, contentLength: message.content?.length || 0, reasoningLength: message.reasoning_content?.length || 0, toolCalls: message.tool_calls?.length || 0 });
        if (choice?.finish_reason && /^(?:length|max_tokens)$/i.test(choice.finish_reason)) {
            const usage = payload.usage || payload.data?.usage;
            console.warn("[canvas-agent] 输出被截断，未自动重复调用", { model: config.model, finish: choice.finish_reason, outputTokens: usage?.completion_tokens, reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens, contentLength: message.content?.length || 0, toolCalls: message.tool_calls?.length || 0 });
            if (!message.content?.trim() && !message.tool_calls?.length) {
                refreshRemoteUser(config);
                throw new CanvasAgentRequestError("文本模型达到输出上限但没有返回正文或画布指令。本轮已停止，未自动重复调用；请缩小本步任务后继续。", response.status);
            }
            if (tools.length && !message.tool_calls?.length && !/^\s*\{[\s\S]*\}\s*$/.test(message.content || "")) {
                refreshRemoteUser(config);
                throw new CanvasAgentRequestError("文本模型在输出画布指令前达到长度上限，本批操作未执行。已保留现有节点，未自动重试。", response.status);
            }
        }
        if (choice?.finish_reason && /^(?:content_filter)$/i.test(choice.finish_reason)) {
            throw new CanvasAgentRequestError("文本模型输出未完成：内容被上游安全审核拦截（content_filter）", response.status);
        }
        if (!message.content?.trim() && !message.tool_calls?.length) {
            refreshRemoteUser(config);
            const usage = payload.usage || payload.data?.usage;
            const reasoningOnly = (usage?.completion_tokens_details?.reasoning_tokens || 0) > 0 || (message.reasoning_content?.length || 0) > 0;
            throw new CanvasAgentRequestError(
                reasoningOnly
                    ? "文本模型把这一轮的输出预算全用在思考上了，正文 0 字（思考模型常见）。已保留现有节点，未自动重试；请换 GLM 5.3 Flash 这类不思考的文本模型重发。"
                    : "文本模型已响应，但没有返回可识别的正文或工具指令；上游仅返回空消息，本轮未自动重试",
                response.status,
                "empty_model_output",
            );
        }
        const normalizedModel = config.model.trim().toLowerCase();
        const preservesReasoningContent = normalizedModel.startsWith("glm-") || mimoTextModels.some((model) => model === normalizedModel);
        const reasoningContent = preservesReasoningContent && typeof message.reasoning_content === "string" ? message.reasoning_content : undefined;

        const inputTokens = payload.usage?.prompt_tokens || payload.data?.usage?.prompt_tokens;
        calibrateCanvasAgentTokenEstimate(canvasAgentTokenCalibrationKey(config), { systemPrompt, messages, tools }, inputTokens);
        refreshRemoteUser(config);
        let toolError: string | undefined;
        const toolCalls = (message.tool_calls || []).flatMap((toolCall, index) => {
            const name = toolCall.function?.name?.trim();
            if (!name) {
                toolError = MISSING_TOOL_NAME_ERROR;
                return [];
            }
            return [
                {
                    id: toolCall.id || "tool-call-" + index,
                    name,
                    ...parseToolArguments(toolCall.function?.arguments),
                },
            ];
        });
        return {
            content: typeof message.content === "string" ? message.content : "",
            ...(reasoningContent !== undefined ? { reasoningContent } : {}),
            ...(toolError ? { toolError } : {}),
            toolCalls,
        };
    }
    throw new CanvasAgentRequestError("文本模型请求失败：重试次数耗尽，请稍后重试", 500);
}

async function requestResponsesCompletion(config: AiConfig, systemPrompt: string, messages: CanvasAgentProtocolMessage[], tools: CanvasAgentToolDefinition[], jsonSchema?: Record<string, unknown>, signal?: AbortSignal) {
    const body: Record<string, unknown> = {
        model: config.model,
        instructions: systemPrompt,
        input: messages.flatMap(toResponsesInput),
        store: false,
        include: ["reasoning.encrypted_content"],
    };
    if (tools.length) {
        body.tools = tools.map((tool) => ({ type: "function", ...tool.function }));
        body.tool_choice = "auto";
    }
    if (jsonSchema) body.text = { format: { type: "json_schema", name: "canvas_agent_actions", schema: jsonSchema } };
    applyCanvasAgentReasoning(body, config, "responses");
    body.max_output_tokens = CANVAS_AGENT_MAX_OUTPUT_TOKENS;

    const requestResponses = () => fetch(aiApiUrl(config, "/responses"), {
        method: "POST",
        headers: aiHeaders(config, "application/json"),
        body: JSON.stringify(body),
        signal,
    });
    let response = await requestResponses();
    let payloadResponse = await readResponsePayload<ResponsesPayload>(response);
    if (!response.ok && isMaxTokensParamError(payloadResponse.rawText)) {
        delete body.max_output_tokens;
        response = await requestResponses();
        payloadResponse = await readResponsePayload<ResponsesPayload>(response);
    }
    const { payload, rawText } = payloadResponse;
    const result = payload.output ? payload : payload.data;
    if (!response.ok || (typeof payload.code === "number" && payload.code !== 0) || (typeof payload.code === "string" && payload.code !== "0" && !result)) {
        throw new CanvasAgentRequestError(readError(payload, response.status, rawText), response.status, readErrorCode(payload));
    }
    if (!result) throw new CanvasAgentRequestError(readError(payload, response.status) || "文本模型没有返回内容", response.status);
    const responseStatus = result.status?.toLowerCase();
    const incompleteReason = result.incomplete_details?.reason;
    if (incompleteReason === "max_output_tokens" || (responseStatus === "incomplete" && incompleteReason)) {
        throw new CanvasAgentRequestError("文本模型本轮输出过长，达到模型输出上限被截断。可让模型减少单轮操作、精简输出内容，或在画布设置里更换输出上限更高的文本模型", response.status);
    }
    if (incompleteReason || (responseStatus && ["failed", "cancelled", "in_progress", "queued"].includes(responseStatus))) {
        throw new CanvasAgentRequestError("文本模型输出未完成：" + (responseStatus || incompleteReason) + (responseStatus && incompleteReason ? "（" + incompleteReason + "）" : ""), response.status);
    }
    const output = result.output || [];
    const toolCalls: CanvasAgentToolCall[] = [];
    let toolError: string | undefined;
    const responseItems = output.flatMap((item, index) => {
        if (item.type !== "function_call") return [item];
        const name = typeof item.name === "string" ? item.name.trim() : "";
        if (!name) {
            toolError = MISSING_TOOL_NAME_ERROR;
            return [];
        }
        const parsedArguments = parseToolArguments(item.arguments);
        toolCalls.push({ id: item.call_id || item.id || `response-tool-${index}`, name, ...parsedArguments });
        return [parsedArguments.argumentsError || typeof item.arguments !== "string"
            ? { ...item, arguments: JSON.stringify(parsedArguments.arguments) }
            : item];
    });
    const inputTokens = result.usage?.input_tokens;
    calibrateCanvasAgentTokenEstimate(canvasAgentTokenCalibrationKey(config), { systemPrompt, messages, tools }, inputTokens);
    refreshRemoteUser(config);
    return {
        content: typeof result.output_text === "string" ? result.output_text : output.flatMap((item) => item.type === "message" ? item.content || [] : []).map((item) => item.type === "output_text" && typeof item.text === "string" ? item.text : "").join(""),
        responseItems,
        toolCalls,
        ...(toolError ? { toolError } : {}),
    };
}

async function requestGeminiCompletion(config: AiConfig, systemPrompt: string, messages: CanvasAgentProtocolMessage[], tools: CanvasAgentToolDefinition[], jsonSchema?: Record<string, unknown>, signal?: AbortSignal) {
    const contents = await Promise.all(messages.filter((message) => message.role !== "system").map(async (message) => {
        if (message.role === "assistant") {
            return {
                role: "model",
                parts: [
                    ...(message.content ? [{ text: message.content }] : []),
                    ...(message.toolCalls || []).map((call) => ({ functionCall: { name: call.name, args: call.arguments } })),
                ],
            };
        }
        if (message.role === "tool") {
            return { role: "user", parts: [{ functionResponse: { name: message.name, response: parseGeminiToolResponse(message.content) } }] };
        }
        const parts = await Promise.all((typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content).map(async (part) => {
            if (part.type === "text") return { text: part.text };
            return dataUrlToGeminiInlineData(await imageToDataUrl({ dataUrl: part.image_url.url, url: part.image_url.url }));
        }));
        return { role: "user", parts };
    }));
    const extraSystemParts = messages.flatMap((message) => message.role !== "system" ? [] : typeof message.content === "string" ? [{ text: message.content }] : message.content.flatMap((part) => part.type === "text" ? [{ text: part.text }] : []));
    const body: Record<string, unknown> = {
        model: config.model,
        stream: false,
        systemInstruction: { parts: [{ text: systemPrompt }, ...extraSystemParts] },
        contents,
        ...(tools.length ? { tools: [{ functionDeclarations: tools.map((tool) => tool.function) }] } : {}),
        ...(jsonSchema ? { generationConfig: { responseFormat: { text: { mimeType: "application/json", schema: jsonSchema } } } } : {}),
    };
    applyCanvasAgentReasoning(body, config, "gemini");
    const generationConfig = (body.generationConfig as Record<string, unknown> | undefined) || {};
    generationConfig.maxOutputTokens = CANVAS_AGENT_MAX_OUTPUT_TOKENS;
    body.generationConfig = generationConfig;
    const proxy = Boolean(aiApiUrl(config, "/chat/completions").startsWith("/api/"));
    const channel = localChannelForActiveModel(config);
    const { model: _model, stream: _stream, ...nativeBody } = body;
    const requestGemini = () => fetch(proxy ? aiApiUrl(config, "/chat/completions") : geminiActionUrl(channel?.baseUrl || config.baseUrl, config.model, "generateContent"), {
        method: "POST",
        headers: proxy ? aiHeaders(config, "application/json") : geminiDirectHeaders(config),
        body: JSON.stringify(proxy ? body : nativeBody),
        signal,
    });
    let response = await requestGemini();
    let payloadResponse = await readResponsePayload<Record<string, unknown>>(response);
    if (!response.ok && isMaxTokensParamError(payloadResponse.rawText)) {
        delete generationConfig.maxOutputTokens;
        response = await requestGemini();
        payloadResponse = await readResponsePayload<Record<string, unknown>>(response);
    }
    const { payload, rawText } = payloadResponse;
    if (!response.ok) throw new CanvasAgentRequestError(geminiErrorMessage(payload, rawText || "文本模型请求失败"), response.status, geminiErrorCode(payload));
    const candidates = Array.isArray(payload.candidates) ? payload.candidates as Array<Record<string, unknown>> : [];
    const maxTokenReason = candidates.map((candidate) => candidate.finishReason).find((reason) => typeof reason === "string" && /^MAX_TOKENS$/i.test(reason));
    if (typeof maxTokenReason === "string") {
        throw new CanvasAgentRequestError("文本模型本轮输出过长，达到模型输出上限被截断。可让模型减少单轮操作、精简输出内容，或在画布设置里更换输出上限更高的文本模型", response.status);
    }
    const incompleteReason = candidates.map((candidate) => candidate.finishReason).find((reason) => typeof reason === "string" && /^(?:SAFETY|RECITATION|BLOCKLIST|PROHIBITED_CONTENT|SPII|MALFORMED_FUNCTION_CALL|UNEXPECTED_TOOL_CALL|TOO_MANY_TOOL_CALLS)$/i.test(reason));
    if (typeof incompleteReason === "string") {
        throw new CanvasAgentRequestError("文本模型输出未完成：" + incompleteReason, response.status);
    }
    const parts = candidates.flatMap((candidate) => {
        const content = candidate.content && typeof candidate.content === "object" ? candidate.content as Record<string, unknown> : {};
        return Array.isArray(content.parts) ? content.parts as Array<Record<string, unknown>> : [];
    });
    if (!parts.length) throw new CanvasAgentRequestError(geminiErrorMessage(payload, "文本模型没有返回内容"), response.status);
    const usageMetadata = payload.usageMetadata && typeof payload.usageMetadata === "object" ? payload.usageMetadata as Record<string, unknown> : {};
    const inputTokens = typeof usageMetadata.promptTokenCount === "number" ? usageMetadata.promptTokenCount : undefined;
    calibrateCanvasAgentTokenEstimate(canvasAgentTokenCalibrationKey(config), { systemPrompt, messages, tools }, inputTokens);
    refreshRemoteUser(config);
    let toolError: string | undefined;
    const toolCalls = parts.flatMap((part, index) => {
        const call = part.functionCall && typeof part.functionCall === "object" ? part.functionCall as Record<string, unknown> : null;
        if (!call) return [];
        const name = typeof call.name === "string" ? call.name.trim() : "";
        if (!name) {
            toolError = MISSING_TOOL_NAME_ERROR;
            return [];
        }
        return [{ id: `gemini-tool-${index}`, name, ...parseToolArguments(call.args) }];
    });
    return {
        content: parts.map((part) => typeof part.text === "string" ? part.text : "").join(""),
        ...(toolError ? { toolError } : {}),
        toolCalls,
    };
}

function canvasAgentJsonSchema(tools: CanvasAgentToolDefinition[]): Record<string, unknown> {
    return {
        type: "object",
        properties: {
            actions: {
                type: "array",
                maxItems: 12,
                items: {
                    type: "object",
                    properties: {
                        tool: { type: "string", enum: tools.map(({ function: tool }) => tool.name) },
                        arguments: { type: "object", additionalProperties: true },
                    },
                    required: ["tool", "arguments"],
                    additionalProperties: false,
                },
            },
            reply: { type: "string" },
        },
        required: ["actions", "reply"],
        additionalProperties: false,
    };
}

function parseGeminiToolResponse(value: string) {
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : { result: parsed };
    } catch {
        return { result: value };
    }
}

function toRequestMessage(message: CanvasAgentProtocolMessage, textTools = false) {
    // JSON 回退要连历史一起转换；否则 tools 已移除却仍携带原生 tool 消息，
    // 兼容服务可能返回只有 usage 的空流，后续一直无法继续。
    if (textTools && message.role === "tool") return { role: "user", content: "工具执行结果（只可依据这些真实结果继续）：\n" + message.content };
    if (textTools && message.role === "assistant" && message.toolCalls?.length) {
        return { role: "assistant", content: JSON.stringify({ actions: message.toolCalls.map(call => ({ tool: call.name, arguments: call.arguments })), reply: message.content || "" }) };
    }
    if (message.role === "assistant") {
        return {
            role: "assistant",
            content: message.content || null,
            ...(message.reasoningContent !== undefined ? { reasoning_content: message.reasoningContent } : {}),
            ...(message.toolCalls?.length
                ? {
                      tool_calls: message.toolCalls.map((toolCall) => ({
                          id: toolCall.id,
                          type: "function",
                          function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
                      })),
                  }
                : {}),
        };
    }
    if (message.role === "tool") {
        return {
            role: "tool",
            content: message.content,
            tool_call_id: message.toolCallId,
            name: message.name,
        };
    }
    return { role: message.role, content: message.content };
}

function toResponsesInput(message: CanvasAgentProtocolMessage): unknown[] {
    if (message.role === "assistant") {
        if (message.responseItems?.length) return message.responseItems;
        return [
            ...(message.content ? [{ role: "assistant", content: message.content }] : []),
            ...(message.toolCalls || []).map((toolCall) => ({ type: "function_call", call_id: toolCall.id, name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) })),
        ];
    }
    if (message.role === "tool") return [{ type: "function_call_output", call_id: message.toolCallId, output: message.content }];
    return [{
        role: message.role,
        content: typeof message.content === "string" ? message.content : message.content.map((part) => part.type === "text" ? { type: "input_text", text: part.text } : { type: "input_image", image_url: part.image_url.url }),
    }];
}

function parseToolArguments(value: unknown): Pick<CanvasAgentToolCall, "arguments" | "argumentsError"> {
    if (value === undefined) return { arguments: {} };
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? { arguments: parsed as Record<string, unknown> }
            : { arguments: {}, argumentsError: "工具 arguments 必须是 JSON 对象" };
    } catch {
        return { arguments: {}, argumentsError: "工具 arguments 不是合法 JSON" };
    }
}

/**
 * 上游错误人话化：new-api / 造物线路会把渠道池的 429 原样回吐成英文或半截中文
 * （"All available accounts are currently rate-limited."、"生成没有成功，请稍后重试，或换一条线路"），
 * 直接显示在 Agent 气泡里用户根本看不出该干什么。这里统一翻译成「发生了什么 + 现在该做什么」。
 */
const UPSTREAM_ERROR_HINTS: Array<{ test: RegExp; message: string }> = [
    {
        test: /实名认证|real[\s_-]?name|verif(?:y|ication)/i,
        message: "这条上游线路要实名认证后才能提高调用频率（429）。本轮没有执行；请在面板底部换一个文本模型再试。",
    },
    {
        test: /rate.?limit|currently rate-limited|too many requests|负载已饱和|限流|换一条线路|\b429\b/i,
        message: "上游模型此刻排队已满（429 限流），本轮没有开始执行。请点面板底部的模型名换一个文本模型后重试，例如 DeepSeek V4.1 Flash 或 Qwen3.7 Flash。",
    },
    {
        test: /insufficient|额度不足|余额不足|欠费|exceeded your current quota/i,
        message: "上游额度不足，本轮没有开始执行。请到积分明细确认余额后再试。",
    },
    {
        test: /unauthorized|invalid.*(?:api.?key|token)|\b401\b/i,
        message: "模型线路鉴权失败（401），本轮未执行。请刷新页面重新登录后再试。",
    },
];

export function canvasAgentFriendlyError(message: string) {
    const detail = String(message || "");
    for (const hint of UPSTREAM_ERROR_HINTS) if (hint.test.test(detail)) return hint.message;
    return detail;
}

function readError(payload: AiErrorPayload, status: number, rawText = "") {
    const detail = payload.error?.message || payload.msg || payload.message || rawText || (status ? "文本模型请求失败：" + status : "文本模型请求失败");
    const friendly = canvasAgentFriendlyError(detail);
    // 改写过的消息保留原始上游文案，便于排查渠道问题（不进用户气泡）。
    if (friendly !== detail) console.warn("[canvas-agent] 上游原始错误", { status, detail });
    return friendly;
}

function readErrorCode(payload: AiErrorPayload) {
    return payload.error?.code || payload.error?.type || (typeof payload.code === "string" ? payload.code : undefined);
}

function geminiErrorCode(payload: Record<string, unknown>) {
    const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    return typeof error.code === "string" ? error.code : typeof error.status === "string" ? error.status : undefined;
}

/** 流式增量：reasoning 是思考模型当前段的思维链，content 是正文增量。 */
export type CanvasAgentStreamDelta = { reasoning?: string; content?: string };

type ReadPayloadOptions = {
    /** SSE 每个 delta chunk 到达时上报（思考过程实时展示用）。 */
    onDelta?: (delta: CanvasAgentStreamDelta) => void;
    /** 任何字节到达（含 headers 后的首包）；用于把硬超时重置为"无数据才判死"。 */
    onActivity?: () => void;
};

function reportStreamDelta(options: ReadPayloadOptions, data: string) {
    if (!options.onDelta) return;
    let event: any;
    try { event = JSON.parse(data); } catch { return; }
    const delta = event?.choices?.[0]?.delta ?? event?.choices?.[0]?.message;
    if (!delta || typeof delta !== "object") return;
    const reasoning = typeof delta.reasoning_content === "string" ? delta.reasoning_content : undefined;
    const content = typeof delta.content === "string" ? delta.content : undefined;
    if (reasoning === undefined && content === undefined) return;
    options.onDelta({ reasoning, content });
}

async function readResponsePayload<T extends object>(response: Response, options?: ReadPayloadOptions) {
    const contentType = response.headers.get("content-type") || "";
    if (!options?.onDelta || !/text\/event-stream/i.test(contentType) || !response.body) {
        options?.onActivity?.();
        const rawText = await response.text();
        options?.onActivity?.();
        try {
            return { payload: (rawText ? JSON.parse(rawText) : {}) as T, rawText };
        } catch {
            return { payload: (parseChatCompletionStream(rawText) || {}) as T, rawText };
        }
    }
    // SSE 流式读取：原文逐行累积（结束后仍走既有聚合，协议零变化），
    // 同时旁路上报 reasoning/content 增量给调用方做思考过程实时展示。
    const lines: string[] = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const handleLine = (line: string) => {
        lines.push(line);
        if (!line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") return;
        reportStreamDelta(options!, data);
    };
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            options!.onActivity?.();
            buffer += decoder.decode(value, { stream: true });
            let index: number;
            while ((index = buffer.indexOf("\n")) >= 0) {
                handleLine(buffer.slice(0, index).replace(/\r$/, ""));
                buffer = buffer.slice(index + 1);
            }
        }
        if (buffer.trim()) handleLine(buffer.replace(/\r$/, ""));
    } finally {
        reader.releaseLock?.();
    }
    const rawText = lines.join("\n");
    return { payload: (parseChatCompletionStream(rawText) || {}) as T, rawText };
}

export function canvasAgentTokenCalibrationKey(config: AiConfig) {
    return `${config.apiMode}:${isGeminiConfig(config) ? "gemini" : "openai"}:${config.baseUrl}:${config.model}`;
}

function hasImageContent(messages: CanvasAgentProtocolMessage[]) {
    return messages.some((message) => (message.role === "user" || message.role === "system") && Array.isArray(message.content) && message.content.some((item) => item.type === "image_url"));
}

function stripImageContent(messages: CanvasAgentProtocolMessage[]) {
    return messages.map((message): CanvasAgentProtocolMessage => {
        if ((message.role === "user" || message.role === "system") && Array.isArray(message.content)) {
            return { role: message.role, content: message.content.filter((item) => item.type === "text") };
        }
        return message;
    });
}

function isImageCompatibilityError(error: unknown) {
    return error instanceof CanvasAgentRequestError && /image_url|image input|vision|multimodal|content.*array|unsupported.*image|不支持.*图片|图像输入/i.test(error.message);
}

function isToolCompatibilityError(error: unknown, mode: "tools" | "structured-json") {
    if (!(error instanceof CanvasAgentRequestError)) return false;
    if ([401, 403, 408, 409, 429].includes(error.status) || error.status >= 500) return false;

    const detail = `${error.code || ""} ${error.message}`.replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    const target = mode === "tools"
        ? String.raw`\btools?\b|\btool[\s.]*(?:choice|calls?|calling)\b|\bfunction[\s.]*(?:calls?|calling|declarations?)\b|工具调用|函数调用`
        : String.raw`\bresponse[\s.]*format\b|\bjson[\s.]*schema\b|\btext[\s.]*format\b|\bresponse[\s.]*mime[\s.]*type\b|\bstructured output\b|结构化输出`;
    if (!new RegExp(target, "i").test(detail)) return false;
    if (mode === "tools" && /\btools?\s*\[\s*\d+\s*\].*\b(?:parameters?|properties|required|additional\s*properties|schema)\b|\binvalid schema for function\b/i.test(detail)) return false;
    if (mode === "structured-json" && /\binvalid (?:json )?schema\b|\bschema (?:validation|violation)\b|\b(?:properties|required|additional\s*properties)\b/i.test(detail)) return false;

    const issue = String.raw`\bunsupported\b|\b(?:does\s+not|doesn't|do\s+not|don't|not)\s+support(?:ed|s|ing)?\b|\b(?:not allowed|not permitted|must be none|unavailable|disabled|not\s+(?:available|enabled|implemented))\b|\b(?:unknown|unrecognized|invalid)\s+(?:(?:request|input)\s+)?(?:field|parameter|argument)\b|不支持|不允许|不可用|未启用|未实现|未知(?:字段|参数)`;
    return new RegExp(`(?:${target}).{0,80}(?:${issue})|(?:${issue}).{0,80}(?:${target})`, "i").test(detail);
}

export function isCanvasAgentContextLimitError(error: unknown) {
    if (!(error instanceof CanvasAgentRequestError)) return false;
    return /context_length_exceeded|maximum context|context window|prompt too long|token limit|上下文长度|上下文超限|输入过长/i.test(`${error.code || ""} ${error.message}`);
}
