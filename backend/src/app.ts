// import "./logger";
import "./err";
import "./env";

/* ---------------------------------------------------------------------
 * 代理环境变量免疫：后端要直连上游供应商（agnes 等）与本机 new-api，
 * 任何 HTTP(S) 代理注入都会把 https 请求降级成明文打到 443 端口
 * （报「plain HTTP request was sent to HTTPS port」或莫名其妙的
 * 「Invalid token」）。WorkBuddy 等沙箱会给子进程透明注入代理变量，
 * env -u 拦不住，只能在进程入口自己删掉。若部署环境确需代理，
 * 请在 axios 层显式配置，不要走环境变量。
 * ------------------------------------------------------------------ */
for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"]) {
  delete process.env[k];
}

import { mediaStatic } from "@/middleware/mediaStatic";
import express, { Request, Response, NextFunction } from "express";
import { Server } from "socket.io";
import http from "node:http";
import expressWs from "express-ws";
import logger from "morgan";
import cors from "cors";
import buildRoute from "@/core";
import path from "path";
import fs from "fs";
import u from "@/utils";
import { resolveIdentity } from "@/utils/authIdentity";
import { requireAdmin } from "@/middleware/requireAdmin";
import socketInit from "@/socket/index";
import { ensureThumbnail, ThumbnailSize } from "@/utils/image";
import adminOrders from "@/routes/admin/orders";
import adminTasks from "@/routes/admin/tasks";
import adminBilling from "@/routes/admin/billing";
import adminSettings from "@/routes/admin/settings";
import adminAnnouncements from "@/routes/admin/announcements";
import adminGateway from "@/routes/admin/gateway";
import adminCredits from "@/routes/admin/credits";
import { getPlatformPolicy } from "@/utils/platformPolicy";
import { db, dbReady } from "@/utils/db";
import { rateLimiter } from "@/middleware/rateLimiter";
import { runWithGatewayUser } from "@/lib/gateway/context";
import { loadAuthUser } from "@/utils/loadAuthUser";
import { createResourceLoader } from "@/utils/resourceAccess";
import { resourceScope } from "@/middleware/resourceScope";

const app = express();
app.disable("x-powered-by");
if (process.env.XOI_TRUST_PROXY) app.set("trust proxy", process.env.XOI_TRUST_PROXY.split(",").map((value) => value.trim()));
const server = http.createServer(app);
const generationLimiter = rateLimiter({ windowMs: 60000, max: 60, keyGenerator: (req) => String((req as any).user?.id || req.ip) });
const thumbnailLimiter = rateLimiter({ windowMs: 60000, max: 120 });
let thumbnailsInFlight = 0;

