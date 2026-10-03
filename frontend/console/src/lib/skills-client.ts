"use client";
// Skill 市场的前端数据层：自建 / 保存的 Skill 都走服务端（/api/skills），换设备登录同一账号就能看到。
// 官方 Skill 仍来自打包进站点的静态数据，两者在页面里合并展示。
import { api } from "@/lib/api";

export type SkillStatus = "private" | "pending" | "published" | "rejected";
export interface ServerSkill {
  id: string; userId: number; name: string; description: string; body: string; agentScope: string; categoryId: string;
  coverUrl: string; tools: string[]; models: string[]; status: SkillStatus; visible: boolean; shareCode: string | null;
  reviewNote: string | null; saves: number; createdAt: number; updatedAt: number; author?: string;
}
export interface SkillDraftInput {
  id?: string; name: string; description: string; body: string; agentScope: string; categoryId: string;
  coverUrl?: string; tools?: string[]; models?: string[]; visible?: boolean; submit?: boolean;
}

export const STATUS_LABEL: Record<SkillStatus, string> = { private: "仅自己可见", pending: "审核中", published: "已上架", rejected: "未通过" };
export const SKILL_BODY_MAX = 256 * 1024;

export const listSkills = (tab: "market" | "mine" | "saved") => api<{ items: ServerSkill[]; ids?: string[] }>(`/api/skills?tab=${tab}`);
export const getSkillApi = (id: string) => api<ServerSkill>(`/api/skills/${encodeURIComponent(id)}`);
export const putSkill = (input: SkillDraftInput) => api<ServerSkill>("/api/skills", { method: "POST", body: JSON.stringify(input) });
export const removeSkill = (id: string) => api(`/api/skills?id=${encodeURIComponent(id)}`, { method: "DELETE" });
export const toggleSaved = (id: string, on: boolean) => api(`/api/skills/${encodeURIComponent(id)}/save`, { method: on ? "POST" : "DELETE" });
export const importSkill = (code: string) => api<ServerSkill>("/api/skills/import", { method: "POST", body: JSON.stringify({ code }) });

/** 超级智能体真正具备的工具：编辑器里勾选的是「这个 Skill 主要指导使用哪些工具」，不限制模型实际调用 */
export const SKILL_TOOLS: [string, string, string][] = [
  ["generate_image", "图片生成", "按描述出图"],
  ["generate_video", "视频生成", "按描述出片"],
  ["generate_audio", "语音合成", "文字转语音"],
  ["analyze_video", "视频反推", "抽帧拆解成结构化报告"],
  ["fetch_url", "网页正文提取", "抓取公开网页正文"],
  ["write_document", "文档交付", "产出可下载的 Markdown"],
  ["build_webpage", "网页构建", "单文件 HTML 直出"],
  ["remember", "记忆写入", "跨会话记住要点"],
];

// ---------- 本机缓存：智能体注入提示词时要同步取到 Skill 正文 ----------
// 服务端是唯一真相，但「选 Skill → 注入提示词」是同步逻辑，所以把我的 / 已保存的 Skill
// 镜像一份到本机（换设备登录后第一次打开会自动拉取覆盖）。
const CACHE_KEY = "mc.skills.cache";
export const SKILL_CACHE_EVENT = "mc:skills.cache";
let CACHE: Record<string, ServerSkill> = (() => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, ServerSkill>; } catch { return {}; }
})();

function writeCache(next: Record<string, ServerSkill>) {
  CACHE = next;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* 配额满：本次会话仍可用 */ }
  window.dispatchEvent(new CustomEvent(SKILL_CACHE_EVENT));
}

export const cachedSkill = (id?: string): ServerSkill | undefined => (id ? CACHE[id] : undefined);
export const cachedSkills = (): ServerSkill[] => Object.values(CACHE).sort((a, b) => b.updatedAt - a.updatedAt);
export const isServerSkillId = (id?: string) => !!id && id.startsWith("s_");

/** 拉取我的创建 + 我的保存，覆盖本机缓存。未登录直接返回空。 */
export async function hydrateSkillCache(): Promise<ServerSkill[]> {
  try {
    const [mine, saved] = await Promise.all([listSkills("mine"), listSkills("saved")]);
    const next: Record<string, ServerSkill> = {};
    for (const x of [...(mine.items ?? []), ...(saved.items ?? [])]) next[x.id] = x;
    writeCache(next);
    return Object.values(next);
  } catch { return cachedSkills(); }
}

/** 注入系统提示词的一行（与 lib/user-skills 的口径一致：名称——简介 + 正文） */
export function serverSkillPrompt(s: ServerSkill): string {
  const body = (s.body ?? "").trim().slice(0, 6000);
  return `${s.name}——${s.description}${body ? `\n<skill name="${s.name}">\n${body}\n</skill>` : ""}`;
}
