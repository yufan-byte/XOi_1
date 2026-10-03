import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";

import { initOwner } from "@/xoi/owner";

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

// 先解析宿主登录身份（按用户分桶的存储键依赖它），再加载完整模块图：
// 所有 store 模块都在动态 import 的子图里，key 常量求值时 owner 已就绪。
async function bootstrap() {
    await initOwner();
    await import("@/i18n");
    const [{ AppProviders }, { router }, { XoiAssetPickerBridge }, React, { createRoot }, { RouterProvider }] = await Promise.all([
        import("@/components/layout/app-providers"),
        import("@/router"),
        import("@/xoi/asset-picker-bridge"),
        import("react"),
        import("react-dom/client"),
        import("react-router-dom"),
    ]);
    const { installThemeBridge } = await import("@/xoi/bridge");
    // 宿主 JWT → 上游 user store（画布 AI 请求的 Authorization 来源），须在任何画布请求前播种
    const { installUpstreamAuthBridge } = await import("@/xoi/upstream-auth-bridge");
    const { runUpstreamXoiGraphImport, runUpstreamXoiHandoff, runUpstreamXoiImport, runUpstreamXoiNewCanvas } = await import("@/xoi/upstream-canvas-bridge");

    // 宿主主题广播跟随（App.vue initIframeTheme → xoi:theme）
    installThemeBridge();
    installUpstreamAuthBridge();

    createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
            <AppProviders>
                <>
                    <RouterProvider router={router} />
                    <XoiAssetPickerBridge />
                </>
            </AppProviders>
        </React.StrictMode>,
    );

    // 宿主首页的“资产”入口直接打开画布内置资产页，复用画布已经收集的图片/视频资源。
    if (new URLSearchParams(window.location.search).get("view") === "assets") {
        window.setTimeout(() => router.navigate("/assets"), 0);
    }

    // 角景/资产「发送到画布」入口引导：建画布 + 导入图片节点 + 跳转打开
    // 放在 render 之后跑（内部自等 store 水合），不阻塞首屏
    void runUpstreamXoiImport((path) => router.navigate(path));
    // 宿主侧栏「新建画布」一键直达：?new=1 建空白项目直接进编辑器
    void runUpstreamXoiNewCanvas((path) => router.navigate(path));
    // 灵感广场画布作品「免费复刻同款」：还原完整工作流骨架 + 提示词预填
    void runUpstreamXoiGraphImport((path) => router.navigate(path));
    // Agent 对话的「画布入口」handoff：带入提示词/技能/附件建项目
    void runUpstreamXoiHandoff((path) => router.navigate(path));
}

void bootstrap();