export default async function startServe(randomPort: Boolean = false) {
  await dbReady;
  await u.writeVersion();
  const io = new Server(server, { cors: { origin: "*" } });
  socketInit(io);

  if (process.env.NODE_ENV == "dev") await buildRoute();

  expressWs(app);

  app.use(logger("dev"));
  const allowedOrigins = (process.env.XOI_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: false,
    }),
  );

  // HTTP 安全头（手动实现，无需安装 helmet）
  app.use((req, res, next) => {
    // 防止点击劫持。必须是 SAMEORIGIN 而不是 DENY：
    // 「无限创意画布」是本站自己用同源 iframe 嵌 /atelier-canvas/index.html 加载的
    // （见 frontend/src/views/canvas/index.vue），DENY 会把同源 iframe 也一起挡掉，
    // 表现为画布里显示「127.0.0.1 refused to connect」。
    // SAMEORIGIN 对跨源点击劫持的保护与 DENY 完全一致，只是额外放通自己站内嵌自己。
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    // 防止 MIME 类型嗅探
    res.setHeader("X-Content-Type-Options", "nosniff");
    // XSS 防护（旧浏览器）
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // 阻止浏览器猜测 favicon
    res.setHeader("X-Download-Options", "noopen");
    // 控制 Referrer 信息
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // 权限策略：禁用敏感浏览器特性
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  // 微信 v3 回调验签要求比对「请求体原始字节」，这里在解析的同时保留副本，
  // 仅对支付回调子路径生效避免全局内存开销
  const capturePayRawBody = (req: any, _res: any, buf: Buffer | undefined): boolean => {
    try {
      if (typeof req.url === "string" && req.url.startsWith("/api/pay/callback")) {
        (req as any)._rawBodyText = buf ? buf.toString("utf8") : "";
      }
    } catch {}
    return true;
  };
  app.use(["/api/admin", "/api/setting/vendorConfig", "/api/login"], express.json({ limit: "1mb" }));
  app.use(express.json({ limit: process.env.XOI_JSON_LIMIT || "25mb", verify: capturePayRawBody }));
  app.use(express.urlencoded({ extended: true, limit: process.env.XOI_FORM_LIMIT || "2mb", verify: capturePayRawBody }));

  // 容器编排探针：liveness 不依赖外部服务，readiness 同时验证共享 PG 与 NewAPI。
  app.get("/api/healthz", (_req, res) => res.status(200).json({ status: "ok" }));
  app.get("/api/readyz", async (_req, res) => {
    try {
      await db.raw("select 1");
      const gatewayRoot = String(process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000")
        .trim().replace(/\/+$/, "").replace(/\/v\d+$/, "");
      const upstream = await fetch(`${gatewayRoot}/api/status`, { signal: AbortSignal.timeout(5000) });
      if (!upstream.ok) throw new Error(`gateway HTTP ${upstream.status}`);
      return res.status(200).json({ status: "ready" });
    } catch (e) {
      console.error("[readyz]", e instanceof Error ? e.message : e);
      return res.status(503).json({ status: "not_ready" });
    }
  });

  // oss 静态资源
  const ossDir = u.getPath("oss");
  if (!fs.existsSync(ossDir)) {
    fs.mkdirSync(ossDir, { recursive: true });
  }
  console.log("文件目录:", ossDir);
  app.use(
    "/oss",
    (req, res, next) => req.query.size ? thumbnailLimiter(req, res, next) : next(),
    (req, res, next) => {
      // Uploaded media is never an executable same-origin document (including legacy SVG files).
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      // 如果传参 type=small，则返回小图
      if (req.query.size) {
        const size = req.query.size as string;
        const smallImageBaseDir = path.join(ossDir, "smallImage");
        let decodedPath: string;
        try { decodedPath = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
        const originalPath = path.resolve(ossDir, `.${decodedPath}`);
        if (!originalPath.startsWith(`${path.resolve(ossDir)}${path.sep}`)) return res.status(403).end();

        // 解析 size 参数
        let sizeSubDir: string;
        let sizeOpts: ThumbnailSize | undefined;

        // 判断是否为 WIDTHxHEIGHT 格式，如 "200x300"：等比压缩到指定宽高边界
        const dimensMatch = size.match(/^(\d+)x(\d+)$/i);
        // 判断是否为百分比格式，如 "30"、"30%"：等比压缩到原图的指定百分比
        const percentMatch = size.match(/^(\d+(?:\.\d+)?)\s*%?$/);

        if (dimensMatch) {
          const w = parseInt(dimensMatch[1], 10);
          const h = parseInt(dimensMatch[2], 10);
          if (w < 1 || h < 1 || w > 2048 || h > 2048) return res.status(400).json({ message: "缩略图尺寸范围为 1~2048" });
          const width = Math.ceil(w / 64) * 64, height = Math.ceil(h / 64) * 64;
          sizeSubDir = `${width}x${height}`;
          sizeOpts = { type: "dimensions", width, height };
        } else if (percentMatch) {
          const pct = parseFloat(percentMatch[1]);
          if (!Number.isFinite(pct) || pct < 1 || pct > 100) return res.status(400).json({ message: "缩略图比例范围为 1~100" });
          const percentage = Math.ceil(pct / 10) * 10;
          sizeSubDir = `${percentage}p`;
          sizeOpts = { type: "percentage", value: percentage };
        } else {
          // 无效的 size 参数，降级返回原图
          express.static(ossDir, { acceptRanges: false })(req, res, next);
          return;
        }

        const ext = path.extname(decodedPath);
        const base = path.basename(decodedPath, ext);
        const dir = path.dirname(decodedPath);
        const smallImagePath = path.join(smallImageBaseDir, dir, `${base}_${sizeSubDir}${ext}`);
        if (!smallImagePath.startsWith(`${path.resolve(smallImageBaseDir)}${path.sep}`)) return res.status(403).end();

        if (thumbnailsInFlight >= 8) return res.status(429).json({ message: "缩略图处理繁忙，请稍后重试" });
        thumbnailsInFlight++;
        ensureThumbnail(originalPath, smallImagePath, sizeOpts).then((thumbnailPath) => {
          if (thumbnailPath) {
            res.sendFile(thumbnailPath);
          } else {
            // 缩略图生成失败，降级返回原图
            express.static(ossDir, { acceptRanges: false })(req, res, next);
          }
        }).catch(next).finally(() => { thumbnailsInFlight--; });
        return;
      }
      return next();
    },
    mediaStatic(ossDir),
  );
  // skills 静态资源
  const skillsDir = u.getPath("skills");
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }
  console.log("文件目录:", skillsDir);
  // 只允许图片文件访问
  app.use(
    "/skills",
    (req, res, next) => {
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      /\.(jpe?g|png|gif|webp|svg|ico|bmp|mp4|webm)$/i.test(req.path) ? next() : res.status(403).end();
    },
    express.static(skillsDir, { acceptRanges: false }),
  );

  // assets 静态资源
  const assetsDir = u.getPath("assets");
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  console.log("文件目录:", assetsDir);
  app.use("/assets", express.static(assetsDir, { acceptRanges: false }));

  // data/web 静态网站
  const webDir = u.getPath("web");
  if (!fs.existsSync(webDir)) {
    fs.mkdirSync(webDir, { recursive: true });
  }
  console.log("静态网站目录:", webDir);
  app.use(express.static(webDir, {
    acceptRanges: false,
    setHeaders(res, filePath) {
      // HTML 是哈希静态资源的入口，必须每次向服务端确认版本；
      // 否则同步新产物后，长时间打开的 10588 标签仍可能引用旧 chunk。
      if (/\.html$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return;
      }
      // Vite 产物带内容哈希，文件名变即是新版，可安全长缓存。
      if (/[/\\]assets[/\\]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // React 控制台（登录/注册，即 frontend/console 的构建产物）的 SPA 回落。
  // 它有真实子路由（/console/login、/console/signup?ref=xxx —— 邀请链接会直接分享出去），
  // 刷新或直接打开深链时静态中间件找不到文件，需要把 index.html 交给前端路由处理。
  // 必须放在下面的 JWT 鉴权中间件之前：登录页本身就是在「未登录」状态下访问的。
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!/^\/console(\/|$)/.test(req.path)) return next();
    // 带扩展名的请求是真静态资源（js/css/图片），交给上一步的 static 或最终 404
    if (/\.[a-zA-Z0-9]+$/.test(req.path)) return next();
    const consoleIndex = path.join(webDir, "console", "index.html");
    if (!fs.existsSync(consoleIndex)) return next();
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.sendFile(consoleIndex);
  });

  // 代理商中心（站长后台，搬自造物 /api/reseller/*）。自带 new-api JWT 透传鉴权，
  // 必须挂在下面的全局 XOi JWT 中间件之前 —— 两套身份体系，互不替代。
  const resellerRouter = (await import("@/routes/reseller")).default;
  app.use("/api/reseller", resellerRouter);

  // 站内「代理」端点（搬自造物 /api/agent/*）：申请成为代理、报价系数、按需签证书问询。
  // 同样自带 JWT 鉴权（lib/reseller/auth），也必须放在全局 XOi JWT 中间件之前。
  const agentRouter = (await import("@/routes/agent")).default;
  app.use("/api/agent", agentRouter);

  // 模型价格表（搬自造物：那边由 new-api 直接提供）。控制台的 getPricing() 是**不带鉴权头**的
  // 裸 fetch，所以这里必须挂在全局 JWT 中间件之前。与 reseller/agent 一样，src/core.ts 也会把
  // routes/pricing.ts 自动挂到同一路径，但那条在本条之后、永远轮不到 —— 保持与既有两个 Router
  // 相同的写法，不去动生成器的规则。
  const pricingRouter = (await import("@/routes/pricing")).default;
  app.use("/api/pricing", pricingRouter);

  // 灵感广场媒体外链本地化（external-media-map.json → 上游缓存）。不挂鉴权（造物同款，
  // 靠随机 id 保密，瀑布流几十张图不应各带一次鉴权），所以也必须挂在全局 JWT 中间件之前。
  const mediaRouter = (await import("@/lib/market/media-route")).default;
  app.use("/api/media", await mediaRouter());

  // 代理体系的两个后台任务：
  //   ① 启动即建 mc_agents / mc_agent_customers / mc_agent_codes / mc_agent_withdrawals 四张表
  //      （它们是 new-api 库里的表，不归 initDB 管，所以由 agent-store 自己 ensure）；
  //   ② 每 10 分钟重算一次网关的「分组专属倍率」GroupGroupRatio（线路分组会随上游新增）。
  // 放在 listen 之前但**不 await**：库连不上时不应该拖着整个服务起不来，
  // agent-store 内部会把错误记成日志，功能降级为「代理商中心不可用」，其余接口照常。
  void (async () => {
    try {
      const store = await import("@/lib/agent/store");
      await store.ensureAgentTables();
      store.startAgentSweeper();
      console.log("[agent] 代理体系已就绪（4 张 mc_* 表 + 倍率定时同步）");
    } catch (e) {
      console.error("[agent] 代理体系初始化失败（代理商中心将不可用）:", (e as Error).message);
    }
  })();

  // 团队算力池：建表后每分钟按成员周期额度结算。不 await，失败不影响创作主链路启动。
  void (async () => {
    try {
      const team = await import("@/lib/team/store");
      await team.ensureTeamTables();
      team.startTeamSweeper();
      console.log("[team] 团队模式已就绪（成员 + 算力池 + 周期额度）");
    } catch (error) {
      console.error("[team] 团队模式初始化失败：", (error as Error).message);
    }
  })();

  app.use(async (req, res, next) => {
    const setting = await u.db("o_setting").where("key", "tokenKey").select("value").first();
    if (!setting) return res.status(444).send({ message: "服务器秘钥未配置，请联系管理员" });
    const { value: tokenKey } = setting;
    // 仅从 header 获取 token（URL 传递 token 会导致泄露风险）
    const rawToken = req.headers.authorization || "";
    const token = rawToken.replace("Bearer ", "");
    // 白名单路径
    if (
      req.path === "/api/login/login" ||
      req.path === "/api/login/register" ||
      req.path === "/api/login/captcha" ||
      // 健康检查：供 docker-compose healthcheck / 负载均衡探活，必须在鉴权前放行
      req.path === "/api/healthz" ||
      req.path === "/api/readyz" ||
      // 爆款复刻的视频元素无法附带 Authorization；该地址自身带 2 小时 HMAC 签名，
      // 只放行读取流，分享链解析 /resolve 仍必须经过登录鉴权。
      (req.method === "GET" && req.path === "/api/viral/proxy")
    )
      return next();
    // 公开取码端点 /api/login/captcha 同列入白名单 ── 前端「换一张」刷新钮于未登录态拉取新鲜 SVG 必经此处,
    // 若被拦死则处于需验码态的用户无法自主换码陷入死锁体验崩坏。
    // 支付异步回调：无 JWT 但渠道内部自行验签防伪造，放行走路由层把关
    if (/^\/api\/pay\/callback\/.+/.test(req.path)) return next();
    // Static assets are already served above; API authentication must never depend on an extension.
    // 其余接口一律要求认证（含画布 /api/config、/api/workflows、/api/canvas-*、AI 生成等），
    // 画布端由 auth-bridge.js 自动附加 JWT，避免匿名用户消耗 API/积分预算

    if (!token) return res.status(401).send({ message: "未提供token" });
    try {
      const userInfo = await resolveIdentity(token, tokenKey as string, loadAuthUser);
      (req as any).user = userInfo;
      if (userInfo.role !== "admin" && !["GET", "HEAD"].includes(req.method) &&
          !/^\/api\/(pay|setting\/loginConfig)(\/|$)/.test(req.path) &&
          (await getPlatformPolicy()).maintenance) {
        return res.status(503).json({ message: "平台维护中，请稍后再试" });
      }
      return runWithGatewayUser(Number(userInfo.id), () => next());
    } catch (err) {
      return res.status(401).send({ message: "无效的token" });
    }
  });

  app.use("/api", resourceScope(createResourceLoader(db)));

  // Shared prompt/style libraries affect every user and are administrative configuration.
  app.use([
    "/api/project/addVisualManual", "/api/project/editVisualManual", "/api/project/deleteVisualManual",
    "/api/project/addDirectorManual", "/api/project/editDirectorlManual", "/api/project/deleteDirectorManual",
    "/api/artStyle/addArtStyle", "/api/artStyle/editArtStyle",
  ], requireAdmin);
  app.use("/api", rateLimiter({ windowMs: 60000, max: 1200, keyGenerator: (req) => String((req as any).user?.id || req.ip) }));
  app.use([
    "/api/download-output", "/api/canvas-files", "/api/canvas-image-tasks", "/api/canvas-video",
    "/api/canvas-llm", "/api/v1/canvas/image-tasks", "/api/v1/videos", "/api/v1/chat", "/api/v1/responses",
    "/api/v1/images", "/api/v1/audio", "/api/assetsGenerate", "/api/production/editImage/generateFlowImage",
    "/api/production/workbench/generateVideo", "/api/production/workbench/batchGenerateVideo",
  ], (req, res, next) => {
    if (["GET", "HEAD"].includes(req.method) && req.path !== "/") return next();
    generationLimiter(req, res, next);
  });

  // 管理员专属路由保护
  app.use("/api/setting/vendorConfig", requireAdmin);
  app.use("/api/admin", requireAdmin);
  app.use("/api/setting/agentDeploy", requireAdmin);
  app.use("/api/setting/userManage", requireAdmin);
  app.use("/api/setting/dbConfig", requireAdmin);
  app.use("/api/setting/skillManagement", requireAdmin);
  app.use("/api/setting/modelMap", requireAdmin);
  app.use("/api/setting/promptManage", requireAdmin);
  app.use("/api/setting/dev", requireAdmin);
  app.use("/api/setting/memoryConfig", requireAdmin);
  app.use("/api/other/deleteAllData", requireAdmin);
  app.use(["/api/setting/dbConfig/importData", "/api/setting/dbConfig/clearData", "/api/setting/dbConfig/clearTable", "/api/other/deleteAllData"], (_req, res, next) => {
    if (["prod", "production"].includes(process.env.NODE_ENV || "")) {
      return res.status(403).json({ message: "生产环境请通过服务器备份维护流程执行数据库清空或恢复" });
    }
    next();
  });
  app.use(["/api/admin", "/api/setting"], (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.use("/api/setting/vendorConfig", rateLimiter({ windowMs: 60000, max: 120, keyGenerator: (req) => String((req as any).user.id) }));
  // node:vm is not a security sandbox. Production adapter changes are deployment operations.
  app.use(["/api/setting/vendorConfig/addVendor", "/api/setting/vendorConfig/updateCode", "/api/setting/vendorConfig/getCodeByLink"], (_req, res, next) => {
    if (["prod", "production"].includes(process.env.NODE_ENV || "")) return res.status(403).json({ message: "服务器部署模式禁止在线执行或导入供应商代码" });
    next();
  });
  // 积分管理相关管理员接口统一鉴权（仅保护管理员专属路径）
  app.use("/api/setting/pointsConfig/adminAllocate", requireAdmin);
  app.use("/api/setting/pointsConfig/adminUsers", requireAdmin);
  app.use("/api/setting/pointsConfig/prices/price", requireAdmin);
  app.use("/api/setting/pointsConfig/prices/log", requireAdmin);
  app.use("/api/setting/pointsConfig/purchase/adminRecharge", requireAdmin);
  app.use("/api/setting/pointsConfig/purchase/package", requireAdmin);
  app.use("/api/setting/pointsConfig/member/adminUpdateMember", requireAdmin);
  // P2B-8 差异化计费覆写规则：整树仅管理员可读写
  app.use("/api/setting/pointsConfig/overrides", requireAdmin);

  const router = await import("@/router");
  await router.default(app);

  // 管理后台独立查询接口，不与用户侧任务/订单接口混用。
  app.use("/api/admin/orders", adminOrders);
  app.use("/api/admin/tasks", adminTasks);
  app.use("/api/admin/billing", adminBilling);
  app.use("/api/admin/settings", adminSettings);
  // 平台运营：站内公告（读写 data/web/announcements.json，主站直接读它）+
  // 网关记录代理（充值订单 / 兑换码，真钱的真源在网关，不在本仓库的 o_order）
  app.use("/api/admin/announcements", adminAnnouncements);
  app.use("/api/admin/gateway", adminGateway);
  app.use("/api/admin/credits", adminCredits);

  // 无限画布路由（独立于自动生成的路由，因为路径含动态参数 :id）
  const canvasRouter = (await import("@/routes/canvas")).default;
  app.use("/api/canvases", canvasRouter);

  // atelier 无限画布文件上传（图片/视频/音频 → oss/canvas-files，由 /oss 静态伺服）
  const canvasFilesRouter = (await import("@/routes/canvas-files")).default;
  app.use("/api/canvas-files", canvasFilesRouter);

  // Infinite Canvas 依赖的 stub 接口（避免 404）
  // ⚠️ 上游画布编辑器登录态下把 AI 请求打到 /api/v1/*（账号代理），必须先于 /api 兜底挂载
  const aiProxyRouter = (await import("@/routes/ai-proxy")).default;
  app.use("/api/v1", aiProxyRouter);

  const canvasCompatRouter = (await import("@/routes/canvas-compat")).default;
  app.use("/api/v1", canvasCompatRouter);

  const canvasStubsRouter = (await import("@/routes/canvas-stubs")).default;
  app.use("/api", canvasStubsRouter);

  // 404 处理
  app.use((_, res, next: NextFunction) => {
    return res.status(404).send({ message: "API 404 Not Found" });
  });

  // 错误处理（不向客户端泄露堆栈信息）
  app.use((err: any, _: Request, res: Response, __: NextFunction) => {
    console.error(err);
    const statusCode = err.status || 500;
    res.status(statusCode).send({
      message: statusCode === 500 ? "服务器内部错误" : err.message,
    });
  });

  // 端口：优先读 PORT（.env / 容器编排都会设它），没配才回落到 10588。
  // 原来写死 10588，本地想和别的服务并存（比如演示用的假后端也占 10588）时必须改代码，
  // 拿到的是 EADDRINUSE 而不是「换个端口起」。
  const port = randomPort ? 0 : Number(process.env.PORT || 10588);
  return await new Promise((resolve) => {
    server.listen(port, async () => {
      const address = server.address();
      const realPort = typeof address === "string" ? address : address?.port;
      console.log(`[服务启动成功]: http://localhost:${realPort}`);
      resolve(realPort);
    });
  });
}

// 支持await关闭
export function closeServe(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      server.close((err?: Error) => {
        if (err) return reject(err);
        console.log("[服务已关闭]");
        resolve();
      });
    } else {
      resolve();
    }
  });
}

startServe();
