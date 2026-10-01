// import "./logger";
import "./err";
import "./env";
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
import { getPlatformPolicy } from "@/utils/platformPolicy";
import { dbReady } from "@/utils/db";
import { rateLimiter } from "@/middleware/rateLimiter";

const app = express();
app.disable("x-powered-by");
if (process.env.XOI_TRUST_PROXY) app.set("trust proxy", process.env.XOI_TRUST_PROXY.split(",").map((value) => value.trim()));
const server = http.createServer(app);

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
    // 防止点击劫持
    res.setHeader("X-Frame-Options", "DENY");
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

  // oss 静态资源
  const ossDir = u.getPath("oss");
  if (!fs.existsSync(ossDir)) {
    fs.mkdirSync(ossDir, { recursive: true });
  }
  console.log("文件目录:", ossDir);
  app.use(
    "/oss",
    (req, res, next) => {
      // 如果传参 type=small，则返回小图
      if (req.query.size) {
        const size = req.query.size as string;
        const smallImageBaseDir = path.join(ossDir, "smallImage");
        const originalPath = path.join(ossDir, req.path);

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
          sizeSubDir = `${w}x${h}`;
          sizeOpts = { type: "dimensions", width: w, height: h };
        } else if (percentMatch) {
          const pct = parseFloat(percentMatch[1]);
          sizeSubDir = `${percentMatch[1]}p`;
          sizeOpts = { type: "percentage", value: pct };
        } else {
          // 无效的 size 参数，降级返回原图
          express.static(ossDir, { acceptRanges: false })(req, res, next);
          return;
        }

        const ext = path.extname(req.path);
        const base = path.basename(req.path, ext);
        const dir = path.dirname(req.path);
        const smallImagePath = path.join(smallImageBaseDir, dir, `${base}_${sizeSubDir}${ext}`);

        ensureThumbnail(originalPath, smallImagePath, sizeOpts).then((thumbnailPath) => {
          if (thumbnailPath) {
            res.sendFile(thumbnailPath);
          } else {
            // 缩略图生成失败，降级返回原图
            express.static(ossDir, { acceptRanges: false })(req, res, next);
          }
        });
        return;
      }
      next();
    },
    express.static(ossDir, { acceptRanges: false }),
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
      /\.(jpe?g|png|gif|webp|svg|ico|bmp)$/i.test(req.path) ? next() : res.status(403).end();
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
  app.use(express.static(webDir, { acceptRanges: false }));

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
      req.path === "/api/login/captcha"
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
      const userInfo = await resolveIdentity(token, tokenKey as string, (id) => u.db("o_user").where("id", id).first());
      (req as any).user = userInfo;
      if (userInfo.role !== "admin" && !["GET", "HEAD"].includes(req.method) &&
          !/^\/api\/(pay|setting\/loginConfig)(\/|$)/.test(req.path) &&
          (await getPlatformPolicy()).maintenance) {
        return res.status(503).json({ message: "平台维护中，请稍后再试" });
      }
      next();
    } catch (err) {
      return res.status(401).send({ message: "无效的token" });
    }
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

  // 无限画布路由（独立于自动生成的路由，因为路径含动态参数 :id）
  const canvasRouter = (await import("@/routes/canvas")).default;
  app.use("/api/canvases", canvasRouter);

  // atelier 无限画布文件上传（图片/视频/音频 → oss/canvas-files，由 /oss 静态伺服）
  const canvasFilesRouter = (await import("@/routes/canvas-files")).default;
  app.use("/api/canvas-files", canvasFilesRouter);

  // Infinite Canvas 依赖的 stub 接口（避免 404）
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

  const port = randomPort ? 0 : 10588;
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
