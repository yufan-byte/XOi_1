import type { CatalogModel } from "@/lib/models";

/**
 * 行内价格标签（生成按钮旁）。
 * · 图片（无时长参数）→ 显示模型基础单价；
 * · 视频（seconds/params 分档参数存在）→ 基础单价不代表实际档位
 *   （时长/清晰度分档），明确提示以生成前的「确认制作预算」弹窗为准。
 *   此前这里把分档参数丢掉只显示基础单价，视频按钮会显著少报。
 */
export function PriceTag({ model, seconds }: { model?: CatalogModel; seconds?: number | (number | undefined)[]; params?: Record<string, unknown> }) {
    if (!model) return null;
    const hasSeconds = Array.isArray(seconds) ? seconds.length > 0 : Number(seconds) > 0;
    if (hasSeconds) return <span className="text-[10px] text-muted-foreground">价格随时长/清晰度分档 · 按实际用量结算</span>;
    return <span className="text-[10px] text-muted-foreground">基础单价：{model.price}</span>;
}
