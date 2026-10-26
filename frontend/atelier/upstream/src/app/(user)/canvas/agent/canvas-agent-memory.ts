import type { CanvasAgentProtocolMessage } from "../types";
import type { CanvasAgentToolDefinition } from "./canvas-agent-tools";

// 后台上限换算：350KB UTF-8 ≈ 11.6 万 token（中文 1 字≈1 token≈3 字节）。
// 这里压到 9 万 token 触发压缩，留出系统提示/工具/输出的余量，避免先撞网关的"上下文过长"。
// 90k 会让画布上下文涨到 6 万 token 才压缩：单次调用又慢又贵，还会撞上网关的预估扣费上限。
// 4 万就触发压缩，画布快照/历史摘要够用。
export const MAX_AGENT_INPUT_TOKENS = 16_000;
const MAX_RECENT_PROTOCOL_TOKENS = 3_000;
/** 交给摘要模型的最多 token：摘要请求本身不能超上下文，否则压缩永远失败 */
const MAX_CHECKPOINT_INPUT_TOKENS = 8_000;
const MAX_COMPACTED_CONTEXT_TOKENS = 1_600;

/**
 * 网关真正卡的是**请求体字节数**（实测：72KB 通过，120KB 直接 402「余额不足，请先充值再继续」），
 * 不是 token 数。所以判断口径统一改成字节，留 24KB 余量取 48KB。
 * 压缩分三层，能不花钱就不花钱：
 *   1) 无损瘦身：工具结果截断 + 历史图片占位（不发模型、零成本、几乎总能降到预算内）
 *   2) 滑动窗口：只保留最近若干轮完整对话
 *   3) 摘要压缩：把更早的历史交给文本模型压成一段 checkpoint（这一步要花钱，所以放最后）
 */
export const MAX_AGENT_INPUT_BYTES = 48_000;
/** 摘要请求自身的体积上限：太大就会在压缩时先撞网关限制，压缩永远失败 */
const MAX_CHECKPOINT_INPUT_BYTES = 36_000;
/** 单条工具结果保留的正文字符数：画布快照/任务列表动辄上万字，对模型有用的只有前几段 */
const TOOL_CONTENT_LIMIT = 1_200;
/** 历史模型正文也可能包含上游误放出的长推理；只保留开头结论，避免每轮重复计费。 */
const ASSISTANT_CONTENT_LIMIT = 1_200;

export function measureCanvasAgentInputBytes(input: CanvasAgentInput) {
    return encoder.encode(JSON.stringify({ s: input.systemPrompt, t: input.tools, m: input.messages })).length;
}

/** 超大内联图（base64 data URL）一律换成文字占位：deepseek 类文本模型根本看不了图，
 *  而一张几百 KB 的图就能把请求体顶过网关的 ~80KB 红线（402「余额不足」的真凶之一）。
 *  对所有消息生效，包括最新一条——引用图应该走节点/资产引用，而不是 base64 塞进对话。 */
const INLINE_IMAGE_DROP_BYTES = 40_000;

function slimImageParts(message: CanvasAgentProtocolMessage): CanvasAgentProtocolMessage {
    if (!Array.isArray((message as any).content)) return message;
    const parts = (message as any).content as Array<{ type: string; text?: string; image_url?: { url?: string } }>;
    let dropped = 0;
    const next = parts.map((part) => {
        if (part.type !== "image_url") return part;
        const url = part.image_url?.url || "";
        if (!url.startsWith("data:") || url.length <= INLINE_IMAGE_DROP_BYTES) return part;
        dropped += 1;
        return { type: "text", text: "[图片已省略：内联图片过大，请用节点引用或资产库]" } as { type: string; text: string };
    });
    if (!dropped) return message;
    if (!next.some((part) => part.type === "text" && (part as { text?: string }).text?.trim() && !(part as { text?: string }).text!.startsWith("[图片已省略"))) {
        (next as Array<{ type: string; text?: string }>).unshift({ type: "text", text: "（此处附带了参考图片，已省略；请按节点引用处理）" });
    }
    return { ...message, content: next } as CanvasAgentProtocolMessage;
}

/** 无损瘦身：工具结果截断、历史图片换成文字占位。最后两条消息的文本原样保留，但超大内联图任何位置都会被替换。 */
export function slimCanvasAgentMessages(messages: CanvasAgentProtocolMessage[]): CanvasAgentProtocolMessage[] {
    const keepFrom = Math.max(0, messages.length - 2);
    return messages.map((message, index) => {
        message = slimImageParts(message);
        if (index >= keepFrom) return message;
        if (message.role === "tool") {
            const content = String(message.content ?? "");
            if (content.length <= TOOL_CONTENT_LIMIT) return message;
            return { ...message, content: `${content.slice(0, TOOL_CONTENT_LIMIT)}…（已省略 ${content.length - TOOL_CONTENT_LIMIT} 字）` } as CanvasAgentProtocolMessage;
        }
        if (message.role === "assistant") {
            const { reasoningContent: _drop, ...rest } = message as CanvasAgentProtocolMessage & { reasoningContent?: string };
            const content = typeof rest.content === "string" ? rest.content : "";
            return {
                ...rest,
                ...(content.length > ASSISTANT_CONTENT_LIMIT
                    ? { content: `${content.slice(0, ASSISTANT_CONTENT_LIMIT)}…（历史长回复已压缩）` }
                    : {}),
            } as CanvasAgentProtocolMessage;
        }
        if (Array.isArray((message as any).content)) {
            const parts = (message as any).content as Array<{ type: string; text?: string }>;
            return { ...message, content: parts.some((part) => part.type === "text") ? parts.map((part) => part.type === "text" ? part : { type: "text", text: "[历史图片已省略]" }) : [{ type: "text", text: "[历史图片已省略]" }] } as CanvasAgentProtocolMessage;
        }
        return message;
    });
}

