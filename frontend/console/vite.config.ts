import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * XOi 控制台（登录页 / 后续管理后台）
 *
 * 构建方式与 atelier 一致：产物直接写进宿主的 public 目录，
 * 由宿主（Vue + Express 静态托管）挂在 /console/ 下。
 */
export default defineConfig({
    // 有子路由（/console/login、/console/signup?ref=xxx，邀请链接会直接分享出去），
    // 所以必须用绝对 base，并配合后端 /console/* 的 SPA fallback。
    base: process.env.VITE_BASE || "/console/",
    plugins: [react()],
    resolve: {
        dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
        alias: {
            "@": resolve(appDir, "src"),
            // 从造物源码原样拷过来的组件里还有 next/* 的 import，
            // 这里用 shim 兜住，避免为了 3 个文件去改上游代码。
            "next/navigation": resolve(appDir, "src/shims/next-navigation.ts"),
            "next/dynamic": resolve(appDir, "src/shims/next-dynamic.tsx"),
            "next/link": resolve(appDir, "src/shims/next-link.tsx"),
            "next-themes": resolve(appDir, "src/shims/next-themes.tsx"),
        },
    },
    server: {
        proxy: {
            // ⚠️ 顺序有讲究：`/api/media` 必须排在 `/api` 前面，否则会被 `/api` 抢走。
            // 作品展映的封面/视频走造物的媒体接口（/api/media/x/<id>），
            // 本地测试时转发到造物自己的服务上（默认 http://127.0.0.1:3000）。
            "/api/media": { target: process.env.XOI_MEDIA_TARGET || "http://127.0.0.1:3000", changeOrigin: true },
            // 其余接口是本项目的后端（XOi Express，或 ops/dev-mock-api.mjs 假后端）
            "/api": { target: process.env.XOI_API_TARGET || "http://127.0.0.1:12121", changeOrigin: true },
            "/oss": { target: process.env.XOI_API_TARGET || "http://127.0.0.1:12121", changeOrigin: true },
        },
    },
    preview: {
        // 预览生产构建时同样代理，方便对着真实契约做端到端点击验证
        proxy: {
            "/api/media": { target: process.env.XOI_MEDIA_TARGET || "http://127.0.0.1:3000", changeOrigin: true },
            "/api": { target: process.env.XOI_API_TARGET || "http://127.0.0.1:12121", changeOrigin: true },
        },
    },
    build: {
        outDir: resolve(appDir, "../public/console"),
        emptyOutDir: true,
    },
});
