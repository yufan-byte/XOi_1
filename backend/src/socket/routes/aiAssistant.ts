import jwt from "jsonwebtoken";
import u from "@/utils";
import { Namespace, Socket } from "socket.io";
import ResTool from "@/socket/resTool";

async function verifyToken(rawToken: string): Promise<Boolean> {
  const setting = await u.db("o_setting").where("key", "tokenKey").select("value").first();
  if (!setting) return false;
  const { value: tokenKey } = setting;
  if (!rawToken) return false;
  const token = rawToken.replace("Bearer ", "");
  try {
    jwt.verify(token, tokenKey as string);
    return true;
  } catch (err) {
    return false;
  }
}

export default (nsp: Namespace) => {
  nsp.on("connection", async (socket: Socket) => {
    const token = socket.handshake.auth.token;
    if (!token || !(await verifyToken(String(token)))) {
      console.log("[aiAssistant] 连接失败，token无效");
      socket.disconnect();
      return;
    }

    console.log("[aiAssistant] 已连接:", socket.id);

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
        if (!agentConfig || !agentConfig.model) {
          resTool.newMessage("assistant", "AI助手").error("未配置AI模型，请在设置中配置");
          return;
        }

        // 获取供应商配置
        const vendor = await u.db("o_vendorConfig").where("id", agentConfig.vendorId).first();
        if (!vendor) {
          resTool.newMessage("assistant", "AI助手").error("未找到供应商配置");
          return;
        }

        const inputValues = JSON.parse(vendor.inputValues || "{}");
        if (!inputValues.apiKey) {
          resTool.newMessage("assistant", "AI助手").error("未配置API Key");
          return;
        }

        // 调用AI模型
        const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
        const { streamText } = await import("ai");

        const model = createOpenAICompatible({
          name: String(vendor.id || agentConfig.vendorId || "xoi"),
          baseURL: inputValues.baseUrl,
          apiKey: inputValues.apiKey,
        }).chatModel(String(agentConfig.modelName));

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
