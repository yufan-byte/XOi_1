import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";

import { initOwner } from "@/xoi/owner";
import axios from "axios";
import { message } from "antd";
window.addEventListener("xoi:canvas-save-conflict",()=>message.error("画布已在其他页面更新，本机修改仍保留，请重新打开核对"));
import { authorizeModelCall, installBillingFetchGuard, modelCallSubmitted } from "../../src/utils/billingGate";
import { billableOperation } from "../../../shared/billableOperations";
installBillingFetchGuard();
axios.interceptors.request.use(async config => {
    const url = new URL(config.url || "", window.location.href);
    if (url.origin === window.location.origin && billableOperation(url.pathname, config.method || "GET")) {
        const ticket = await authorizeModelCall(url.pathname, config.data, config.signal as AbortSignal | undefined);
        (config as any).billingTicket = ticket;
        if (ticket) config.headers.set("X-Xoi-Billing-Id", ticket.id);
    }
    return config;
});
axios.interceptors.response.use(response => { modelCallSubmitted((response.config as any)?.billingTicket); return response; }, error => { modelCallSubmitted(error.config?.billingTicket, true); return Promise.reject(error); });

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

// 先解析宿主登录身份（按用户分桶的存储键依赖它），再加载完整模块图：
// 所有 store 模块都在动态 import 的子图里，key 常量求值时 owner 已就绪。
async function bootstrap() {
    const runtimeReady = Promise.all([import("react"), import("react-dom/client"), import("react-router-dom"), import("@/i18n")]);
    await Promise.all([initOwner(), runtimeReady]);
    const [{ AppProviders }, { router }, React, { createRoot }, { RouterProvider }] = await Promise.all([
        import("@/components/layout/app-providers"),
        import("@/router"),
        import("react"),
        import("react-dom/client"),
        import("react-router-dom"),
    ]);
    const [{ installUpstreamAuthBridge }, { syncServerModels }] = await Promise.all([
        import("@/xoi/upstream-auth-bridge"), import("@/xoi/server-models"),
    ]);
    installUpstreamAuthBridge();
    // Configuration sync continues in the background while the project list renders.
    void syncServerModels();
    const params = new URLSearchParams(window.location.search);
    const AssetPicker = params.get("view") === "asset-picker"
        ? (await import("@/xoi/asset-picker-bridge")).XoiAssetPickerBridge : null;


    // 宿主首页的“资产”入口直接打开画布内置资产页，复用画布已经收集的图片/视频资源。
    if (new URLSearchParams(window.location.search).get("view") === "assets") {
        window.setTimeout(() => router.navigate("/assets"), 0);
    }

    // Explicit entries are consumed before mounting the project center, avoiding a center-page flash.
    const runEntry=async()=>{
        const bridge=await import("@/xoi/upstream-canvas-bridge");
        const navigate=(path:string)=>router.navigate(path);
        await bridge.runUpstreamXoiImport(navigate);
        await bridge.runUpstreamXoiNewCanvas(navigate);
        await bridge.runUpstreamXoiGraphImport(navigate);
        await bridge.runUpstreamXoiHandoff(navigate);
    };
    if(params.get('source')==='xoi'&&['import','new','graph','handoff'].some(key=>params.has(key)))await runEntry();
    let entryRunning=false;
    window.addEventListener('message',async event=>{
        if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='xoi:canvas-entry'||entryRunning)return;
        const incoming=new URLSearchParams(String(event.data.query||''));
        const projectId=/^[A-Za-z0-9_-]+$/.test(incoming.get('id')||'')?incoming.get('id'):null;
        const guidedEntry=incoming.get('source')==='xoi'&&['import','new','graph','handoff'].some(key=>incoming.has(key));
        if(!projectId&&!guidedEntry)return;
        entryRunning=true;
        try{
            if(projectId&&!guidedEntry){
                const currentId=/^\/canvas\/([A-Za-z0-9_-]+)$/.exec(router.state.location.pathname)?.[1];
                if(currentId!==projectId){
                    if(currentId){const {flushCanvasBeforeExit}=await import('@upstream/app/(user)/canvas/stores/use-canvas-store');await flushCanvasBeforeExit(currentId);}
                    history.replaceState({},'',location.pathname+'?id='+projectId+location.hash);
                    await router.navigate('/canvas/'+projectId);
                }
            }else{history.replaceState({},'',location.pathname+'?'+incoming+location.hash);await runEntry();}
        }
        catch(e){message.error(e instanceof Error?e.message:'画布入口处理失败，原内容保留');parent.postMessage({type:'xoi:canvas-ready'},location.origin);}
        finally{entryRunning=false;parent.postMessage({type:"xoi:canvas-ready"},location.origin);}
    });
    createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
            <AppProviders>
                <>
                    <RouterProvider router={router} />
                    {AssetPicker ? <AssetPicker /> : null}
                </>
            </AppProviders>
        </React.StrictMode>,
    );

    // Warm only the editor module; this does not create projects or call models.
    if(!params.has('view'))void import('@/pages/canvas/project');


}

void bootstrap().catch((error: unknown) => {
    const root = document.getElementById("root");
    if (!root) return;
    root.replaceChildren();
    const panel = document.createElement("div");
    panel.style.cssText = "min-height:100vh;display:grid;place-content:center;gap:16px;text-align:center;color:#34302d;background:#faf9f7;font:16px PingFang SC, sans-serif";
    const title = document.createElement("strong");
    title.textContent = "暂时无法打开无限画布";
    const detail = document.createElement("span");
    detail.textContent = error instanceof Error ? error.message : "请确认登录状态后重试";
    const retry = document.createElement("button");
    retry.textContent = "重新验证";
    retry.style.cssText = "padding:10px 18px;border:1px solid #dedbd7;border-radius:10px;background:white;cursor:pointer";
    retry.onclick = () => window.location.reload();
    panel.append(title, detail, retry);
    root.append(panel);
    window.parent.postMessage({ type: "xoi:canvas-ready" }, window.location.origin);
});
