import { createHashRouter, Outlet, useLocation, useRouteError } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import UserLayout from "@/layouts/user-layout";

// Notify the host after the current route has mounted, rather than at iframe DOM load.
function PageReady({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    useEffect(() => {
        window.parent.postMessage({ type: "xoi:canvas-route", editor: /^\/canvas\/[^/]+/.test(pathname), path: pathname }, window.location.origin);
        window.parent.postMessage({ type: "xoi:canvas-ready" }, window.location.origin);
    }, [pathname]);
    return <>{children}</>;
}


function RouteError() {
    const error = useRouteError();
    return <PageReady><div className="grid h-full place-content-center gap-4 p-6 text-center">
        <strong>画布页面暂时无法加载</strong>
        <p>{error instanceof Error ? error.message : "请刷新后重试"}</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
    </div></PageReady>;
}

function routePage(load: () => Promise<{ default: React.ComponentType }>) {
    return async () => {
        const { default: Page } = await load();
        return { Component: () => <PageReady><Page /></PageReady> };
    };
}

// Each workspace loads only when its route is opened. Media creation lives inside canvas nodes.
export const router = createHashRouter([
    {
        element: <UserLayout><Outlet /></UserLayout>,
        errorElement: <RouteError />,
        children: [
            { path: "/", lazy: routePage(() => import("@/pages/home")) },
            { path: "/assets", lazy: routePage(() => import("@/pages/assets")) },
            { path: "/canvas", lazy: routePage(() => import("@/pages/canvas")) },
            { path: "/canvas/:id", lazy: routePage(async () => {
                const [{ syncServerModels }, page] = await Promise.all([
                    import("@/xoi/server-models"), import("@/pages/canvas/project"),
                ]);
                // AI controls and pending handoffs must see the server's model config.
                void syncServerModels();
                return page;
            }) },
            { path: "/director", lazy: routePage(() => import("@/pages/director")) },
            { path: "/prompts", lazy: routePage(() => import("@/pages/prompts")) },
        ],
    },
    { path: "*", lazy: routePage(() => import("@/pages/not-found")) },
]);
