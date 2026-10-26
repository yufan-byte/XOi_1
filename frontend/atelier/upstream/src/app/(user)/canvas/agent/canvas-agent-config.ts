import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasAgentConfig } from "../types";

/** Snapshot defaults when opening a project; subsequent global changes cannot retarget it. */
export function resolveCanvasAgentConfig(saved: CanvasAgentConfig | null | undefined, config: AiConfig): CanvasAgentConfig {
    return {
        textApiMode: "chat", autoGenerateMedia: false,
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
