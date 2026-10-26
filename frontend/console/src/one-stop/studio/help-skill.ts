// 智能帮写的「帮写 skill」（造物 help-skill.ts 全量移植）：
// 默认按本页的通用写法扩写；可以换成某个帮写 skill（按它的写作手法写）；也可以选「不使用 skill」，按你的想法直接写。
// skill 清单来自造物 Skill 市场标给 图片/视频/音频 提示词帮写的 92 个 skill（help-skills.json）。
import skills from "./help-skills.json";

export const HELP_DEFAULT = "default";
export const HELP_NONE = "none";
export const HELP_NONE_LABEL = "不使用 skill";
export const HELP_NONE_DESC = "按你的想法直接写，不套用写作手法";

type Modality = "image" | "video" | "audio";
interface Row { skill_id: string; name: string; description: string; modality: string }
const ROWS = ((skills as unknown as { data: Row[] }).data ?? []);

/** 这个页面能用的帮写 skill（市场里标给 图片 / 视频 / 音频 帮写的那些） */
export function helpSkillsFor(modality: Modality): { id: string; name: string; description: string }[] {
  return ROWS.filter((x) => x.modality === modality && x.name.trim().length > 1).map((x) => ({ id: x.skill_id, name: x.name, description: x.description }));
}

const WHAT: Record<Modality, string> = { image: "AI 绘图提示词", video: "AI 视频提示词", audio: "可以直接使用的文案" };
/** 「不使用 skill」的系统提示：只整理用户自己的想法，不扩写、不套结构 */
export function plainHelpPrompt(modality: Modality): string {
  return `你是写作助手。把用户的想法整理成一条${WHAT[modality]}：只用用户给出的信息，保留原意和用词习惯，理顺语句即可；不要套用任何写作手法或固定结构，不要擅自添加用户没提到的主体、风格、镜头或细节。不要解释，只输出结果。`;
}

const skillLine = (modality: Modality, id: string) => {
  const s = helpSkillsFor(modality).find((x) => x.id === id);
  return s ? `${s.name}：${s.description}` : undefined;
};

/** 帮写用的系统提示：默认 = 本页通用写法；none = 按想法直接写；其余 = 通用写法 + 该 skill 的写法说明 */
export function helpSystemPrompt(modality: Modality, choice: string, base: string): string {
  if (choice === HELP_NONE) return plainHelpPrompt(modality);
  if (choice === HELP_DEFAULT) return base;
  const line = skillLine(modality, choice);
  return line ? `${base}\n\n按下面这个帮写 skill 的写作手法来写（与上面的要求冲突时以它为准）：\n当前 Skill：${line}` : base;
}

/** 记住每个页面上次选的帮写 skill；已下架的 skill 回到默认 */
const KEY = (m: Modality) => `xoi.help.skill.${m}`;
export function loadHelpSkill(modality: Modality): string {
  try { const v = localStorage.getItem(KEY(modality)) ?? HELP_DEFAULT; return v === HELP_NONE || v === HELP_DEFAULT || helpSkillsFor(modality).some((s) => s.id === v) ? v : HELP_DEFAULT; } catch { return HELP_DEFAULT; }
}
export function saveHelpSkill(modality: Modality, v: string) { try { localStorage.setItem(KEY(modality), v); } catch { /* 隐私模式 */ } }
