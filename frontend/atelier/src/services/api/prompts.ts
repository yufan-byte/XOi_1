import { brandPrompts } from "@/constant/prompt-library";

export type Prompt = {
    id: string; title: string; coverUrl: string; prompt: string; tags: string[]; category: string; githubUrl: string; preview: string; createdAt: string; updatedAt: string;
};
export const ALL_PROMPTS_OPTION = "全部";
export type PromptListResponse = { items: Prompt[]; tags: string[]; categories: string[]; total: number };

export async function fetchPrompts({ keyword = "", category = ALL_PROMPTS_OPTION, page = 1, pageSize = 500 }: { keyword?: string; tag?: string[]; category?: string; page?: number; pageSize?: number } = {}): Promise<PromptListResponse> {
    const items = brandPrompts.map((item) => ({ id: item.id, title: item.title["zh-CN"], coverUrl: item.coverUrl || "", prompt: item.prompt["zh-CN"], tags: [item.category], category: item.category, githubUrl: "", preview: item.summary["zh-CN"], createdAt: "2026-01-01", updatedAt: "2026-01-01" }));
    const query = keyword.trim().toLowerCase();
    // “系统提示词”在宿主没有远端 prompt 服务时映射到本地安全精选库，避免加载失败或显示旧的成人向内容。
    const filtered = items.filter((item) => (category === ALL_PROMPTS_OPTION || category === "system" || item.category === category) && (!query || `${item.title} ${item.prompt} ${item.tags.join(" ")}`.toLowerCase().includes(query)));
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), tags: [...new Set(items.flatMap((item) => item.tags))], categories: [...new Set(items.map((item) => item.category))], total: filtered.length };
}
export function formatPromptDate(value: string) { return value ? new Intl.DateTimeFormat("zh-CN").format(new Date(value)) : ""; }
