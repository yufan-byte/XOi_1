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
    const { runUpstreamXoiHandoff, runUpstreamXoiImport } = await import("@/xoi/upstream-canvas-bridge");

    // 宿主主题广播跟随（App.vue initIframeTheme → xoi:theme）
    installThemeBridge();

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
    void runUpstreamXoiHandoff((path) => router.navigate(path));
}

void bootstrap();
