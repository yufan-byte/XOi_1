import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 构建目标：`dist/`，之后整目录同步到 `public/monoform/`。
 *
 * base 必须是 './'：产物被 `public/monoform/index.html` 以相对路径加载，
 * 绝对路径会在 /console 之类的前缀下失效。
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  // 上游的静态资源（人物白模 5.3MB、品牌图）在 upstream/public 下，
  // 不指定的话默认只会找本项目根的 public/，产物里就会丢掉 models —— 场景一打开就 404。
  publicDir: 'upstream/public',
  server: { host: '127.0.0.1', port: 5201 },
  preview: { host: '127.0.0.1', port: 5201 },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 3D 引擎本身较大，上游也没有拆包诉求；这里只把警告阈值放宽，避免噪音
    chunkSizeWarningLimit: 1600,
  },
})
