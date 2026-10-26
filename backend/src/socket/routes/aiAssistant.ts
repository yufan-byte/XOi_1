import u from "@/utils";
import { Namespace, Socket } from "socket.io";
import ResTool from "@/socket/resTool";
import { getUserGatewayCredentials } from "@/lib/gateway/newapi";
import { resolveUserCatalogModel } from "@/lib/model-catalog";
import { trackedGatewayFetch } from "@/lib/gateway/receipts";
import {releaseLifecycle} from "@/utils/releaseLifecycle";
import { resolveTextModelKey } from "@/utils/textModel";

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

    socket.on("chat", releaseLifecycle.socketHandler(async (data: { content: string; model?: string }) => {
      const { content } = data;
      abortController?.abort();
      abortController = new AbortController();
      let activeMessage: ReturnType<ResTool["newMessage"]> | null = null;

      try {
        // universalAi 已退役：未显式选择模型时走默认文本模型（系统默认 → 账号可用 DeepSeek）
        const configuredModel = String(data.model || "").trim() || (await resolveTextModelKey());
        const separator = configuredModel.indexOf(":");
        const vendorId = separator >= 0 ? configuredModel.slice(0, separator) : "newapi";
        if (vendorId !== "newapi") throw new Error("AI 助手必须使用 NewAPI 模型");
        const requestedModel = separator >= 0 ? configuredModel.slice(separator + 1) : configuredModel;
        const actualModel = (await resolveUserCatalogModel(identity.id, requestedModel, "text")).model.modelName;
        const credentials = await getUserGatewayCredentials(identity.id);

        // 调用AI模型
        const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
        const { streamText } = await import("ai");

        const model = createOpenAICompatible({
          name: "newapi",
          baseURL: credentials.baseUrl,
          apiKey: credentials.apiKey,
          fetch: trackedGatewayFetch,
        }).chatModel(actualModel);

        const result = streamText({
          model,
          messages: [{ role: "user", content }],
          abortSignal: abortController.signal,
          maxRetries: 0,
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
    },message=>socket.emit("error",{message})));

    socket.on("stop", () => {
      abortController?.abort();
    });

    socket.on("disconnect", () => {
      abortController?.abort();
      console.log("[aiAssistant] 已断开:", socket.id);
    });
  });
};
