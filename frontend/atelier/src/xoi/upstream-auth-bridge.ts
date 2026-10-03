/**
 * 上游画布登录态桥：把宿主(XOi)的 JWT 同步进上游 user store。
 *
 * 为什么需要：画布编辑器（pages/canvas 直接 re-export 上游 page）的 AI 请求
 * （创作 Agent / 生图 / 视频，services/api/{image,video,audio} 的 aiHeaders）
 * 读的是**上游** use-user-store 的 token（persist 键 `infinite-canvas-auth-token-v1`），
 * 而 XOi 从不写这个键 —— 用户浏览器里残留的陈旧值会让 /api/v1/* 全部 401
 * 「无效的token」，并原样显示成 Agent 回复。
 *
 * 做法：宿主 token（`token` 键，值含 "Bearer " 前缀）剥前缀后
 *   1) 写入上游 persist 键；2) 直塞上游 store state（isReady 置真）。
 * 之后的 hydrateUser（每次 AI 调用后 refreshRemoteUser 触发）会请求 /api/auth/me
 * 校验并回填 user —— 该端点已兼容上游 AuthUser 形状，失败会清 token，
 * 因此这里只做"播种"，不做假身份。
 */

import { useUserStore as useUpstreamUserStore } from "@upstream/stores/use-user-store";
import { getAuthToken } from "@/xoi/owner";

const UPSTREAM_AUTH_KEY = "infinite-canvas-auth-token-v1";

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackInterval: ReturnType<typeof setInterval> | null = null;

function rawXoiToken(): string {
    // 宿主约定值本身含 "Bearer " 前缀；上游 aiHeaders 会自己再拼一次，
    // 后端 resolveIdentity 兼容重复前缀，但这里仍剥干净免得依赖容错。
    return getAuthToken().replace(/^(Bearer\s+)+/i, "").trim();
}

/** 解 JWT payload 的 exp（秒）；解析失败视为已过期（宁可多登一次也别静默失败） */
function jwtExpMs(raw: string): number | null {
    try {
        const payload = JSON.parse(atob(raw.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

/** 登录态已失效：清干净画布侧会话，把**整个宿主页面**带去登录页（带 expired 标记出提示） */
function forceTopLogin() {
    if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
    try {
        // 宿主的过期 token 也要清掉：否则主站路由把「有 token」当已登录，
        // 会把 /login 弹回 /#/，强制登出就落空了
        localStorage.removeItem("token");
        localStorage.removeItem(UPSTREAM_AUTH_KEY);
    } catch { /* ignore */ }
    useUpstreamUserStore.setState({ token: "", user: null, isReady: true });
    try {
        // iframe 同源，可以导航宿主顶层；主站 /login 会整页跳 /console/login
        (window.top ?? window).location.href = "/#/login?expired=1";
    } catch {
        window.location.href = "/#/login?expired=1";
    }
}

export function syncUpstreamAuthSession() {
    const raw = rawXoiToken();
    if (!raw) return; // 宿主未登录不代管（登录页本身也在 iframe 外，不会走到画布）
    const expMs = jwtExpMs(raw);
    if (expMs !== null && expMs <= Date.now()) {
        forceTopLogin();
        return;
    }
    const state = useUpstreamUserStore.getState();
    if (state.token === raw && state.isReady) return;
    try {
        localStorage.setItem(UPSTREAM_AUTH_KEY, raw);
    } catch {
        /* 忽略存储异常，state 仍会生效到本页 */
    }
    useUpstreamUserStore.setState({ token: raw, isReady: true });
    // 到期前 30 秒主动强制登出 —— 画布里的 401 只会显示成一团 JSON，用户根本不知道要重登
    if (expMs !== null) {
        if (expiryTimer) clearTimeout(expiryTimer);
        expiryTimer = setTimeout(forceTopLogin, Math.max(1000, expMs - Date.now() - 30_000));
    }
}

/** 宿主登录态变化（登录/登出/换号）→ storage 事件跨文档广播，画布实时跟随 */
export function installUpstreamAuthBridge() {
    syncUpstreamAuthSession();
    window.addEventListener("storage", (event) => {
        if (event.key === "token" || event.key === null) syncUpstreamAuthSession();
    });
    // 兜底轮询：storage 事件只对「别的文档」触发改键，且计时器可能被浏览器节流；
    // 60 秒对一次宿主 token，过期/换号最终都会被收敛
    if (fallbackInterval === null) {
        fallbackInterval = setInterval(syncUpstreamAuthSession, 60_000);
    }
}
