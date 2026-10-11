import { DIRECTOR_SKILLS } from "../../../../../shared/directorSkills";
import { backendJson } from "@/xoi/backend";
import { getOwnerTag, ownerDbName } from "@/xoi/owner";
import localforage from "localforage";

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
    const result = await backendJson<{ code: number; data: T; message?: string }>(path, { method: "POST", json: body || {} });
    if (result.code !== 200 && result.code !== 0) throw new Error(result.message || "技能读取失败");
    return result.data;
}

export const AGENT_SKILL_CONTENT_MAX_LENGTH = 20_000;

export type AgentSkillFile = { path: string; kind: "folder" | "file"; content: string; sort: number; createdAt?: string; updatedAt?: string };
export type AgentSkill = {
    id: string;
    ownerUserId: string;
    source: "system" | "user";
    name: string;
    description: string;
    coverUrl: string;
    coverStorageKey: string;
    content: string;
    enabled: boolean;
    sort: number;
    createdAt: string;
    updatedAt: string;
    hasFiles?: boolean;
    files?: AgentSkillFile[];
};

function frontmatter(content: string) {
    const block = content.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] || "";
    return {
        name: block.match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1],
        description: block.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1],
    };
}

export async function fetchSystemAgentSkills() {
    try {
        const paths = await apiPost<string[]>("/api/setting/skillManagement/getSkillList");
        const selected = (paths || []).filter((path) => /(?:^|\/)SKILL\.md$/i.test(path) || /^community\/[^/]+\.md$/i.test(path));
        const results = await Promise.allSettled(selected.map(async (path, sort): Promise<AgentSkill> => {
            const content = await apiPost<string>("/api/setting/skillManagement/getSkillContent", { path });
            const meta = frontmatter(content);
            const director = DIRECTOR_SKILLS.find((skill) => path === `purchased/director/${skill.id}/SKILL.md`);
            const fallback = /(?:^|\/)SKILL\.md$/i.test(path) ? path.split("/").at(-2) || "系统技能" : path.split("/").pop()?.replace(/\.md$/i, "") || path;
            return { id: path, ownerUserId: "", source: "system", name: director?.name || meta.name || fallback, description: director?.description || meta.description || "系统创作工作流", coverUrl: "", coverStorageKey: "", content, enabled: true, sort, createdAt: "", updatedAt: "", hasFiles: /\/SKILL\.md$/i.test(path) };
        }));
        const remote = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
        if (remote.length) return [...BUILTIN_SAFE_SKILLS, ...remote];
    } catch {
        // 本地宿主未部署系统 Skill 接口时使用安全内置库。
    }
    return BUILTIN_SAFE_SKILLS;
}

const BUILTIN_SAFE_SKILLS: AgentSkill[] = [
    { id: "builtin-ecommerce", ownerUserId: "", source: "system", name: "电商视觉", description: "商品主图、详情页与活动素材", coverUrl: "", coverStorageKey: "", enabled: true, sort: 0, createdAt: "", updatedAt: "", content: "围绕商品卖点、材质、尺寸和使用场景组织画面。优先真实产品结构、准确材质和可排版留白；不得生成品牌不存在的功能、虚假价格、夸张疗效或水印。" },
    { id: "builtin-xhs", ownerUserId: "", source: "system", name: "小红书内容", description: "封面、种草图与系列笔记", coverUrl: "", coverStorageKey: "", enabled: true, sort: 1, createdAt: "", updatedAt: "", content: "为小红书设计清晰、友好、真实的封面和配图。先提炼标题信息层级，再设计主体、场景和留白；不生成平台 Logo、虚假数据、夸张承诺或低俗内容。" },
    { id: "builtin-comic", ownerUserId: "", source: "system", name: "漫剧制作", description: "角色设定、分镜与连续画面", coverUrl: "", coverStorageKey: "", enabled: true, sort: 2, createdAt: "", updatedAt: "", content: "先建立角色一致性、场景规则和叙事目标，再拆分镜头。每个镜头说明景别、机位、动作、情绪、光线和画面衔接；保持角色服装、发型、道具和色彩连续。" },
    { id: "builtin-film", ownerUserId: "", source: "system", name: "影视分镜", description: "广告、短片和电影感镜头", coverUrl: "", coverStorageKey: "", enabled: true, sort: 3, createdAt: "", updatedAt: "", content: "按照场景目标、人物动作、镜头语言、声音和剪辑节奏组织影视方案。避免空泛形容词，给出可执行的景别、镜头运动、时长、光线和转场建议。" },
    { id: "builtin-storyboard", ownerUserId: "", source: "system", name: "品牌故事板", description: "品牌宣传片和产品叙事", coverUrl: "", coverStorageKey: "", enabled: true, sort: 4, createdAt: "", updatedAt: "", content: "将品牌目标转成清晰的视觉叙事：开场建立问题，中段展示产品或人物变化，结尾落到记忆点和行动方向。所有事实、卖点和承诺必须来自用户提供的信息。" },
];

export async function fetchSystemAgentSkillFile(id: string, path: string) {
    if (!/\/SKILL\.md$/i.test(id) || !path || /^[\\/]/.test(path) || path.split(/[\\/]/).includes("..")) throw new Error("只能读取当前技能目录内的辅助文件");
    const root = id.replace(/\/SKILL\.md$/i, "");
    return { path, kind: "file" as const, content: await apiPost<string>("/api/setting/skillManagement/getSkillContent", { path: `${root}/${path}` }), sort: 0 };
}

function userLibrary() {
    return localforage.createInstance({ name: ownerDbName("agent_skills"), storeName: "library" });
}
export async function fetchUserAgentSkills(_token: string) {
    const items = await userLibrary().getItem<AgentSkill[]>("items");
    return Array.isArray(items) ? items : [];
}
export async function saveUserAgentSkill(token: string, patch: Partial<AgentSkill>) {
    const items = await fetchUserAgentSkills(token);
    const previous = items.find(item => item.id === patch.id);
    const now = new Date().toISOString();
    const skill: AgentSkill = {
        id: previous?.id || `user-skill-${crypto.randomUUID()}`, ownerUserId: getOwnerTag(), source: "user",
        name: patch.name?.trim() || previous?.name || "未命名技能", description: patch.description || "", coverUrl: patch.coverUrl || "", coverStorageKey: patch.coverStorageKey || "",
        content: patch.content?.trim() || "", enabled: true, sort: previous?.sort || 0, createdAt: previous?.createdAt || now, updatedAt: now,
    };
    if (!skill.content || Array.from(skill.content).length > AGENT_SKILL_CONTENT_MAX_LENGTH) throw new Error("技能内容须在 1–20000 字之间");
    await userLibrary().setItem("items", [skill, ...items.filter(item => item.id !== skill.id)]);
    return skill;
}
export async function deleteUserAgentSkill(token: string, id: string) {
    const items = await fetchUserAgentSkills(token);
    await userLibrary().setItem("items", items.filter(item => item.id !== id));
    return true;
}
