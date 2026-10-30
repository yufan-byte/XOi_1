/**
 * 上游画布登录态桥：把宿主(XOi)的会话信号同步进上游 user store。
 *
 * 【F3 语义变更】上游 store 里的 `token` 字段现在承载的是**非敏感会话信号**
 * （`uid:nonce`，见 xoi/owner.ts 的 getAuthToken），不再是一段 JWT：
 *   · 真正的凭据在后端下发的 httpOnly `xoi_session` cookie 里，同源请求自动携带；
 *   · 上游面向**供应商**的 Authorization 用的是渠道本地 Key（`config.apiKey`），
 *     与该字段无关，因此换成本地信号不影响生图/生视频链路；
 *   · 上游拿它当「账号是否切换」的比较基准与登录态标记，语义保持不变。
 *
 * 为什么仍要播种：上游 page 读的是**上游** use-user-store（persist 键
 * `infinite-canvas-auth-token-v1`）。不播种的话 store 永远是空 token，上游会把
 * 界面判成未登录。播进去的信号不含任何可用凭据，即使被读到也无法调接口。
 */

import { useUserStore as useUpstreamUserStore } from "@upstream/stores/use-user-store";
import { getAuthToken, getVerifiedToken } from "@/xoi/owner";

const UPSTREAM_AUTH_KEY = "infinite-canvas-auth-token-v1";

let fallbackInterval: ReturnType<typeof setInterval> | null = null;
let lastProfileRefresh = 0;

function refreshProfile(force = false) {
    const state = useUpstreamUserStore.getState();
    if ((!force && document.hidden) || state.isLoading || !state.token || state.token !== getVerifiedToken() || Date.now() - lastProfileRefresh < 30_000) return;
    lastProfileRefresh = Date.now();
    void state.hydrateUser();
}

/** 当前会话信号（不含凭据）。 */
function currentSignal(): string {
    return getAuthToken();
}

/** 登录态已失效：清干净画布侧会话，把**整个宿主页面**带去登录页（带 expired 标记出提示） */
function forceTopLogin() {
    try {
        // 会话信号与上游 persist 键都要清：主站路由守卫看的就是信号，
        // 留着它会把 /login 弹回 /#/，强制登出就落空了。
        localStorage.removeItem("xoi_session");
        localStorage.removeItem("token");
        localStorage.removeItem(UPSTREAM_AUTH_KEY);
    } catch {
        /* ignore */
    }
    useUpstreamUserStore.setState({ token: "", user: null, isReady: true });
    try {
        // iframe 同源，可以导航宿主顶层；主站 /login 会整页跳 /console/login
        (window.top ?? window).location.href = "/#/login?expired=1";
    } catch {
        window.location.href = "/#/login?expired=1";
    }
}

export function syncUpstreamAuthSession() {
    const signal = currentSignal();
    // store/IndexedDB 的 owner 在启动时固定；换号必须整页重建，不能只替换信号。
    if (!signal) {
        forceTopLogin();
        return;
    }
    if (signal !== getVerifiedToken()) {
        try { (window.top ?? window).location.reload(); }
        catch { window.location.reload(); }
        return;
    }
    const state = useUpstreamUserStore.getState();
    if (state.token === signal && state.isReady) return;
    try {
        localStorage.setItem(UPSTREAM_AUTH_KEY, signal);
    } catch {
        /* 忽略存储异常，state 仍会生效到本页 */
    }
    useUpstreamUserStore.setState({ token: signal, isReady: true });
}

/** 宿主登录态变化（登录/登出/换号）→ storage 事件跨文档广播，画布实时跟随 */
export function installUpstreamAuthBridge() {
    syncUpstreamAuthSession();
    refreshProfile(true);
    window.addEventListener("storage", (event) => {
        // xoi_session 是当前信号键；token 是迁移前的遗留键（升级当次仍可能被写入）。
        if (event.key === "xoi_session" || event.key === "token" || event.key === null) syncUpstreamAuthSession();
    });
    // 画布内任一后端请求返回 401（会话过期/被踢下线）→ 统一走强制登录
    window.addEventListener("xoi:session-expired", () => forceTopLogin());
    // 兜底轮询：storage 事件只对「别的文档」触发改键，且计时器可能被浏览器节流；
    // 切号后尽快清掉旧账号的内存 store。
    if (fallbackInterval === null) {
        fallbackInterval = setInterval(() => { syncUpstreamAuthSession(); refreshProfile(); }, 2_000);
    }
    window.addEventListener("focus", () => { syncUpstreamAuthSession(); refreshProfile(); });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) { syncUpstreamAuthSession(); refreshProfile(); }
    });
}
