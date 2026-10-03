import u from "@/utils";
import { Namespace, Socket } from "socket.io";
import ResTool from "@/socket/resTool";
import { getUserGatewayCredentials } from "@/lib/gateway/newapi";

export default (nsp: Namespace) => {
  nsp.on("connection", async (socket: Socket) => {
    // 身份已在 socket/index.ts 的命名空间中间件里统一解析（resolveIdentity），
    // 此处不再重复校验 JWT —— 之前那次二次验证是冗余的，且会让身份口径分叉。
    const identity = (socket.data as { user?: { id: number; role: string } }).user;
    if (!identity?.id) {
      socket.disconnect();
      return;
    }

    console.log("[aiAssistant] 已连接:", socket.id, "用户:", identity.id);

    const resTool = new ResTool(socket);
    let abortController: AbortController | null = null;

    socket.on("chat", async (data: { content: string }) => {
      const { content } = data;
      abortController?.abort();
      abortController = new AbortController();
      let activeMessage: ReturnType<ResTool["newMessage"]> | null = null;

      try {
        // 获取通用AI配置
        const agentConfig = await u.db("o_agentDeploy").where("key", "universalAi").first();
        const configuredModel = String(agentConfig?.modelName || agentConfig?.model || "").trim();
        if (!agentConfig || !configuredModel) {
          resTool.newMessage("assistant", "AI助手").error("未配置AI模型，请在设置中配置");
          return;
        }
        const separator = configuredModel.indexOf(":");
        const vendorId = separator >= 0 ? configuredModel.slice(0, separator) : String(agentConfig.vendorId || "newapi");
        if (vendorId !== "newapi") throw new Error("AI 助手必须配置为 NewAPI 模型");
        const actualModel = separator >= 0 ? configuredModel.slice(separator + 1) : configuredModel;
        const credentials = await getUserGatewayCredentials(identity.id);

        // 调用AI模型
        const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
        const { streamText } = await import("ai");

        const model = createOpenAICompatible({
          name: "newapi",
          baseURL: credentials.baseUrl,
          apiKey: credentials.apiKey,
        }).chatModel(actualModel);

        const result = streamText({
          model,
          messages: [{ role: "user", content }],
          abortSignal: abortController.signal,
        });

        const message = resTool.newMessage("assistant", "AI助手");
        activeMessage = message;
        const textStream = message.text();

        for await (const chunk of result.textStream) {
          if (abortController.signal.aborted) break;
          textStream.append(chunk);
        }

        textStream.complete();
        message.complete();
      } catch (error: any) {
        if (error.name === "AbortError") {
          activeMessage?.stop();
          return;
        }
        console.error("[aiAssistant] 错误:", error.message);
        const message = resTool.newMessage("assistant", "AI助手");
        message.error(error.message || "AI请求失败");
      }
    });

    socket.on("stop", () => {
      abortController?.abort();
    });

    socket.on("disconnect", () => {
      abortController?.abort();
      console.log("[aiAssistant] 已断开:", socket.id);
    });
  });
};
