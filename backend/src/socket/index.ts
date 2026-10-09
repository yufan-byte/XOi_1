import { Server } from "socket.io";
import productionAgent from "./routes/productionAgent";
import scriptAgent from "./routes/scriptAgent";
import aiAssistant from "./routes/aiAssistant";
import u from "@/utils";
import { resolveIdentity } from "@/utils/authIdentity";
import { getPlatformPolicy } from "@/utils/platformPolicy";
import { runWithGatewayUser } from "@/lib/gateway/context";
import { loadAuthUser } from "@/utils/loadAuthUser";

export default (io: Server) => {
  const connections = new Map<number, number>();
  const activity = new Map<number, { count: number; until: number }>();
  setInterval(() => {
    for (const [id, entry] of activity) if (entry.until <= Date.now()) activity.delete(id);
  }, 60000).unref();
  const routes: Record<string, (nsp: ReturnType<Server["of"]>) => void> = {
    productionAgent,
    scriptAgent,
    aiAssistant,
  };

  for (const [name, handler] of Object.entries(routes)) {
    const nsp = io.of(`/api/socket/${name}`);
    nsp.use(async (socket, next) => {
      const authenticate = async (context: any) => {
        const key = await u.db("o_setting").where("key", "tokenKey").first();
        const identity = await resolveIdentity(String(socket.handshake.auth.token || ""), key?.value || "", loadAuthUser);
        if (identity.role !== "admin" && (await getPlatformPolicy()).maintenance) throw new Error("平台维护中");
        if (name !== "aiAssistant") {
          const projectId = Number(context.projectId);
          if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("项目无效");
          const project = await u.db("o_project").where("id", projectId).first();
          if (!project || (identity.role !== "admin" && project.userId !== identity.id)) throw new Error("无权访问项目");
          const expectedKey = name === "scriptAgent" ? projectId + ":scriptAgent" : projectId + ":productionAgent:" + context.scriptId;
          if (context.isolationKey !== expectedKey) throw new Error("会话不属于当前项目");
          if (name === "productionAgent") {
            const script = await u.db("o_script").where({ id: Number(context.scriptId), projectId }).first();
            if (!script) throw new Error("剧集不属于当前项目");
          }
        }
        socket.data.user = identity;
      };
      try {
        let context = socket.handshake.auth;
        await authenticate(context);
        const uid = Number(socket.data.user.id);
        if ((connections.get(uid) || 0) >= 8) throw new Error("实时连接过多");
        connections.set(uid, (connections.get(uid) || 0) + 1);
        socket.once("disconnect", () => {
          const remaining = (connections.get(uid) || 1) - 1;
          if (remaining > 0) connections.set(uid, remaining); else connections.delete(uid);
        });
        socket.use(async ([event, payload], done) => {
          if (!["chat", "updateContext"].includes(event)) return done();
          try {
            const current = activity.get(uid);
            const entry = current && current.until > Date.now() ? current : { count: 0, until: Date.now() + 60000 };
            entry.count++;
            activity.set(uid, entry);
            if (entry.count > 60) throw new Error("请求过于频繁");
            const target = event === "updateContext" ? payload : context;
            await authenticate(target);
            if (event === "chat" && (typeof payload?.content !== "string" || payload.content.length > 100000)) throw new Error("消息长度不合法");
            if (event === "updateContext") context = target;
            runWithGatewayUser(Number(socket.data.user.id), () => done());
          } catch { done(new Error("请求被拒绝，请检查账号或项目权限")); }
        });
        runWithGatewayUser(Number(socket.data.user.id), () => next());
      } catch { next(new Error("无权连接此会话")); }
    });
    handler(nsp);
    console.log(`[Socket] 注册命名空间: /api/socket/${name}`);
  }
};
