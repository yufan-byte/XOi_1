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
// ⚠️ 上游画布编辑器（pages/canvas 直接 re-export 上游 page，注释 "keep on the same upstream
// store/runtime"）跑的是**上游** use-config-store —— vite 别名对上游 importer 会把 @/ 解析回
// 上游本仓，所以 atelier store 与 upstream store 是两个互不相通的实例。
// 此前只同步了 atelier store（无人读取），画布「配置与用户偏好」读的 upstream store 依旧是
// 出厂默认的「本地直连 / OpenAI / 0 个模型」——这就是用户看到的"没和 new-api 统一"。
// 这里用与 pages/canvas 完全相同的绝对路径直连上游 store，把网关模型写进**它读的那一份**。
import { useConfigStore as useUpstreamConfigStore } from "@upstream/stores/use-config-store";
import { backendJson } from "@/xoi/backend";

export type ServerProvider = {
    id?: string | number;
    name?: string;
    image_models?: unknown[];
    chat_models?: unknown[];
    video_models?: unknown[];
    audio_models?: unknown[];
};

export type ServerModelConfig = {
    image_models?: unknown[];
    video_models?: unknown[];
    chat_models?: unknown[];
    audio_models?: unknown[];
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
        modelListOf(provider.image_models, "image").length + modelListOf(provider.video_models, "video").length + modelListOf(provider.chat_models, "text").length + modelListOf(provider.audio_models, "audio").length >
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
                ...modelListOf(provider.audio_models, "audio"),
            ]),
        }));
    }
    const models = [
        ...modelListOf(config.image_models, "image"),
        ...modelListOf(config.video_models, "video"),
        ...modelListOf(config.chat_models, "text"),
        ...modelListOf(config.audio_models, "audio"),
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
        audioModel: normalizeModelOptionValue(previous.audioModel, channels) || firstModelOfCapability(channels, "audio"),
    };
    useConfigStore.setState({ config: next });
}

let serverModelSync: Promise<boolean> | null = null;

export function syncServerModels(): Promise<boolean> {
    if (serverModelSync) return serverModelSync;
    serverModelSync = (async () => {
        try {
            // Async account-scoped hydration must finish before server defaults are merged.
            await Promise.all([useConfigStore, useUpstreamConfigStore].map(store => store.persist.hasHydrated() ? Promise.resolve() : new Promise<void>(resolve => {
                const off = store.persist.onFinishHydration(() => { off(); resolve(); });
                if (store.persist.hasHydrated()) { off(); resolve(); }
            })));
            const data = await backendJson<ServerModelConfig>("/api/config",{signal:AbortSignal.timeout(10000)});
            applyServerModels(data);
            applyUpstreamServerModels(buildServerChannels(data));
            return modelOptionsFromChannels(useConfigStore.getState().config.channels).length > 0;
        } catch (error) {
            console.warn("[xoi] 服务端模型同步失败:", error);
            return false;
        }
    })();
    const pending=serverModelSync;
    void pending.then(ready=>{if(!ready&&serverModelSync===pending)serverModelSync=null;});
    return pending;
}

/* ============================================================
 * 同步进**上游** store（画布编辑器真正读的那一份）
 * ------------------------------------------------------------
 * 上游 AiConfig 的形状与 atelier 完全不同：模型是 string[] 平铺
 * （models/imageModels/videoModels/textModels），渠道是 localChannels，
 * 且 isAiConfigReady 还要求本地渠道填 baseUrl/apiKey —— 那是"用户自带钥匙直连"时代的判定，
 * 在 XOi 里（模型来自服务端、生成一律走 /api/v1/canvas/* 账号代理）没有意义，直接放行。
 */
function applyUpstreamServerModels(channels: ModelChannel[]) {
    if (!channels.length) return;
    const names = channels.flatMap((channel) => channel.models.map((model) => model.name));
    const byCapability = (capability: ModelCapability) =>
        channels.flatMap((channel) => channel.models.filter((model) => model.capability === capability).map((model) => model.name));
    const image = byCapability("image");
    const video = byCapability("video");
    const text = byCapability("text");
    const audio = byCapability("audio");
    const channelName = String(i18n.t("config.serverChannelName") || "new-api 统一网关");
    const localChannel = {
        id: SERVER_CHANNEL_PREFIX,
        protocol: "openai" as const,
        name: channelName,
        baseUrl: "",
        apiKey: "",
        models: names,
    };
    const prev = useUpstreamConfigStore.getState().config;
    useUpstreamConfigStore.setState({
        config: {
            ...prev,
            channelMode: "local",
            localChannels: [localChannel],
            models: names,
            imageModels: image,
            videoModels: video,
            textModels: text,
            audioModels: audio,
            imageModel: image.includes(prev.imageModel) ? prev.imageModel : image[0] || "",
            videoModel: video.includes(prev.videoModel) ? prev.videoModel : video[0] || "",
            textModel: text.includes(prev.textModel) ? prev.textModel : text[0] || "",
            audioModel: audio.includes(prev.audioModel) ? prev.audioModel : audio[0] || "",
            imageChannelId: localChannel.id,
            videoChannelId: localChannel.id,
            textChannelId: localChannel.id,
            audioChannelId: localChannel.id,
            activeChannelId: localChannel.id,
            baseUrl: "",
            apiKey: "",
        },
        isAiConfigReady: (_config, model) => Boolean(String(model || "").trim()),
    });
}