/** 摘要请求也按字节裁剪输入，避免“压缩”这一步自己就超限。 */
function takeRecentWithinBytes(messages: CanvasAgentProtocolMessage[], budgetBytes: number) {
    const kept: CanvasAgentProtocolMessage[] = [];
    let used = 0;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const size = encoder.encode(JSON.stringify(messages[index])).length;
        if (used + size > budgetBytes) {
            if (!kept.length) kept.unshift({ role: "user", content: truncateToEstimatedTokens(JSON.stringify(messages[index]), Math.floor((budgetBytes - 256) / 3)) });
            break;
        }
        kept.unshift(messages[index]);
        used += size;
    }
    return kept;
}

type CanvasAgentInput = {
    systemPrompt: string;
    messages: CanvasAgentProtocolMessage[];
    tools: CanvasAgentToolDefinition[];
};

type CompactCanvasAgentHistoryInput = {
    protocolMessages: CanvasAgentProtocolMessage[];
    contextCheckpoint?: string;
    recentTokenBudget?: number;
    createCheckpoint: (previousCheckpoint: string | undefined, messages: CanvasAgentProtocolMessage[]) => Promise<string>;
};

const calibrationFactors = new Map<string, number>();
const encoder = new TextEncoder();

export function estimateCanvasAgentInputTokens(input: CanvasAgentInput, calibrationKey?: string) {
    const base = estimateCanvasAgentInputTokensBase(input);
    return Math.ceil(base * (calibrationKey ? calibrationFactors.get(calibrationKey) || 1.25 : 1.25));
}

export function calibrateCanvasAgentTokenEstimate(calibrationKey: string, input: CanvasAgentInput, actualInputTokens?: number) {
    if (!actualInputTokens || actualInputTokens <= 0) return;
    const base = estimateCanvasAgentInputTokensBase(input);
    if (!base) return;
    const nextFactor = Math.min(4, Math.max(1.08, (actualInputTokens / base) * 1.08));
    calibrationFactors.set(calibrationKey, Math.max(calibrationFactors.get(calibrationKey) || 0, nextFactor));
}

function estimateCanvasAgentProtocolTokens(messages: CanvasAgentProtocolMessage[]) {
    return messages.reduce((total, message) => total + estimateProtocolMessageTokens(message), 0);
}


/** 从最新往回取消息，直到累计估算 token 不超过 budget */
function takeRecentWithinTokens(messages: CanvasAgentProtocolMessage[], budget: number) {
    const kept: CanvasAgentProtocolMessage[] = [];
    let used = 0;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const tokens = estimateProtocolMessageTokens(messages[index]);
        if (used + tokens > budget) {
            if (!kept.length) kept.unshift({ role: "user", content: truncateToEstimatedTokens(JSON.stringify(messages[index]), budget - 100) });
            break;
        }
        kept.unshift(messages[index]);
        used += tokens;
    }
    return kept;
}

export async function compactCanvasAgentHistory(input: CompactCanvasAgentHistoryInput) {
    const { fixedMessages, completedRounds, unfinishedRound } = groupProtocolMessages(input.protocolMessages);
    const keptRounds: CanvasAgentProtocolMessage[][] = [];
    const compactedRounds: CanvasAgentProtocolMessage[][] = [];
    let recentTokens = 0;

    for (let index = completedRounds.length - 1; index >= 0; index -= 1) {
        const round = completedRounds[index];
        const roundTokens = estimateCanvasAgentProtocolTokens(round);
        if (recentTokens + roundTokens <= (input.recentTokenBudget ?? MAX_RECENT_PROTOCOL_TOKENS)) {
            keptRounds.unshift(round);
            recentTokens += roundTokens;
        } else {
            compactedRounds.unshift(round);
        }
    }

    const messagesToCompact = compactedRounds.flat();
    if (!messagesToCompact.length) {
        return { compacted: false, contextCheckpoint: input.contextCheckpoint, protocolMessages: input.protocolMessages };
    }

    // 只把最近的一段旧消息交给摘要模型：整段塞进去会让摘要请求自己超上下文，
    // 压缩就永远失败，最后仍按原样发出去撞"上下文过长"（造物也是只取最近若干轮）。
    const checkpointInput = takeRecentWithinTokens(takeRecentWithinBytes(messagesToCompact, MAX_CHECKPOINT_INPUT_BYTES), MAX_CHECKPOINT_INPUT_TOKENS);
    // An empty paid response is not permission to silently buy a second summary.
    const previousCheckpoint = input.contextCheckpoint ? truncateToEstimatedTokens(input.contextCheckpoint, MAX_COMPACTED_CONTEXT_TOKENS) : undefined;
    const checkpoint = await input.createCheckpoint(previousCheckpoint, checkpointInput);
    if (!checkpoint.trim()) {
        // 摘要失败也不能把超长上下文原样发出去：丢掉最旧的轮次，保留检查点与近期上下文
        return {
            compacted: true,
            contextCheckpoint: previousCheckpoint,
            protocolMessages: [...fixedMessages, ...keptRounds.flat(), ...unfinishedRound],
        };
    }
    return {
        compacted: true,
        contextCheckpoint: truncateToEstimatedTokens(checkpoint.trim(), MAX_COMPACTED_CONTEXT_TOKENS),
        protocolMessages: [...fixedMessages, ...keptRounds.flat(), ...unfinishedRound],
    };
}

