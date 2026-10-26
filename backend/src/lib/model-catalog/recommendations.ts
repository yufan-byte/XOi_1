/** Merchandising only: never contains prices, credentials or billing overrides. */
export type ModelPresentation = {
  name?: string;
  description: string;
  recommendation: string;
  rank: number;
  /** Mirrors Zaowu primary tags / model-regroup pin. Featured entries are never cut by the generic recommendation limit. */
  featured?: boolean;
  referenceLatencySeconds?: number;
  rateResolutions?: string[];
};
/**
 * 推荐位口径（2026-10-20 对齐造物「重点推荐」）：
 * - 视频主推 = 造物为我方开的 3 条 seedance *-xoi 专用型号（上游描述自带「推荐使用」）；
 * - 无后缀 line1 线路降级为备用线路（兜底可见）；
 * - 文本/图像推荐沿用原有策展，模型已随造物 default 分组全量上架。
 */
export const modelPresentations: Record<string, ModelPresentation> = {
  "seedance2.0-line1-xoi": { name: "即梦 2.0 · 专线", description: "人物镜头与短剧创作 · 按秒计费 · 480p/720p", recommendation: "重点推荐", rank: 100, featured: true, referenceLatencySeconds: 400, rateResolutions: ["480p", "720p"] },
  "seedance2.5-line1-xoi": { name: "即梦 2.5 · 专线", description: "更多参考素材 · 最长 30 秒 · 按秒计费", recommendation: "重点推荐", rank: 95, featured: true, referenceLatencySeconds: 400, rateResolutions: ["480p", "720p"] },
  "seedance2.0-line1-fast-xoi": { name: "即梦 Fast · 专线", description: "低成本试镜头与分镜预览 · 按秒计费", recommendation: "重点推荐 · 省预算", rank: 90, featured: true, referenceLatencySeconds: 400, rateResolutions: ["480p", "720p"] },
  "seedance2.0-full": { name: "即梦 2.0 满血版", description: "4–15 秒片段 · 清晰度分档 · 按次计费", recommendation: "XOi 置顶", rank: 70, featured: true },
  "seedance2.0-full-fast": { name: "即梦 2.0 满血快速版", description: "即梦 2.0 满血快速线路", recommendation: "XOi 置顶", rank: 69, featured: true },
  "seedance2.5-full": { name: "即梦 2.5 满血版", description: "480p/720p/1080p 分档 · 按次计费", recommendation: "XOi 置顶", rank: 68, featured: true },
  "seedance2.0-line1": { name: "即梦 2.0", description: "人物镜头与短剧创作 · 按秒计费", recommendation: "备用线路", rank: 60, referenceLatencySeconds: 400, rateResolutions: ["480p", "720p"] },
  "seedance2.5-line1": { name: "即梦 2.5", description: "更多参考素材 · 最长 30 秒 · 按秒计费", recommendation: "XOi 置顶", rank: 58, featured: true, referenceLatencySeconds: 400, rateResolutions: ["480p", "720p", "1080p"] },
  "seedance2.5-x74": { name: "路线 2 · 即梦 2.5 按秒", description: "XOi 置顶的即梦 2.5 按秒线路", recommendation: "XOi 置顶", rank: 57, featured: true },
  "seedance2.0-line1-fast": { name: "即梦 Fast", description: "低成本试镜头与分镜预览 · 按秒计费", recommendation: "备用线路 · 省预算", rank: 56, referenceLatencySeconds: 400, rateResolutions: ["480p", "720p"] },
  "seedance-2.0-fast-2": { name: "即梦 2.0 Fast 2", description: "XOi 置顶的即梦 2.0 按次线路", recommendation: "XOi 置顶", rank: 55, featured: true },
  "wan3.0-720p-3": { name: "通义万相 3.0", description: "造物重点推荐 · 按秒线路", recommendation: "视频备选", rank: 50 },
  "deepseek-v4-flash": { name: "DeepSeek V4 Flash", description: "故事构思、分集整理与日常改写", recommendation: "日常创作", rank: 100 },
  "gpt-5.6-sol": { name: "GPT 5.6 Sol", description: "综合写作与结构化创作任务", recommendation: "综合创作", rank: 90 },
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6", description: "长文梳理与剧本细节打磨", recommendation: "剧本打磨", rank: 80 },
  "claude-fable-5": { name: "Claude Fable 5 · 官方专线", description: "官方稳定线路 · 长文与复杂推理", recommendation: "官方专线", rank: 85 },
  "claude-fable-5-1": { name: "Claude Fable 5.1 · 官方专线", description: "官方稳定线路 · 支持推理档位调节", recommendation: "官方专线", rank: 84 },
  "doubao-seedream-5-0": { name: "豆包 Seedream 5.0", description: "角色设定与分镜画面", recommendation: "日常出图", rank: 100 },
  "gpt-image-2": { name: "GPT Image 2", description: "画面编辑与创意设计", recommendation: "创意编辑", rank: 90 },
  "gemini-3.1-flash-image": { name: "Gemini 3.1 Flash Image", description: "图像创作的补充选择", recommendation: "补充推荐", rank: 80 },
};
