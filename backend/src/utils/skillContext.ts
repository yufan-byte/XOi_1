import path from "node:path";
import u from "@/utils";
import { getSkill } from "@/lib/market/skill-store";
import { readSkillDocument } from "@/utils/skillDocument";
import { skillCategory, type CreativeSkillCategory } from "@/utils/skillCatalog";

/** Built-ins without a document have a small, fixed workflow description. */
export const BUILTIN_SKILL_GUIDANCE: Record<string, string> = {
  "builtin-film": "影视分镜：确认故事、时长和风格后，按镜头输出景别、机位、构图、人物调度、运镜、光线、声音建议和转场；分别说明观察与推测。",
  "builtin-storyboard": "品牌故事板：确认目标受众和核心卖点，围绕一个创意建立开场钩子、叙事递进和结尾行动，给出逐镜画面与制作提示词。",
  "builtin-comic": "漫剧制作：先确定人物目标和冲突，再拆剧情节拍与镜头；维护角色、服装、场景和画风的一致性，输出分镜表。",
  "builtin-ecommerce": "电商视觉：确认商品、受众和使用场景，设计主图、详情页和推广视觉，保持产品外观、配色与品牌表达一致。",
  "builtin-xhs": "图文内容：确认主题和受众，设计封面、标题与连续图文结构，给出构图和文案建议，不编造个人体验或产品事实。",
};

export class SkillContextError extends Error {
  readonly status = 400;
}

type PrivateSkill = { name: string; body: string; categoryId: string; description?: string };
export type SkillContextOptions = {
  maxSkills?: number;
  maxCharsPerSkill?: number;
  maxTotalChars?: number;
  header?: string;
  userId?: number | null;
  category?: CreativeSkillCategory;
  /** Injected by tests; production always uses the configured skills directory and permission-aware store. */
  root?: string;
  lookupPrivateSkill?: (id: string, userId: number | null) => Promise<PrivateSkill | null>;
};

function selectedPath(item: unknown): string {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  if ("path" in item) return String((item as { path?: unknown }).path || "");
  if ("_meta" in item) return String((item as { _meta?: { path?: unknown } })._meta?.path || "");
  return "";
}

/** Load complete skill documents; reject invalid/inaccessible selections instead of silently dropping them.
 * Database-owned skills use their record and current user's authorization, never the shared file cache.
 */
export async function buildSkillContext(input: unknown, options: SkillContextOptions = {}): Promise<string> {
  if (!Array.isArray(input) || input.length === 0) return "";
  const maxSkills = options.maxSkills ?? 8;
  const maxChars = options.maxCharsPerSkill ?? 80_000;
  const maxTotal = options.maxTotalChars ?? 120_000;
  if (input.length > maxSkills) throw new SkillContextError(`最多选择 ${maxSkills} 个 Skill，请减少后重试`);
  const root = options.root || u.getPath("skills");
  const lookup = options.lookupPrivateSkill || getSkill;
  const blocks: string[] = [];
  let totalChars = 0;
  for (const item of input) {
    const relativePath = selectedPath(item);
    if (!relativePath) throw new SkillContextError("所选 Skill 无效，请重新选择");
    let name = relativePath;
    let body = "";
    let category: CreativeSkillCategory = "general";
    if (BUILTIN_SKILL_GUIDANCE[relativePath]) {
      body = BUILTIN_SKILL_GUIDANCE[relativePath];
    } else {
      const privateMatch = /^community\/(s_[A-Za-z0-9_-]+)\.md$/.exec(relativePath);
      if (privateMatch) {
        const skill = await lookup(privateMatch[1], options.userId || null);
        if (!skill) throw new SkillContextError("所选 Skill 不存在或无权使用，请重新选择");
        name = skill.name;
        body = skill.body;
        category = skillCategory(skill.categoryId, `${name} ${skill.description || ""}`);
      } else {
        if (!relativePath.toLowerCase().endsWith(".md")) throw new SkillContextError("Skill 格式无效，请重新选择");
        let raw: string;
        try { raw = await readSkillDocument(root, relativePath); }
        catch { throw new SkillContextError("所选 Skill 不存在或无法读取，请重新选择"); }
        const front = raw.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/)?.[1] || "";
        const field = (key: string) => (front.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "m"))?.[1] || "");
        name = field("name") || path.basename(relativePath, ".md");
        category = skillCategory(field("category"), `${relativePath} ${name} ${field("description")}`);
        body = raw.replace(/^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
      }
    }
    body = body.trim();
    if (!body) throw new SkillContextError(`Skill「${name}」没有正文`);
    if (body.length > maxChars) throw new SkillContextError(`Skill「${name}」内容过长（${body.length} 字），请精简后重试，系统不会静默截断`);
    // Category comes from the trusted Skill record/document, not the browser-provided category.
    if (options.category && category !== "general" && category !== options.category) continue;
    totalChars += body.length;
    if (totalChars > maxTotal) throw new SkillContextError(`所选 Skill 正文合计超过 ${maxTotal} 字，请减少或精简后重试`);
    blocks.push(`<skill name=${JSON.stringify(name)}>\n${body}\n</skill>`);
  }
  const header = options.header ?? "\n\n本轮已由用户启用以下 Skills。请遵循其中与请求相关的工作流：";
  return blocks.length ? `${header}${blocks.join("\n\n")}` : "";
}
