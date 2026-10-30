/**
 * 控制台会话工具 —— F3：JWT 不再落 localStorage
 *
 * 与主站 `frontend/src/utils/session.ts` 同一套语义（两边共用同一个 origin 和 localStorage）：
 *  · 凭据：后端下发的 httpOnly `xoi_session` cookie（持久）+ 本模块内存变量（仅本页有效）；
 *  · localStorage 只留非敏感的会话信号 `xoi_session`（`uid:nonce`）与过期时间戳 `xoi_session_exp`。
 *
 * 为什么控制台也要自己一份：它是独立的 React 打包产物，不能 import 主站源码。
 * 但两边的**键名与信号格式必须完全一致**，否则主站/控制台互相看不到对方登录的会话。
 */
export const SESSION_SIGNAL_KEY = "xoi_session";
export const SESSION_EXP_KEY = "xoi_session_exp";
const LEGACY_TOKEN_KEY = "token";

let memoryToken = "";

/** 内存凭据（可能为空：刷新后就是空，此时靠 cookie）。 */
export function sessionToken(): string {
  return memoryToken;
}

export function setSessionToken(token: string): void {
  memoryToken = String(token || "");
}

export function sessionSignal(): string {
  try {
    return localStorage.getItem(SESSION_SIGNAL_KEY) || "";
  } catch {
    return "";
  }
}

/** 登录时写信号：uid + 一次性随机数，保证同账号重新登录也算换号。 */
export function writeSessionSignal(id: string | number): string {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const signal = `${id}:${nonce}`;
  try {
    localStorage.setItem(SESSION_SIGNAL_KEY, signal);
  } catch {
    /* 隐私模式：降级为纯内存态，cookie 仍能维持登录 */
  }
  return signal;
}

/** 会话过期时间（毫秒时间戳）。0 = 未知，此时只靠服务端 401 兜底。 */
export function sessionExpiresAt(): number {
  try {
    const value = Number(localStorage.getItem(SESSION_EXP_KEY) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function setSessionExpiresAt(ms: number): void {
  try {
    if (Number.isFinite(ms) && ms > 0) localStorage.setItem(SESSION_EXP_KEY, String(ms));
  } catch {
    /* 忽略 */
  }
}

/** 清本机会话状态（内存 + 信号 + 过期时间 + 老凭据）。cookie 由后端清。 */
export function clearSessionState(): void {
  memoryToken = "";
  try {
    localStorage.removeItem(SESSION_SIGNAL_KEY);
    localStorage.removeItem(SESSION_EXP_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 本机还残留的老版本凭据（用于升级当次的迁移）。 */
export function legacyToken(): string {
  try {
    return localStorage.getItem(LEGACY_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

/** 手工拼 fetch 时用：有内存凭据才带 Authorization，否则交给同源 cookie。 */
export function authHeaders(): Record<string, string> {
  return memoryToken ? { Authorization: memoryToken } : {};
}

let bootstrapping: Promise<void> | undefined;

/**
 * 启动引导：在首屏渲染前把「本地信号」补齐。
 *
 * 两种场景（与主站 sessionBootstrap 同构）：
 *  1. 升级当次 localStorage 还留着老 token → 换 cookie 后删掉老凭据，用户无需重新登录；
 *  2. 只有 cookie、没有信号（清过缓存 / 直接落到 /console）→ 补回信号与影子键。
 */
export function bootstrapConsoleSession(): Promise<void> {
  bootstrapping ||= (async () => {
    if (typeof window === "undefined") return;
    const exchange = async (headers: Record<string, string>) => {
      const response = await fetch("/api/login/session", {
        method: "POST",
        headers,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return null;
      const body = (await response.json().catch(() => null)) as
        | { id?: number; name?: string; role?: string; exp?: number }
        | null;
      return body && Number.isSafeInteger(Number(body.id)) ? body : null;
    };
    const adopt = (body: { id?: number; name?: string; role?: string; exp?: number }) => {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || id < 1) return;
      writeSessionSignal(id);
      // 控制台壳层读这几个影子键（不含凭据，纯展示/导航用）
      try {
        localStorage.setItem("userId", String(id));
        if (body.role) localStorage.setItem("role", String(body.role));
        if (body.name) localStorage.setItem("username", String(body.name));
      } catch {
        /* 忽略 */
      }
      if (typeof body.exp === "number" && body.exp > 0) setSessionExpiresAt(body.exp * 1000);
    };
    try {
      const legacy = legacyToken();
      if (legacy) {
        const body = await exchange({ Authorization: legacy });
        if (body) {
          setSessionToken(legacy);
          adopt(body);
        }
        // 无论成败都清掉老凭据：成功则由 cookie 接管，失败说明它本来就无效。
        try {
          localStorage.removeItem(LEGACY_TOKEN_KEY);
        } catch {
          /* 忽略 */
        }
        return;
      }
      if (sessionSignal()) return;
      const body = await exchange({});
      if (body) adopt(body);
    } catch {
      /* 网络抖动不阻塞渲染；真正的判定交给接口 401 */
    }
  })();
  return bootstrapping;
}
