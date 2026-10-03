import esbuild from "esbuild";
import fs from "fs";
import path from "path";

// 打包默认使用 prod 环境变量
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "prod";
}

const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));

const external = [
  "@huggingface/transformers",
  "onnxruntime-node",
  "vm2",
  "sqlite3",
  "better-sqlite3",
  "sharp",
  "mysql",
  "mysql2",
  "pg",
  "pg-query-stream",
  "oracledb",
  "tedious",
  "mssql",
];

// 后端服务打包配置
const appBuildConfig: esbuild.BuildOptions = {
  entryPoints: ["src/app.ts"],
  bundle: true,
  minify: false,
  format: "cjs",
  allowOverwrite: true,
  outfile: `data/serve/app.js`,
  platform: "node",
  target: "esnext",
  tsconfig: "./tsconfig.json",
  alias: {
    "@": "./src",
  },
  sourcemap: false,
  external,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
};

(async () => {
  try {
    console.log("🔨 开始构建...\n");

    // ⚠️ 必须先生成 src/router.ts，否则下面 esbuild 解析不到 `@/router` 直接报错。
    //
    // 背景：router.ts 是**生成文件** —— src/core.ts 的 generateRouter() 扫
    // src/routes/**/*.ts 写出来的（带 `// @routes-hash` 头），所以它在
    // backend/.gitignore 里被忽略、不会进仓库。而 app.ts 里那句
    //     if (process.env.NODE_ENV == "dev") await buildRoute();
    // 意味着 **prod 打包路径永远不会生成它**。
    //
    // 于是干净 clone 上跑 `yarn build`（Dockerfile 第 49 行就是这么干的）必然失败：
    //     ✘ [ERROR] Could not resolve "./src/router" (originally "@/router")
    // 本地之所以没事，只是因为 src/router.ts 是上次 `npm run dev` 留下的残留文件。
    //
    // 顺带好处：新增路由（比如 src/routes/reseller/*.ts）不需要手改 router.ts，
    // 这里每次打包都会重新扫描生成。
    const { default: generateRouter } = await import("../src/core");
    await generateRouter();
    console.log("🧭 路由表已生成: src/router.ts");

    await esbuild.build(appBuildConfig);

    console.log("✅ 后端服务构建完成: data/serve/app.js");
    console.log("\n🎉 所有构建任务完成!\n");
  } catch (err) {
    console.error("❌ 构建失败:", err);
    process.exit(1);
  }
})();
