import { StrictMode, Suspense, Component, lazy, useEffect, useRef, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import "./styles/globals.css";

import { AuthStage } from "@/components/signup/auth-stage";
import { hasSession, loadAuth } from "@/lib/api";
import { bootstrapConsoleSession } from "@/lib/session";
import { installSupportBridge } from "@/lib/support";
const AdminApp = lazy(() => import("@/components/reseller/admin-app"));
const AgentApplyPage = lazy(() => import("@/components/reseller/admin-routes").then(m => ({ default: m.AgentApplyPage })));
const TopupStandalone = lazy(() => import("@/components/shell/topup-standalone").then(m => ({ default: m.TopupStandalone })));
const UsageStandalone = lazy(() => import("@/components/shell/usage-standalone").then(m => ({ default: m.UsageStandalone })));
const TeamPage = lazy(() => import("@/components/team/team-page").then(m => ({ default: m.TeamPage })));

/**
 * 团队功能管理员闸门：批量建号/密码下发/Excel 导出属高危能力，只允许 XOi 管理员进入。
 * 双重校验：scope 来自服务端 /api/reseller/me（防本地角色残留伪造），role 来自登录态；
 * 任一不满足都重定向回控制台首页（未登录/无权限的最终处理由 /reseller/* 的 AdminGate 接管）。
 * 真正的拦截在后端 /api/team*（requireAdmin），这里只是避免普通用户看到一屏报错。
 */
function TeamAdminGate() {
    const me = useResellerMe();
    const isAdmin = (loadAuth()?.user.role ?? 0) >= 10;
    // scope 查询未落定时先等一等（否则 me.data 为 undefined 会误判成无权限，管理员也被弹走）
    if (!me.isSuccess && !me.isError) {
        return <ResellerShell><div className="grid h-dvh place-items-center text-sm text-muted-foreground">正在验证团队权限…</div></ResellerShell>;
    }
    const allowed = isAdmin && me.data?.scope === "platform";
    return allowed
        ? <ResellerShell><TeamPage embedded /></ResellerShell>
        : <Navigate to="/reseller/overview" replace />;
}
import { ResellerShell } from "@/components/reseller/shell";
import { useResellerMe } from "@/lib/reseller/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandProvider } from "@/components/shell/brand-provider";
import { ManagementAppearance } from "@/components/shell/management-appearance";
import { consumeLoginReturn, prepareLoginReturn } from "../../../shared/loginNavigation";

prepareLoginReturn();

/** 开发期兜底：路由树里任何未捕获异常都显示在页面上，避免整页黑屏难以排查 */
class CrashScreen extends Component<{ children: React.ReactNode }, { err: Error | null }> {
    state = { err: null as Error | null };
    static getDerivedStateFromError(err: Error) { return { err }; }
    componentDidCatch(err: Error) { console.error("[CrashScreen]", err); }
    render() {
        if (this.state.err) return import.meta.env.DEV
            ? <pre style={{ color: "var(--danger)", background: "var(--background)", minHeight: "100dvh", margin: 0, padding: 24, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 13 }}>{String(this.state.err.stack || this.state.err)}</pre>
            : <div role="alert" className="grid min-h-dvh place-content-center gap-4 bg-background p-6 text-center text-foreground"><h1 className="text-xl font-semibold">页面暂时未能打开</h1><p className="text-sm text-muted-foreground">请刷新重试，或返回登录页面。你的登录凭据不会显示在这里。</p><button className="mx-auto rounded-xl bg-primary px-5 py-2.5 text-sm text-primary-foreground" onClick={() => window.location.reload()}>重新加载</button><a className="text-sm text-primary" href="/console/login">返回登录</a></div>;
        return this.props.children;
    }
}

/**
 * XOi 控制台入口
 *
 * 承载：登录/注册页（造物同款，品牌换 XOi）+ 代理商中心后台（搬造物 /reseller/*，
 * 整套路由见 components/reseller/admin-routes.tsx，访问地址 /console/reseller/...）。
 */

const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

/** 主站地址：登录成功后跳回 Vue 主站；由后端或 nginx 托管时通常是根路径 */
const APP_HOME = import.meta.env.VITE_APP_HOME || "/";

function subscribePalette(notify: () => void) {
    const observer = new MutationObserver(notify);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
}
function ThemedToaster() {
    const theme = useSyncExternalStore<"dark" | "light">(subscribePalette, () => document.documentElement.classList.contains("dark") ? "dark" : "light", () => "light");
    return <Toaster position="top-center" theme={theme} richColors />;
}

// First paint is initialized in index.html; route changes are owned by ManagementAppearance.
// Embedded account-page transparency is CSS-scoped, never a persistent inline body style.

// 客服/反馈入口桥：造物靠整站 AppShell 接 mc:support，console 没有那个壳，
// 于是顶栏「联系客服」等按钮全都没反应 —— 这里统一接到主站的反馈表单。
installSupportBridge();

/**
 * 已经登录的人不该再看到登录页。
 * 带 ?stay=1 可强制停留（用来切换账号）。
 */
function LoggedInGateway({ children }: { children: React.ReactNode }) {
    const params = new URLSearchParams(window.location.search);
    const shouldRedirect = hasSession() && params.get("stay") !== "1" && params.get("expired") !== "1";
    const redirected = useRef(false);
    useEffect(() => {
        if (!shouldRedirect || redirected.current) return;
        redirected.current = true;
        const target = consumeLoginReturn();
        window.location.replace(target.startsWith("/console/") ? target : APP_HOME.replace(/\/$/, "") + target);
    }, [shouldRedirect]);
    if (shouldRedirect) return <div role="status" className="xoi-console-loading grid min-h-dvh place-items-center px-6 text-center text-sm">正在进入工作台…</div>;
    return <>{children}</>;
}

/**
 * Provider 层级照搬造物的 src/app/providers.tsx + 根 layout（QueryClient → Tooltip → Brand），
 * 只是这里没有 Next 的 app router，改用 BrowserRouter 承载。
 *
 * ⚠️ TooltipProvider 不能省：顶栏（components/shell/topbar.tsx）大量使用 <Tip>，
 * 它内部是 Radix 的 Tooltip.Root，缺 Provider 祖先会直接抛
 * 「Tooltip must be used within TooltipProvider」并让整页变成错误屏。
 * 造物把它放在 providers.tsx 里，所以单看组件本身发现不了这个依赖。
 *
 * BrandProvider 负责白标（品牌名 / 副标题 / 皮肤 class / 隐藏被禁用的模型）；
 * 它自己有完整的默认 context，缺了不会崩，但品牌会退回硬编码默认值、且代理侧白标配置不生效。
 */
const root = createRoot(document.getElementById("root")!);
// F3：先把会话信号补齐（老 token 迁移 / cookie 回填）再渲染。
// 否则 hasSession() 在第一帧就判定「未登录」，已登录用户会被闪到登录页。
void bootstrapConsoleSession().finally(() => root.render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            {/* CrashScreen 放在 Provider 之外、路由之内：Provider 自身出错也能看到堆栈，而不是一片黑屏 */}
            <CrashScreen>
                <TooltipProvider>
                    <BrandProvider>
                        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                            <Suspense fallback={<div role="status" className="xoi-console-loading grid min-h-dvh place-items-center px-6 text-center text-sm">正在打开工作台…</div>}>
                                <Routes>
                                  <Route element={<ManagementAppearance />}>
                                    <Route
                                        path="/login"
                                        element={
                                            <LoggedInGateway>
                                                <AuthStage variant="login" />
                                            </LoggedInGateway>
                                        }
                                    />
                                    <Route
                                        path="/signup"
                                        element={
                                            <LoggedInGateway>
                                                <AuthStage variant="signup" />
                                            </LoggedInGateway>
                                        }
                                    />
                                    {/* 独立充值落点页：主站「充值」按钮的目标。不走 AdminGate（普通用户也能充值），
                                        只要求登录态；复用造物 TopupDialog（new-api 支付/卡密） */}
                                    <Route path="/topup" element={<TopupStandalone />} />
                                    <Route path="/usage" element={<UsageStandalone />} />
                                    {/* 团队空间：仅管理员（批量下发密码属高危能力，2026-10-28 收紧）。
                                        /team 是「我的团队」列表（搜索+分页），/team/:teamId 是单个团队的独立工作区 */}
                                    <Route path="/team" element={<TeamAdminGate />} />
                                    <Route path="/team/:teamId" element={<TeamAdminGate />} />
                                    <Route path="/reseller/*" element={<AdminApp />} />
                                    <Route path="/agent-apply" element={<AgentApplyPage />} />
                                    {/* 根路径进后台首页：/console/ 若落进下面的通配登录页，已登录用户会被
                                        LoggedInGateway replace 回主站根 → Vue 路由兜底到 /#/project，
                                        表现为「点管理控制台却回到主站」。显式索引重定向由 AdminGate 接管鉴权 */}
                                    <Route path="/" element={<Navigate to="/reseller/overview" replace />} />
                                    {/* 未知路径落到登录页（邀请链接 /console/?ref=x 也能用） */}
                                    <Route path="*" element={<Navigate to="/login" replace />} />
                                  </Route>
                                </Routes>
                            </Suspense>
                        </BrowserRouter>
                    </BrandProvider>
                </TooltipProvider>
            </CrashScreen>
            <ThemedToaster />
        </QueryClientProvider>
    </StrictMode>,
));
