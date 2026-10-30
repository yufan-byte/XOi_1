import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasAgentConfig } from "../types";

/** Snapshot defaults when opening a project; subsequent global changes cannot retarget it. */
export function resolveCanvasAgentConfig(saved: CanvasAgentConfig | null | undefined, config: AiConfig): CanvasAgentConfig {
    // 项目里存过的模型可能已经被运营下架（例：deepseek-v4-flash 上游持续 429 后停用）。
    // 继续沿用它只会让 Agent 每次都撞同一个错，所以只在「当前仍可用」时才认旧值。
    const keep = (value: string | undefined, allowed: string[] | undefined) => {
        if (!value) return undefined;
        return !allowed?.length || allowed.includes(value) ? value : undefined;
    };
    const merged = {
        textApiMode: "chat" as const, autoGenerateMedia: false,
        textModel: config.textModel, textChannelId: config.textChannelId,
        imageModel: config.imageModel, imageChannelId: config.imageChannelId,
        videoModel: config.videoModel, videoChannelId: config.videoChannelId,
        audioModel: config.audioModel, audioChannelId: config.audioChannelId,
        imageQuality: config.quality, imageSize: config.size,
        videoQuality: config.vquality, videoSize: config.videoSize,
        videoSeconds: config.videoSeconds, videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
        ...saved,
    };
    return {
        ...merged,
        // 文本接口不再暴露给用户选：统一从 Chat 起，由 services/api/canvas-agent 按上游反馈自动切换。
        textApiMode: "chat",
        textModel: keep(saved?.textModel, config.textModels) ?? config.textModel,
        imageModel: keep(saved?.imageModel, config.imageModels) ?? config.imageModel,
        videoModel: keep(saved?.videoModel, config.videoModels) ?? config.videoModel,
        audioModel: keep(saved?.audioModel, config.audioModels) ?? config.audioModel,
    };
}

export function canvasAgentGenerationConfig(config: AiConfig, agent: CanvasAgentConfig): AiConfig {
    return {
        ...config,
        textModel: agent.textModel ?? config.textModel, textChannelId: agent.textChannelId ?? config.textChannelId,
        imageModel: agent.imageModel ?? config.imageModel, imageChannelId: agent.imageChannelId ?? config.imageChannelId,
        videoModel: agent.videoModel ?? config.videoModel, videoChannelId: agent.videoChannelId ?? config.videoChannelId,
        audioModel: agent.audioModel ?? config.audioModel, audioChannelId: agent.audioChannelId ?? config.audioChannelId,
        quality: agent.imageQuality, size: agent.imageSize,
        vquality: agent.videoQuality, videoSize: agent.videoSize,
        videoSeconds: agent.videoSeconds ?? config.videoSeconds,
        videoGenerateAudio: agent.videoGenerateAudio ?? config.videoGenerateAudio,
        videoWatermark: agent.videoWatermark ?? config.videoWatermark,
        count: "1", canvasImageCount: "1",
    };
}
