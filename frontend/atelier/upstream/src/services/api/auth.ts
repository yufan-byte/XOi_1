import { apiGet, apiPost } from "@/services/api/request";

export const AUTH_TOKEN_KEY = "infinite-canvas-auth-token-v1";

export type UserRole = "guest" | "user" | "admin";

export type AuthUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role: UserRole;
    credits: number;
    createdAt: string;
    updatedAt: string;
};

export type AuthSession = {
    token: string;
    user: AuthUser;
};

export type AuthPayload = {
    username: string;
    password: string;
};

export async function login(payload: AuthPayload) {
    return apiPost<AuthSession>("/api/auth/login", payload);
}

export async function register(payload: AuthPayload) {
    return apiPost<AuthSession>("/api/auth/register", payload);
}

export async function fetchCurrentUser(token?: string) {
    // XOi 身份端点返回扁平 AuthUser（同时兼容宿主 owner 字段），不是通用 code/data 外壳。
    // 把它交给 apiGet 会把每次成功的额度刷新当失败，并清掉有效登录态。
    // F3：凭据在 httpOnly cookie 里，同源请求自动携带 —— 传进来的 token 只是账号信号，不再拼 header。
    void token;
    const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.message || payload.msg || "身份读取失败"), { status: response.status });
    const user = payload.code === 0 ? payload.data : payload;
    if (!user?.id || !["user", "admin", "guest"].includes(user.role)) throw new Error("身份接口返回格式异常");
    return user as AuthUser;
}
