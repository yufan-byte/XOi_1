import { createHashRouter, Outlet } from "react-router-dom";

import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import DirectorPage from "@/pages/director";
import HomePage from "@/pages/home";
import NotFound from "@/pages/not-found";
import ImageWorkbenchPage from "@/pages/image";
import VideoWorkbenchPage from "@/pages/video";
import PromptsPage from "@/pages/prompts";

// hash 路由：本应用整体嵌在宿主 /atelier-canvas/index.html 的 iframe 里运行，
// browser 路由的深链刷新会 404 且破坏相对资源路径，hash 模式对嵌挂载最稳。
export const router = createHashRouter([
    {
        element: (
            <UserLayout>
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/director", element: <DirectorPage /> },
            { path: "/image", element: <ImageWorkbenchPage /> },
            { path: "/video", element: <VideoWorkbenchPage /> },
            { path: "/prompts", element: <PromptsPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