export function serializeCanvasAgentMessagesForCheckpoint(messages: CanvasAgentProtocolMessage[]) {
    return messages.map((message) => {
        if (message.role === "assistant") {
            return {
                role: message.role,
                content: message.content || "",
                toolCalls: message.toolCalls?.map((call) => ({ name: call.name, arguments: call.arguments })),
            };
        }
        if (message.role === "tool") return { role: message.role, name: message.name, content: message.content };
        return { role: message.role, content: textContent(message.content) };
    });
}

function estimateCanvasAgentInputTokensBase(input: CanvasAgentInput) {
    return estimateTextTokens(input.systemPrompt)
        + estimateTextTokens(JSON.stringify(input.tools))
        + estimateCanvasAgentProtocolTokens(input.messages)
        + input.messages.length * 6
        + input.tools.length * 10;
}

function estimateProtocolMessageTokens(message: CanvasAgentProtocolMessage) {
    if (message.role === "assistant") {
        if (message.responseItems?.length) return estimateTextTokens(JSON.stringify(message.responseItems)) + 8;
        return estimateTextTokens(message.content || "")
            + estimateTextTokens(message.reasoningContent || "")
            + estimateTextTokens(JSON.stringify(message.toolCalls || []))
            + 8;
    }
    if (message.role === "tool") return estimateTextTokens(message.name) + estimateTextTokens(message.content) + 8;
    return estimateTextTokens(textContent(message.content)) + (typeof message.content === "string" ? 8 : message.content.filter((part) => part.type === "image_url").length * 1024 + 8);
}

function estimateTextTokens(value: string) {
    return value ? Math.ceil(encoder.encode(value).length / 3) : 0;
}

function textContent(content: Extract<CanvasAgentProtocolMessage, { role: "user" | "system" }>["content"]) {
    if (typeof content === "string") return content;
    return content.map((part) => part.type === "text" ? part.text : "[媒体引用]").join("\n");
}

function groupProtocolMessages(messages: CanvasAgentProtocolMessage[]) {
    const fixedMessages: CanvasAgentProtocolMessage[] = [];
    const rounds: CanvasAgentProtocolMessage[][] = [];
    let current: CanvasAgentProtocolMessage[] = [];

    messages.forEach((message) => {
        if (isRealUserMessage(message)) {
            if (current.length) rounds.push(current);
            current = [message];
        } else if (current.length) {
            current.push(message);
        } else {
            fixedMessages.push(message);
        }
    });
    if (current.length) rounds.push(current);

    const completedRounds: CanvasAgentProtocolMessage[][] = [];
    let unfinishedRound: CanvasAgentProtocolMessage[] = [];
    rounds.forEach((round, index) => {
        const completed = round.some((message, messageIndex) => message.role === "assistant" && !message.toolCalls?.length && !isFollowedByToolFallback(round, messageIndex));
        if (completed || index < rounds.length - 1) completedRounds.push(round);
        else unfinishedRound = round;
    });
    return { fixedMessages, completedRounds, unfinishedRound };
}

function isRealUserMessage(message: CanvasAgentProtocolMessage) {
    return message.role === "user" && !textContent(message.content).startsWith("工具执行结果（只可依据这些真实结果继续）：");
}

function isFollowedByToolFallback(round: CanvasAgentProtocolMessage[], index: number) {
    const next = round[index + 1];
    return next?.role === "user" && textContent(next.content).startsWith("工具执行结果（只可依据这些真实结果继续）：");
}

function truncateToEstimatedTokens(value: string, maxTokens: number) {
    if (estimateTextTokens(value) <= maxTokens) return value;
    let low = 0;
    let high = value.length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (estimateTextTokens(value.slice(0, middle)) <= maxTokens) low = middle;
        else high = middle - 1;
    }
    return value.slice(0, low).replace(/[\uD800-\uDBFF]$/, "");
}
