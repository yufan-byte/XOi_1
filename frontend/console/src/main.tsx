import { StrictMode, Suspense, Component } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import "./styles/globals.css";

import { AuthStage } from "@/components/signup/auth-stage";
import { hasSession } from "@/lib/api";
import { installSupportBridge } from "@/lib/support";
import { AdminGate, adminRoutes } from "@/components/reseller/admin-routes";
import { TopupStandalone } from "@/components/shell/topup-standalone";
import { UsageStandalone } from "@/components/shell/usage-standalone";
import { TeamPage } from "@/components/team/team-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandProvider } from "@/components/shell/brand-provider";

/** 开发期兜底：路由树里任何未捕获异常都显示在页面上，避免整页黑屏难以排查 */
class CrashScreen extends Component<{ children: React.ReactNode }, { err: Error | null }> {
    state = { err: null as Error | null };
    static getDerivedStateFromError(err: Error) { return { err }; }
    componentDidCatch(err: Error) { console.error("[CrashScreen]", err); }
    render() {
        if (this.state.err) return <pre style={{ color: "#ff8a8a", background: "#121016", padding: 24, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 13 }}>{String(this.state.err.stack || this.state.err)}</pre>;
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

/**
 * 嵌入态（`?embed=1`，主站用透明 iframe 内弹充值面板）必须先抹掉本页底色。
 *
 * 为什么：index.html 的 `<body class="bg-[#06070c] text-white">` 是**不透明近黑**，
 * 主站那侧虽然给 iframe 写了 `background: transparent`，但 iframe 是否透明取决于**被加载文档**的底色 ——
 * 于是浅色主题下会在弹窗周围露出一整块黑色圆角方框（2026-10-03 用户截图反馈的「黑框」）。
 * 这里在首帧渲染前把 html/body 底色置透明（inline style 优先级高于 Tailwind 类），
 * 遮罩与圆角完全交给宿主画。只对 embed 态生效，登录页/后台的暗色观感不受影响。
 */
if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1") {
    document.documentElement.classList.add("xoi-embed");
    document.body.classList.add("xoi-embed");
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.documentElement.style.setProperty("background-color", "transparent", "important");
    document.body.style.setProperty("background", "transparent", "important");
    document.body.style.setProperty("background-color", "transparent", "important");
    document.body.style.setProperty("background-image", "none", "important");
}

// 客服/反馈入口桥：造物靠整站 AppShell 接 mc:support，console 没有那个壳，
// 于是顶栏「联系客服」等按钮全都没反应 —— 这里统一接到主站的反馈表单。
installSupportBridge();

/**
 * 已经登录的人不该再看到登录页。
 * 带 ?stay=1 可强制停留（用来切换账号）。
 */
function LoggedInGateway({ children }: { children: React.ReactNode }) {
    const stay = new URLSearchParams(window.location.search).get("stay") === "1";
    if (hasSession() && !stay) {
        window.location.replace(APP_HOME);
        return null;
    }
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
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            {/* CrashScreen 放在 Provider 之外、路由之内：Provider 自身出错也能看到堆栈，而不是一片黑屏 */}
            <CrashScreen>
                <TooltipProvider>
                    <BrandProvider>
                        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                            <Suspense fallback={null}>
                                <Routes>
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
                                    <Route path="/team" element={<TeamPage />} />
                                    {/* 代理商中心（造物 reseller 全套）：adminRoutes 自带 /reseller 绝对路径与兜底段，
                                        AdminGate 作无路径布局路由做鉴权（未授权跳登录/申请页） */}
                                    <Route element={<AdminGate />}>{adminRoutes}</Route>
                                    {/* 根路径进后台首页：/console/ 若落进下面的通配登录页，已登录用户会被
                                        LoggedInGateway replace 回主站根 → Vue 路由兜底到 /#/project，
                                        表现为「点管理控制台却回到主站」。显式索引重定向由 AdminGate 接管鉴权 */}
                                    <Route path="/" element={<Navigate to="/reseller/overview" replace />} />
                                    {/* 未知路径落到登录页（邀请链接 /console/?ref=x 也能用） */}
                                    <Route path="*" element={<Navigate to="/login" replace />} />
                                </Routes>
                            </Suspense>
                        </BrowserRouter>
                    </BrandProvider>
                </TooltipProvider>
            </CrashScreen>
            {/* toast 主题跟随本机主题偏好（shims/next-themes 持久化在 localStorage("theme")），切换后刷新生效 */}
            <Toaster position="top-center" theme={((): "dark" | "light" => { try { return localStorage.getItem("theme") === "light" ? "light" : "dark"; } catch { return "dark"; } })()} richColors />
        </QueryClientProvider>
    </StrictMode>,
);
