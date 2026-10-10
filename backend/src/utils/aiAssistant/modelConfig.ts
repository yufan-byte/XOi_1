import u from "@/utils";
import { assertAllowedVendor, getUserGatewayCredentials } from "@/lib/gateway/newapi";
import { AssistantError } from "./videoAnalysis";

// 模型选择由管理员统一配置，凭据按当前 new-api 用户动态取得。
export async function getAssistantAiConfig(userId: number, requestedModel?: unknown): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  const agentConfig = await u.db("o_agentDeploy").where("key", "universalAi").first();
  if (!agentConfig) return null;
  const configured = String(agentConfig.modelName || agentConfig.model || "").trim();
  if (!configured) return null;
  const separator = configured.indexOf(":");
  const vendorId = separator >= 0 ? configured.slice(0, separator) : String(agentConfig.vendorId || "newapi");
  let model = separator >= 0 ? configured.slice(separator + 1) : configured;
  assertAllowedVendor(vendorId);
  if (vendorId !== "newapi") throw new AssistantError("AI 助手必须配置为 NewAPI 模型");
  if (requestedModel) {
    const requested = String(requestedModel).trim();
    const requestedSeparator = requested.indexOf(":");
    const requestedVendor = requestedSeparator >= 0 ? requested.slice(0, requestedSeparator) : "";
    const requestedName = requestedSeparator >= 0 ? requested.slice(requestedSeparator + 1) : requested;
    if (requestedVendor !== "newapi" || !requestedName) throw new AssistantError("所选模型不是 NewAPI 可用模型");
    const available = await u.vendor.getModelList("newapi");
    if (!available.some((item: any) => String(item?.modelName || "") === requestedName && item?.type === "text")) {
      throw new AssistantError("所选模型当前不可用，请重新选择");
    }
    model = requestedName;
  }
  const credentials = await getUserGatewayCredentials(userId);
  return { ...credentials, model };
}
