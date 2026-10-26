import { brandPrompts, promptCategories } from "@/constant/prompt-library";

export type Prompt = { id: string; title: string; coverUrl: string; prompt: string; tags: string[]; category: string; githubUrl: string; preview: string; createdAt: string; updatedAt: string; };
export const ALL_PROMPTS_OPTION = "全部";
export type PromptListResponse = { items: Prompt[]; tags: string[]; categories: string[]; total: number };

const PROMPT_LOCALE = "zh-CN" as const;

/**
 * 画布「提示词库」弹窗（上游 PromptSelectDialog）的数据源。
 *
 * 组织口径：
 *   · 分类 = 内容类型（视频创作 / 产品摄影 / …），输出**中文标签**——
 *     弹窗的分类 chip 直接吃这里的字符串，以前透传英文 id（social/comic/film）
 *     既难看又没法和站点其他提示词页对齐；
 *   · 标签 = 「图片 / 视频」媒体维度 + 场景标签（运镜 / 首帧 / 电商…），
 *     生成视频时先点「视频」标签就能把视频提示词一把筛出来；
 *   · 分类顺序按 promptCategories 的固定顺序输出，不再跟随条目出现顺序漂移；
 *   · tag 筛选是真的在筛（此前 `tag` 参数收了但过滤逻辑漏写，等于摆设）。
 */
export async function fetchPrompts({ keyword = "", tag, category = ALL_PROMPTS_OPTION, page = 1, pageSize = 500 }: { keyword?: string; tag?: string[]; category?: string; page?: number; pageSize?: number } = {}): Promise<PromptListResponse> {
    const labelOf = (id: string) => promptCategories.find((item) => item.id === id)?.label[PROMPT_LOCALE] || id;
    const items = brandPrompts.map((item) => ({
        id: item.id,
        title: item.title[PROMPT_LOCALE],
        coverUrl: item.coverUrl || "",
        prompt: item.prompt[PROMPT_LOCALE],
        tags: [item.media === "video" ? "视频" : "图片", ...(item.tags || [])],
        category: labelOf(item.category),
        githubUrl: "",
        preview: item.summary[PROMPT_LOCALE],
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
    }));
    const query = keyword.trim().toLowerCase();
    const selectedTags = (tag || []).filter(Boolean);
    const filtered = items.filter(
        (item) =>
            (category === ALL_PROMPTS_OPTION || category === "system" || item.category === category) &&
            (!selectedTags.length || selectedTags.every((t) => item.tags.includes(t))) &&
            (!query || `${item.title} ${item.prompt} ${item.tags.join(" ")}`.toLowerCase().includes(query)),
    );
    // 分类 chip 按站点固定顺序排列，避免跟着条目顺序漂移
    const orderedCategories = promptCategories.filter((item) => item.id !== "all").map((item) => item.label[PROMPT_LOCALE]).filter((label) => items.some((item) => item.category === label));
    return {
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        tags: [...new Set(items.flatMap((item) => item.tags))],
        categories: orderedCategories,
        total: filtered.length,
    };
}
export function formatPromptDate(value: string) { return value ? new Intl.DateTimeFormat("zh-CN").format(new Date(value)) : ""; }
