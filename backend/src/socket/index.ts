import { Server } from "socket.io";
import productionAgent from "./routes/productionAgent";
import scriptAgent from "./routes/scriptAgent";
import aiAssistant from "./routes/aiAssistant";
import u from "@/utils";
import { resolveIdentity } from "@/utils/authIdentity";
import { sessionTokenFromHandshake } from "@/utils/sessionCookie";
import { getPlatformPolicy } from "@/utils/platformPolicy";
import { runWithGatewayUser } from "@/lib/gateway/context";
import { loadAuthUser } from "@/utils/loadAuthUser";
import { BILLING_ID_PATTERN } from "../../../shared/billableOperations";
import { claimModelBudget } from "@/lib/gateway/budgets";
import {sharedRates} from "@/middleware/sharedRateLimiter";
import {releaseLifecycle} from "@/utils/releaseLifecycle";

/** 可以原样透给前端的拒绝原因（都是我们自己抛的业务话术，不含内部细节）。 */
const SAFE_REJECT = new Set([
  "平台维护中",
  "请先登录后再使用实时功能",
  "项目无效",
  "无权访问项目",
  "会话不属于当前项目",
  "剧集不属于当前项目",
  "实时连接过多，请关闭多余的标签页后重试",
  "无效的登录凭据",
  "账号不存在或已停用",
  "登录凭据已失效，请重新登录",
]);
/** 单用户跨命名空间的并发连接上限：防滥用，不是给正常多标签/多设备设的闸。 */
const MAX_CONNECTIONS_PER_USER = 32;

export default (io: Server) => {
  // 用 socketId 集合而不是计数器：计数器的加减一旦错位（异常断开、重启残留）
  // 就会永久漂高，最后把所有连接都判成「实时连接过多」，且没有任何日志能看出来。
  const connections = new Map<number, Set<string>>();
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
        // F3：握手是独立通道，Express 中间件管不到。前端已不再把 JWT 放 localStorage，
        // 因此刷新后 auth.token 为空 —— 此时回退到同源 httpOnly cookie（握手请求本身同源，
        // cookie 会随请求带上；跨站 Origin 已在 sessionTokenFromHandshake 里被拒）。
        const authToken = String(socket.handshake.auth?.token || "");
        const cookieToken = sessionTokenFromHandshake(socket.handshake.headers);
        // 两条路都没凭据就直接给结论，别让 jwt.verify("") 的英文报错落到通用兜底文案里。
        if (!authToken && !cookieToken) throw new Error("请先登录后再使用实时功能");
        let identity;
        try {
          identity = await resolveIdentity(authToken || cookieToken, key?.value || "", loadAuthUser);
        } catch (error) {
          // header 优先是铁律，但老客户端可能把「账号切换信号」当 token 发上来。
          // 同源且有真 cookie 时按 cookie 再认一次（与 app.ts 的 HTTP 兜底口径一致）。
          if (!authToken || !cookieToken) throw error;
          identity = await resolveIdentity(cookieToken, key?.value || "", loadAuthUser);
        }
        if (identity.role !== "admin" && (await getPlatformPolicy()).maintenance) throw new Error("平台维护中");
        if (context.expectedUser !== undefined && String(identity.id) !== String(context.expectedUser)) throw new Error("账号已切换，请重新打开实时会话");
        if (name !== "aiAssistant") {
          const projectId = Number(context.projectId);
          if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("项目无效");
          const project = await u.db("o_project").where("id", projectId).first();
          // pg 的 bigint 列会以字符串返回，直接跟 number 比会恒不相等（管理员分支短路才没炸）。
          if (!project || (identity.role !== "admin" && Number(project.userId) !== Number(identity.id))) throw new Error("无权访问项目");
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
        const live = connections.get(uid) ?? new Set<string>();
        // 一个标签页占 1 条连接，且三个命名空间共用这份额度。原先上限 8 意味着
        // 「手机 + 两台电脑 + 几个标签」这种正常用法就会把用户自己锁死在「实时连接过多」上，
        // 属于自己影响自己。这里只做防滥用的兜底，正常办公/多设备用不到 32。
        if (live.size >= MAX_CONNECTIONS_PER_USER) throw new Error("实时连接过多，请关闭多余的标签页后重试");
        live.add(socket.id);
        connections.set(uid, live);
        socket.once("disconnect", () => {
          const current = connections.get(uid);
          if (!current) return;
          current.delete(socket.id);
          if (!current.size) connections.delete(uid);
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
            if(event==="chat"&&releaseLifecycle.isDraining())throw Object.assign(new Error("服务正在更新，本条消息尚未调用模型，请稍后重试"),{code:"RELEASE_DRAINING"});
            await authenticate(target);
            if(!(await sharedRates.take("socket-user",String(uid),60000,60)).allowed)throw new Error("请求过于频繁");
            if (event === "chat" && (typeof payload?.content !== "string" || payload.content.length > 100000)) throw new Error("消息长度不合法");
            if (event === "chat" && ["prod", "production"].includes(process.env.NODE_ENV || "") && !BILLING_ID_PATTERN.test(String(payload?.billingId || ""))) throw new Error("请先确认费用");
            if (event === "updateContext") context = target;
            const billingId = String(payload?.billingId || "");
            if (event === "chat") await claimModelBudget(Number(socket.data.user.id),billingId,`/socket/${name}`);
            runWithGatewayUser(Number(socket.data.user.id), () => done(), BILLING_ID_PATTERN.test(billingId) ? billingId : undefined);
          } catch(e:any) { done(new Error(e?.code==="RELEASE_DRAINING"?e.message:"请求被拒绝，请检查账号或项目权限")); }
        });
        runWithGatewayUser(Number(socket.data.user.id), () => next());
      } catch (error: any) {
        // 以前这里把一切异常都吞成「无权连接此会话」，前端只能看到「未连接」，
        // 排查时完全黑盒。业务话术原样透出，内部异常（DB/验签细节）只落日志。
        const raw = String(error?.message || "");
        const message = SAFE_REJECT.has(raw) ? raw : "实时连接失败，请重新登录后重试";
        console.error(`[Socket] 握手被拒绝 (${name}):`, raw || error);
        next(new Error(message));
      }
    });
    handler(nsp);
    console.log(`[Socket] 注册命名空间: /api/socket/${name}`);
  }
};
