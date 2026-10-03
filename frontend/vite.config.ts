import { fileURLToPath, URL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { TDesignResolver } from "@tdesign-vue-next/auto-import-resolver";

const FRONTEND_DIR = fileURLToPath(new URL(".", import.meta.url));

/**
 * 开发态下的 /console/* SPA 回落。
 *
 * React 控制台（frontend/console）的产物放在 public/console，Vite 会自动伺服其中的
 * 静态文件；但 /console/login、/console/signup?ref=xxx 这类**深链**在 dev 下没有对应文件，
 * 会被 Vite 自身的 SPA 回落吃成主站的 index.html，结果路由跑到主站去、页面空白。
 *
 * 生产环境由后端 Express 兜（见 backend/src/app.ts 里的 /console 回落），这里补上 dev 那一半，
 * 让两边行为一致 —— 邀请链接 /console/signup?ref=xxx 在开发时也能直接刷新。
 *
 * 只拦「GET + /console 开头 + 不带扩展名」的请求，所以绝不会抢静态资源。
 */
function consoleSpaFallback(): Plugin {
  const indexFile = resolve(FRONTEND_DIR, "public/console/index.html");
  return {
    name: "xoi-console-spa-fallback",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const method = req.method || "GET";
        if (method !== "GET" && method !== "HEAD") return next();
        const path = (req.url || "").split("?")[0];
        if (!path.startsWith("/console")) return next();
        if (/\.[a-zA-Z0-9]+$/.test(path)) return next();
        if (!existsSync(indexFile)) return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(indexFile));
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    vue(),
    consoleSpaFallback(),
    AutoImport({
      dts: "src/types/auto-imports.d.ts",
      imports: ["vue", "pinia", "vue-router"],
      resolvers: [
        TDesignResolver({
          library: "vue-next",
        }),
        TDesignResolver({
          library: "chat",
        }),
      ],
    }),
    Components({
      dts: "src/types/components.d.ts",
      resolvers: [
        TDesignResolver({
          library: "vue-next",
        }),
        TDesignResolver({
          library: "chat",
        }),
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
  server: {
    port: 50188,
    proxy: {
      "/api": {
        target: "http://localhost:10588",
        changeOrigin: true,
      },
      "/oss": {
        target: "http://localhost:10588",
        changeOrigin: true,
      },
    },
  },
});
