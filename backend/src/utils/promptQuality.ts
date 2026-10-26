/**
 * 出图提示词质量闸门。
 *
 * 背景（2026-10-20）：文本模型遇到"设定与全局风格冲突"时会直接**拒答**——
 * 返回「无法生成：该场景设定属于古代民居，违反全局风格约束……」。旧的润色逻辑把这个
 * 拒答句子当成提示词存进 o_assets.prompt，前端显示"提示词就绪"，用户一点批量出图
 * 就白烧一次图片额度。所以模型输出必须先过这道闸门：拒答 / 空 / 过短一律判失败，
 * 不写回 prompt；出图接口也要再挡一次，防止历史脏数据继续花钱。
 */

/** 只在开头一小段里找拒答特征，避免正常的画面描述（如前缀里的"无文字"）被误判。 */
const REFUSAL_PATTERN = /(无法生成|无法提供|无法完成|无法按|不能生成|不能提供|很抱歉|抱歉|违反.{0,12}(规则|约束|规范|要求)|不符合.{0,12}(规则|约束|风格)|拒绝生成|cannot (?:generate|create|provide)|unable to (?:generate|create)|i'm sorry|i am sorry)/i;

export function promptRejectionReason(text: unknown): string | undefined {
  const value = String(text ?? "").trim();
  if (!value) return "模型返回为空，请重试或更换文本模型";
  if (value.length < 12) return `模型返回内容过短，不像可直接出图的提示词：${value.slice(0, 60)}`;
  const head = value.slice(0, 120);
  if (REFUSAL_PATTERN.test(head)) return `提示词模型拒答，没有产出可用提示词：${value.slice(0, 140)}`;
  return undefined;
}

export function isUsablePrompt(text: unknown): boolean {
  return promptRejectionReason(text) === undefined;
}
