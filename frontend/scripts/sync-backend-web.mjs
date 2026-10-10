/**
 * 把 Vite 生产产物同步到 Express 在 10588 实际托管的 data/web。
 *
 * 不删除目标目录：backend/data/web 还可能放站长热更的公告等运营文件；
 * Vite 资源自带内容哈希，旧 assets 留存不会被新 index.html 引用。
 */
import { access, cp, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const distDir = process.env.XOI_FRONTEND_DIST_DIR ? resolve(process.env.XOI_FRONTEND_DIST_DIR) : join(scriptsDir, "..", "dist");
const publicDir = join(scriptsDir, "..", "public");
const webDir = join(scriptsDir, "..", "..", "backend", "data", "web");

await access(join(distDir, "index.html"));
await mkdir(webDir, { recursive: true });

for (const entry of await readdir(distDir)) {
  await cp(join(distDir, entry), join(webDir, entry), {
    recursive: true,
    force: true,
  });
}

// Atelier 和 React 控制台各自是独立 Vite 应用，产物直接写入 frontend/public/。
// 主站随后构建时不会可靠地把 public/ 下这两个嵌套应用重新搬进 dist/，
// 同时同步 MONOFORM 的账号启动校验；避免 10588 使用旧控制台、画布或白模入口。
for (const entry of ["atelier-canvas", "console", "monoform"]) {
  await access(join(publicDir, entry, "index.html"));
  await cp(join(publicDir, entry), join(webDir, entry), {
    recursive: true,
    force: true,
  });
}

console.log(`✅ 10588 静态站已更新：${webDir}`);
