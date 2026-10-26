"use client";

import { Modal, Button } from "antd";
import { MessageSquare, ImageIcon, Video, AudioLines } from "lucide-react";
import { ModelPicker } from "@/components/model-picker";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { modelPricingText, useModelPricing } from "@/xoi/model-pricing";
import { canvasAgentGenerationConfig } from "../agent/canvas-agent-config";
import type { CanvasAgentConfig } from "../types";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";

export function CanvasModelSettings({ open, onClose, agentConfig, onChange }: {
    open: boolean; onClose: () => void; agentConfig: CanvasAgentConfig; onChange: (patch: Partial<CanvasAgentConfig>) => void;
}) {
    const config = canvasAgentGenerationConfig(useEffectiveConfig(), agentConfig);
    const pricing = useModelPricing();
    const rows = [
        { key: "text" as const, name: "文本", detail: "对话与分镜规划", icon: MessageSquare, model: config.textModel, channel: config.textChannelId },
        { key: "image" as const, name: "图片", detail: "分镜与参考图", icon: ImageIcon, model: config.imageModel, channel: config.imageChannelId },
        { key: "video" as const, name: "视频", detail: "镜头片段", icon: Video, model: config.videoModel, channel: config.videoChannelId },
        { key: "audio" as const, name: "声音", detail: "配音与音频", icon: AudioLines, model: config.audioModel, channel: config.audioChannelId },
    ];
    return <Modal title="本画布模型" open={open} onCancel={onClose} centered width={520} destroyOnHidden
        footer={<div className="flex items-center justify-between gap-3"><span className="text-xs text-stone-500">选择模型不扣积分</span><Button type="primary" onClick={onClose}>完成</Button></div>}>
        <p className="mb-3 mt-1 text-xs leading-5 text-stone-500">用于后续创作，自动保存到当前画布。已有节点沿用各自设置。</p>
        <div className="divide-y divide-stone-200/70 dark:divide-stone-700/70">
            {rows.map(row => {
                const Icon = row.icon;
                const selectedConfig = { ...config, model: row.model, ...(row.key === "video" ? { size: config.videoSize } : {}) };
                return <section key={row.key} aria-label={`${row.name}模型设置`} className="py-3">
                    <div className="mb-2 flex items-center gap-2 text-xs"><Icon className="size-3.5 opacity-60" /><span className="font-medium">{row.name}</span><span className="opacity-50">{row.detail}</span></div>
                    <ModelPicker config={selectedConfig} value={row.model} channelId={row.channel} capability={row.key} fullWidth className="!h-9 !rounded-lg !text-xs"
                        onChange={(model, channel) => onChange({ [`${row.key}Model`]: model, [`${row.key}ChannelId`]: channel || "" })} />
                    <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[11px] opacity-60" title={modelPricingText(pricing.rows, row.model, row.key, pricing)}>{modelPricingText(pricing.rows, row.model, row.key, pricing)}</span>
                        {row.key === "image" ? <CanvasImageSettingsPopover config={selectedConfig} showCount={false} buttonClassName="!h-7 !shrink-0 !rounded-md !px-2 !text-[11px]"
                            onConfigChange={(key, value) => onChange(key === "quality" ? { imageQuality: value } : key === "size" ? { imageSize: value } : {})} /> : null}
                        {row.key === "video" ? <CanvasVideoSettingsPopover config={selectedConfig} buttonClassName="!h-7 !shrink-0 !rounded-md !px-2 !text-[11px]"
                            onConfigChange={(key, value) => {
                                const keys: Record<string, keyof CanvasAgentConfig> = { vquality: "videoQuality", size: "videoSize", videoSeconds: "videoSeconds", videoGenerateAudio: "videoGenerateAudio", videoWatermark: "videoWatermark" };
                                if (keys[key]) onChange({ [keys[key]]: value });
                            }} /> : null}
                    </div>
                </section>;
            })}
        </div>
    </Modal>;
}
