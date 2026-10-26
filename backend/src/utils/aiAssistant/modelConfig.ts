import u from "@/utils";
import { assertAllowedVendor, assertProductionModel, getUserGatewayCredentials } from "@/lib/gateway/newapi";
import { resolveUserCatalogModel } from "@/lib/model-catalog";
import { AssistantError } from "./videoAnalysis";
import { resolveTextModelKey } from "@/utils/textModel";

// 模型选择由管理员统一配置，凭据按当前 new-api 用户动态取得。
export async function getAssistantAiConfig(userId: number, requestedModel?: unknown): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  // universalAi 已退役：不再读 o_agentDeploy，未显式指定时走默认文本模型（系统默认 → 账号可用 DeepSeek）
  let configured = "";
  if (requestedModel) {
    configured = String(requestedModel).trim();
  } else {
    try {
      configured = await resolveTextModelKey();
    } catch {
      return null;
    }
  }
  if (!configured) return null;
  const separator = configured.indexOf(":");
  const vendorId = separator >= 0 ? configured.slice(0, separator) : "newapi";
  let model = separator >= 0 ? configured.slice(separator + 1) : configured;
  assertAllowedVendor(vendorId);
  if (vendorId !== "newapi") throw new AssistantError("AI 助手必须配置为 NewAPI 模型");
  if (requestedModel) {
    const requested = String(requestedModel).trim();
    const requestedSeparator = requested.indexOf(":");
    const requestedVendor = requestedSeparator >= 0 ? requested.slice(0, requestedSeparator) : "";
    const requestedName = requestedSeparator >= 0 ? requested.slice(requestedSeparator + 1) : requested;
    if (requestedVendor !== "newapi" || !requestedName) throw new AssistantError("所选模型不是 NewAPI 可用模型");
    try { model = (await resolveUserCatalogModel(userId, requestedName, "text")).model.modelName; }
    catch { throw new AssistantError("所选模型当前不可用，请重新选择"); }
  }
  if (!requestedModel) {
    try { model = (await resolveUserCatalogModel(userId, model, "text")).model.modelName; }
    catch { throw new AssistantError("AI 助手配置的模型当前不可用"); }
  }
  const credentials = await getUserGatewayCredentials(userId);
  assertProductionModel(model);
  return { ...credentials, model };
}
