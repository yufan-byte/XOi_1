/**
 * 出图提示词的公共风格拼装片段（角色场景页：批量润色 / 单品润色共用）。
 *
 * 抽出来的原因：这两条路由以前各写一份 system 提示，其中都有一句
 * `if (!visualManual) 视觉手册未定义`，导致"新建项目没选画风"时提示词生成 100% 失败
 * （o_project.artStyle 为空 → getArtPrompt 返回空串）。画风缺失本该降级而不是堵死，
 * 所以统一收在这里：兜底说明 + 硬性规则只维护一处，避免哪天只改了一条路由。
 */

/** 必须放在 system 末尾的硬约束：禁止拒答、只输出提示词正文 */
export const PROMPT_HARD_RULES =
  "\n\n【输出要求】以用户本次明确指定的画风、资产设定和构图为准，项目风格仅作可调整的参考；不要擅自改变时代、身份或用户指定的视觉风格。只输出可直接用于图片生成的提示词正文，不加 Markdown 标题、代码围栏或解释。";

/** 视觉手册缺失时的兜底风格说明：按题材给一段"自行统一画风"的约束 */
export function fallbackStyleNote(project: { type?: string | null; intro?: string | null }): string {
  const genre = String(project?.type || "").trim();
  const intro = String(project?.intro || "").trim().slice(0, 200);
  return [
    "【画风说明】本次未指定固定画风。",
    genre ? `题材：${genre}。` : "",
    intro ? `项目简介：${intro}。` : "",
    "请根据用户要求、剧本和资产描述决定适合的画面语言；未明确指定的风格不要擅自固定为写实、电影感或其他预设。",
  ]
    .filter(Boolean)
    .join("");
}

export type AssetStyleMode = "project" | "custom" | "free";

/** Project manual is optional; explicit user style replaces it for this request. */
export async function resolveAssetStyle(input: {
  mode?: AssetStyleMode;
  description?: string;
  project: { artStyle?: string | null; type?: string | null; intro?: string | null };
  manualKey: string;
  loadManual: (artStyle: string, key: string) => Promise<string | null | undefined>;
}): Promise<string> {
  const mode = input.mode || "project";
  if (mode === "custom") {
    const description = String(input.description || "").trim();
    if (!description) throw new Error("请填写本次自定义画风，或选择自由创作");
    return `【用户本次指定的画风】${description}\n以此作为本次视觉方向；不要套用项目画风手册。`;
  }
  if (mode === "project" && input.project.artStyle) {
    const manual = await input.loadManual(input.project.artStyle, input.manualKey);
    if (manual) return `【项目风格参考】以下内容仅作参考，如与用户本次明确要求冲突，以本次要求为准：\n${manual}`;
  }
  return fallbackStyleNote(input.project);
}

/** Image prompts must use the same style choice as prompt generation. */
export function imageStyleDirection(mode: AssetStyleMode | undefined, description: string | undefined, projectStyle: string | null | undefined): string {
  if (mode === "custom") return String(description || "").trim();
  if (mode === "free") return "";
  return String(projectStyle || "").trim();
}
