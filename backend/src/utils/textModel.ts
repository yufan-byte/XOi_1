/**
 * 全站默认文本模型解析。
 *
 * 【为什么有它】universalAi 这个"平台通用 AI"概念退役：它把"用哪个模型"藏进后台配置，
 * 用户在项目里选了模型也不生效。现在统一按下面的顺序解析，并把兜底固定成 DeepSeek（便宜稳定）：
 *
 *   1. 调用方显式传入（面板本次选择）
 *   2. 项目配置的 o_project.textModel
 *   3. 系统设置 o_setting.defaultTextModel（运营可改）
 *   4. 当前账号可用的 DeepSeek 文本模型（推荐位优先）
 *   5. 当前账号任意可用文本模型
 *   6. 都没有 → 明确报错，让用户去选模型（不静默用一个"看不见"的模型）
 *
 * 返回 `${vendor}:${model}` 形式，直接喂给 u.Ai.Text。
 */
import u from "@/utils";
import { getUserCatalog } from "@/lib/model-catalog";
import { requireGatewayUserId } from "@/lib/gateway/context";

/** 运营可覆盖的默认文本模型设置键（值为 newapi:xxx） */
export const DEFAULT_TEXT_MODEL_SETTING_KEY = "defaultTextModel";

function asModelKey(value: unknown): `${string}:${string}` | undefined {
  const text = String(value ?? "").trim();
  return text.includes(":") ? (text as `${string}:${string}`) : undefined;
}

/** 在账号可用模型里挑 deepseek 文本模型（优先推荐位），挑不到就取第一个可用文本模型 */
async function pickAccountTextModel(): Promise<`${string}:${string}` | undefined> {
  try {
    const catalog = await getUserCatalog(requireGatewayUserId());
    const textModels = catalog.models.filter((m) => m.type === "text" && m.selectable);
    const deepseek = textModels
      .filter((m) => /deepseek/i.test(m.modelName) || /deepseek/i.test(m.provider || ""))
      .sort((a, b) => Number(b.recommended) - Number(a.recommended) || (a.recommendationRank ?? 99) - (b.recommendationRank ?? 99));
    const pick = deepseek[0] ?? textModels[0];
    return pick ? `newapi:${pick.modelName}` : undefined;
  } catch {
    // 目录/网关暂不可用时交给上层报明确错误
    return undefined;
  }
}

export async function resolveTextModelKey(options: { projectId?: number | string | null; override?: unknown } = {}): Promise<`${string}:${string}`> {
  const override = asModelKey(options.override);
  if (override) return override;

  const projectId = Number(options.projectId);
  if (Number.isFinite(projectId) && projectId > 0) {
    const row = await u.db("o_project").where("id", projectId).select("textModel").first();
    const projectModel = asModelKey((row as { textModel?: string } | undefined)?.textModel);
    if (projectModel) return projectModel;
  }

  const setting = await u.db("o_setting").where("key", DEFAULT_TEXT_MODEL_SETTING_KEY).first();
  const configured = asModelKey((setting as { value?: string } | undefined)?.value);
  if (configured) return configured;

  const accountModel = await pickAccountTextModel();
  if (accountModel) return accountModel;

  throw new Error("当前没有可用的文本模型：请先在项目设置里选择文本模型，或联系平台开通 DeepSeek 渠道");
}
