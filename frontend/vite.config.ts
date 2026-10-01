import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { TDesignResolver } from "@tdesign-vue-next/auto-import-resolver";

export default defineConfig({
  base: "./",
  plugins: [
    vue(),
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
