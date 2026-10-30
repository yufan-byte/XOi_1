import u from "@/utils";
import { Namespace, Socket } from "socket.io";
import * as agent from "@/agents/scriptAgent/index";
import ResTool from "@/socket/resTool";
import { resolveUserCatalogModel } from "@/lib/model-catalog";
import {releaseLifecycle} from "@/utils/releaseLifecycle";

export default (nsp: Namespace) => {
  nsp.on("connection", async (socket: Socket) => {
    // 身份已在 socket/index.ts 的命名空间中间件里统一解析（header 优先、httpOnly cookie 兜底）。
    // 这里以前又拿 socket.handshake.auth.token 二次验签，F3 把 JWT 从前端移走后 auth.token
    // 恒为空 → 每次连接都被自己踢掉，前端就永远显示「未连接」。不要再加回来。
    const identity = (socket.data as { user?: { id: number; role: string } }).user;
    if (!identity?.id) {
      console.log("[scriptAgent] 连接失败，缺少已认证身份");
      socket.disconnect();
      return;
    }
    const isolationKey = socket.handshake.auth.isolationKey;
    if (!isolationKey) {
      console.log("[scriptAgent] 连接失败，缺少 isolationKey");
      socket.disconnect();
      return;
    }

    console.log("[scriptAgent] 已连接:", socket.id);

    const resTool = new ResTool(socket, {
      projectId: socket.handshake.auth.projectId,
    });
    let abortController: AbortController | null = null;

    const thinkConfig: agent.AgentContext["thinkConfig"] = {
      think: false,
      thinlLevel: 0,
    };

    socket.on("chat", releaseLifecycle.socketHandler(async (data: { content: string; skills?: unknown; model?: unknown }) => {
      const { content } = data;
      abortController?.abort();
      abortController = new AbortController();
      const currentController = abortController;

      const msg = resTool.newMessage("assistant", "统筹");
      const ctx: agent.AgentContext = {
        socket,
        isolationKey,
        text: content,
        selectedSkills: data.skills,
        userMessageTime: new Date(msg.datetime).getTime() - 1,
        abortSignal: currentController.signal,
        resTool,
        msg,
        thinkConfig,
      };

      try {
        if (data.model) {
          if (typeof data.model !== "string" || !data.model.startsWith("newapi:")) throw new Error("请选择平台文字模型");
          const name = data.model.slice(7);
          const actual = (await resolveUserCatalogModel(Number(socket.data.user.id), name, "text")).model.modelName;
          ctx.selectedModel = `newapi:${actual}`;
        }
        await agent.runDecisionAI(ctx);
      } catch (err: any) {
        if (err.name !== "AbortError" && !currentController.signal.aborted) {
          console.error("[scriptAgent] chat error:", u.error(err).message);
          msg.error(u.error(err).message)
        }
      } finally {
        if (abortController === currentController) {
          abortController = null;
        }
      }
    },message=>socket.emit("error",{message})));

    socket.on("updateThinkConfig", (data: { think: boolean; thinlLevel: 0 | 1 | 2 | 3 }) => {
      thinkConfig.think = data.think;
      thinkConfig.thinlLevel = data.thinlLevel;
      console.log("[scriptAgent] 更新思考配置:", thinkConfig);
    });

    socket.on("disconnect", () => {
      abortController?.abort();
      abortController = null;
    });

    socket.on("stop", () => {
      abortController?.abort();
      abortController = null;
    });
  });
  nsp.on("disconnect", (socket: Socket) => {
    console.log("[scriptAgent] 已断开连接:", socket.id);
  });
};
