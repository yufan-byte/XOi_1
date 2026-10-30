import { listFiles } from "./utils/listFiles";
import path from "path";
import { readFile, writeFile } from "fs/promises";
import crypto from "crypto";

function fileNameToRoutePath(fileName: string): string {
  let routePath = fileName.replace(/\.(ts)$/, "");
  routePath = routePath.split(path.sep).join("/");
  routePath = routePath.replace(/\[([^\]]+)\]/g, (_, p1: string) => (p1.startsWith("...") ? "*" : `:${p1}`));
  if (routePath === "index") return "/";
  routePath = routePath.replace(/\/index$/, "");
  routePath = "/" + routePath.replace(/\/+/g, "/").replace(/\/$/, "");
  return routePath;
}

type RouteModulePair = { routePath: string; varName: string; entry: string };

/**
 * 路由白名单（范围收敛后按造物方案确定）：只有列在这里的路由域会被挂载。
 * 用白名单而非排除列表——新增未经审查的路由文件不会自动暴露。
 * 规则形式（按 routes/ 下的相对路径前缀匹配）：
 *   - "project"                           保留整个域
 *   - "setting/skillManagement:read-only" 保留域，但**只挂"读"处理函数**
 *   - 未列出的域一律跳过（admin / pay / pointsConfig / vendorConfig / userManage 等）
 *
 * ⚠️ `:read-only` 不是按 HTTP 方法判定的，而是按**处理函数文件名**判定：
 *   本项目的读接口普遍写成 `router.post("/")`（如 setting/skillManagement/getSkillList），
 *   若按「只放行 GET」实现，会把真正需要的读接口一起打死（实测 404）。
 *   所以改用：文件名必须匹配 RE_READ_HANDLER（get / list / query / read / scan / fetch 开头）。
 *
 * 特例：reseller / agent / pricing 在 app.ts 显式挂载于全局 JWT 中间件之前，
 *       不进此白名单（生成器挂的同路径在中间件之后、永远轮不到，避免双挂载）。
 */
export const ROUTE_WHITELIST: string[] = [
  // 四个创作模块及其流水线
  "project",
  "novel",
  "script",
  "scriptAgent",
  "cornerScape",
  "assets",
  "assetsGenerate",
  "production",
  "task",
  "artStyle",
  "general",
  "common",
  "other",
  // 模型选择 / 智能体
  "modelSelect",
  "agents",
  "aiAssistant",
  // 独立 AI 一站式文档；所有读写仍位于全局账号鉴权之后。
  "one-stop",
  "one-stop-uploads",
  "model-health",
  // 按「线路」（new-api 渠道）统计的真实成功率：稳定/价格/速度优先排序要用
  "model-lines",
  // 画布（atelier 后端）
  "canvas",
  "canvas-files",
  // 设置：只保留创作页要用的读处理函数（写接口的管理 UI 已随造物方案下线）
  "setting/skillManagement:read-only",
  "setting/modelMap:read-only",
  "setting/agentDeploy:read-only",
  "setting/memoryConfig:read-only",
  "setting/dev:read-only",
  "setting/promptManage:read-only",
  // 登录与会话（new-api 凭据裁定 + JWT 签发 + self）
  "login",
  "user",
  // 统一身份端点：画布 owner 分桶依赖 GET /api/auth/me
  "auth",
  // 灵感广场与 Skill 市场（mc_* store 已在 lib/market/，路由层 P2/P3 补齐）
  "skills",
  "works",
  // 爆款复刻：抖音 / B站分享链解析与同源视频流代理
  "viral",
  // 消费记录（只读代理网关 /api/log/self 与 /stat，见 routes/log/self.ts）
  "log",
  // 团队版：成员、算力池、额度与团队消费记录
  "team",
  // 注：媒体通道 /api/media 不在这里 —— 它不挂鉴权，由 app.ts 前置挂载（lib/market/media-route.ts），
  // 若有 routes/media 文件被扫描生成反而会挂在 JWT 后形成误导性死条目。
];

/** 只读域里允许挂载的处理函数文件名（不含扩展名） */
const RE_READ_HANDLER = /^(get|list|query|read|scan|fetch)/i;

function matchWhitelist(routeKey: string): { allowed: boolean; readOnly: boolean } {
  const withoutExt = routeKey.replace(/\.ts$/, "");
  const baseName = withoutExt.split("/").pop() || "";
  for (const rule of ROUTE_WHITELIST) {
    const [prefix, mode] = rule.split(":");
    if (withoutExt === prefix || withoutExt.startsWith(prefix + "/")) {
      const readOnly = mode === "read-only";
      // 只读域：仅当处理函数名是"读"动词时才放行，写处理器（save*/update*/del*…）直接跳过
      if (readOnly && !RE_READ_HANDLER.test(baseName.replace(/\.[^.]+$/, ""))) {
        return { allowed: false, readOnly: true };
      }
      return { allowed: true, readOnly };
    }
  }
  return { allowed: false, readOnly: false };
}

export default async function generateRouter(): Promise<void> {
  // glob 得到 entries
  let entries: string[] = (await listFiles("src/routes", [".ts"])).map((file) => `src/routes/${file}`);
  // 排序
  entries = entries.sort((a, b) => a.localeCompare(b));

  const importLines: string[] = [];
  const routeModulePairs: RouteModulePair[] = [];

  entries.forEach((entry: string) => {
    const routeKey = path.relative("src/routes", entry).replace(/\\/g, "/");
    const { allowed } = matchWhitelist(routeKey);
    if (!allowed) return;
    const varName = `route${routeModulePairs.length + 1}`;
    let importPath = path.relative("src", entry).replace(/\\/g, "/");
    if (!importPath.startsWith(".")) importPath = "./" + importPath;
    importPath = importPath.replace(/\.ts$/, "");
    importLines.push(`import ${varName} from "${importPath}";`);
    const routePath = fileNameToRoutePath(routeKey);
    routeModulePairs.push({ routePath, varName, entry });
  });
  const routerData = JSON.stringify(routeModulePairs.map(({ routePath, varName }) => ({ routePath, varName })));
  const hash = crypto.createHash("md5").update(routerData).digest("hex");

  let content = `// @routes-hash ${hash}\nimport { Express } from "express";\n\n`;
  content += `${importLines.join("\n")}\n\n`;
  content += `export default async (app: Express) => {\n`;
  for (const { routePath, varName } of routeModulePairs) {
    content += `  app.use("/api${routePath}", ${varName});\n`;
  }
  content += `}\n`;

  let needWrite = true;
  try {
    const current = await readFile("src/router.ts", "utf8");
    const match = current.match(/^\/\/\s*@routes-hash\s*([a-z0-9]+)\n/);
    const currentHash = match ? match[1] : null;
    if (currentHash === hash) {
      needWrite = false;
    }
  } catch {
    needWrite = true;
  }
  if (needWrite) await writeFile("src/router.ts", content, "utf8");
}
