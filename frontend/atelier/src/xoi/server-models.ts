/**
 * 服务端模型同步：画布模型/供应商以宿主管理员在 XOi 后台的配置为唯一来源（GET /api/config）。
 * 启动时拉取并整体替换本地渠道（一个供应商 = 一个渠道），画布内不再提供手动"添加供应商"入口。
 */

import i18n from "@/i18n";
import {
    normalizeChannelModels,
    modelOptionsFromChannels,
    normalizeModelOptionValue,
    useConfigStore,
    type AiConfig,
    type ModelCapability,
    type ModelChannel,
} from "@/stores/use-config-store";
import { backendJson } from "@/xoi/backend";

export type ServerProvider = {
    id?: string | number;
    name?: string;
    image_models?: unknown[];
    chat_models?: unknown[];
    video_models?: unknown[];
};

export type ServerModelConfig = {
    image_models?: unknown[];
    video_models?: unknown[];
    chat_models?: unknown[];
    api_providers?: ServerProvider[];
};

const SERVER_CHANNEL_PREFIX = "server";

function modelListOf(list: unknown[] | undefined, capability: ModelCapability) {
    return (list || [])
        .map((name) => String(name).trim())
        .filter(Boolean)
        .map((name) => ({ name, capability }));
}

/** 供应商分组优先（与 XOi 后台"模型服务"一致），缺失时退回平铺三列表 */
export function buildServerChannels(config: ServerModelConfig): ModelChannel[] {
    const providers = (config.api_providers || []).filter((provider) =>
        modelListOf(provider.image_models, "image").length + modelListOf(provider.video_models, "video").length + modelListOf(provider.chat_models, "text").length >
        0,
    );
    if (providers.length) {
        return providers.map((provider, index) => ({
            id: `${SERVER_CHANNEL_PREFIX}-${String(provider.id ?? index)}`,
            name: String(provider.name || `#${index + 1}`).trim() || `#${index + 1}`,
            baseUrl: "",
            apiKey: "",
            apiFormat: "openai" as const,
            models: normalizeChannelModels([
                ...modelListOf(provider.image_models, "image"),
                ...modelListOf(provider.video_models, "video"),
                ...modelListOf(provider.chat_models, "text"),
            ]),
        }));
    }
    const models = [
        ...modelListOf(config.image_models, "image"),
        ...modelListOf(config.video_models, "video"),
        ...modelListOf(config.chat_models, "text"),
    ];
    if (!models.length) return [];
    return [
        {
            id: SERVER_CHANNEL_PREFIX,
            name: i18n.t("config.serverChannelName"),
            baseUrl: "",
            apiKey: "",
            apiFormat: "openai",
            models: normalizeChannelModels(models),
        },
    ];
}

function firstModelOfCapability(channels: ModelChannel[], capability: ModelCapability) {
    for (const channel of channels) {
        const model = channel.models.find((item) => item.capability === capability);
        if (model) return `${channel.id}::${model.name}`;
    }
    return "";
}

/** 用服务端结果整体替换本地渠道；用户已选模型若仍在服务端列表中则保留 */
export function applyServerModels(config: ServerModelConfig) {
    const channels = buildServerChannels(config);
    const previous = useConfigStore.getState().config;
    const models = modelOptionsFromChannels(channels);
    const next: AiConfig = {
        ...previous,
        channels,
        models,
        imageModel: normalizeModelOptionValue(previous.imageModel, channels) || firstModelOfCapability(channels, "image"),
        videoModel: normalizeModelOptionValue(previous.videoModel, channels) || firstModelOfCapability(channels, "video"),
        textModel: normalizeModelOptionValue(previous.textModel, channels) || firstModelOfCapability(channels, "text"),
        // 服务端不下发音频模型（TTS 非管理员纳管范围），保留已选值仅在命中时生效
        audioModel: normalizeModelOptionValue(previous.audioModel, channels),
    };
    useConfigStore.setState({ config: next });
}

export async function syncServerModels(): Promise<boolean> {
    try {
        const data = await backendJson<ServerModelConfig>("/api/config");
        applyServerModels(data);
        return modelOptionsFromChannels(useConfigStore.getState().config.channels).length > 0;
    } catch (error) {
        console.warn("[xoi] 服务端模型同步失败:", error);
        return true; // 拉取失败不打扰用户，保留现状
    }
}
