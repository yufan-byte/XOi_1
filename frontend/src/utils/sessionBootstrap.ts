/**
 * 启动会话引导（F3 迁移的「无感升级」环节）
 *
 * 必须在 router 首次导航 / 首次渲染之前跑完，否则路由守卫会因为本地还没有会话信号
 * 把已登录用户踢到登录页。
 *
 * 处理两种场景：
 *  1. **存量用户**：旧版本把 `Bearer xxx` 存在 localStorage.token 里。这里拿它跟后端换
 *     httpOnly cookie，换成功后立刻删掉老凭据 —— 用户不需要重新登录。
 *  2. **只有 cookie**：本地信号被清过（清缓存 / 换标签页策略）但 cookie 还在。
 *     用 cookie 把信号补回来，避免"明明还登着却被要求重新登录"。
 *
 * 失败一律静默：网络抖动不该白屏，后续任何 401 都会走正常过期跳转。
 */
import { legacyToken, sessionSignal, setSessionToken, writeSessionSignal } from "./session";

interface SessionReply {
  id: number;
  role?: string;
  exp?: number;
}

async function exchange(headers: Record<string, string>): Promise<SessionReply | null> {
  const response = await fetch("/api/login/session", {
    method: "POST",
    headers,
    // 同源请求默认带 cookie；显式声明一下，避免个别浏览器/打包环境的默认值差异。
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as SessionReply | null;
  if (!body || !Number.isSafeInteger(Number(body.id)) || Number(body.id) < 1) return null;
  return body;
}

let bootstrapped: Promise<void> | undefined;

export function bootstrapSession(): Promise<void> {
  bootstrapped ||= (async () => {
    if (typeof window === "undefined") return;
    try {
      const legacy = legacyToken();
      if (legacy) {
        const session = await exchange({ Authorization: legacy });
        if (session) {
          // 内存里留一份，供 socket.io 握手与少数必须手工拼 header 的老代码使用。
          setSessionToken(legacy);
          writeSessionSignal(session.id);
        }
        // 成功 → cookie 已接管，老凭据可以销账；失败 → 它本来就已经无效。
        try {
          localStorage.removeItem("token");
        } catch {
          /* 存储不可用时忽略 */
        }
        return;
      }
      // 已有信号就不额外打一次网络请求，刷新页面的常规路径零成本。
      if (sessionSignal()) return;
      const session = await exchange({});
      if (session) writeSessionSignal(session.id);
    } catch {
      /* 引导失败不阻塞启动；真正的鉴权结论由接口 401 决定 */
    }
  })();
  return bootstrapped;
}
