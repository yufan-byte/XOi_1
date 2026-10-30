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

import express, { Request, Response, NextFunction } from "express";
import {createDirectorSceneRouter} from "./lib/workspace/directorRouter";
import { Server } from "socket.io";
import http from "node:http";
import expressWs from "express-ws";
import logger from "morgan";
import cors from "cors";
import compression from "compression";
import os from "node:os";
import buildRoute from "@/core";
import path from "path";
import fs from "fs";
import u from "@/utils";
import { resolveIdentity } from "@/utils/authIdentity";
import { cookieAuthAllowed, readSessionToken } from "@/utils/sessionCookie";
import { requireAdmin } from "@/middleware/requireAdmin";
import socketInit from "@/socket/index";
import { ensureThumbnail, ThumbnailSize } from "@/utils/image";
import adminTasks from "@/routes/admin/tasks";
import adminBilling from "@/routes/admin/billing";
import adminSettings from "@/routes/admin/settings";
import adminAnnouncements from "@/routes/admin/announcements";
import adminGateway from "@/routes/admin/gateway";
import adminCredits from "@/routes/admin/credits";
import adminStorage from "@/routes/admin/storage";
import adminUsers from "@/routes/admin/users";
import adminStats from "@/routes/admin/stats";
import { getPlatformPolicy } from "@/utils/platformPolicy";
import { db, dbReady } from "@/utils/db";
import { rateLimiter } from "@/middleware/rateLimiter";
import { runWithGatewayUser } from "@/lib/gateway/context";
import { loadAuthUser } from "@/utils/loadAuthUser";
import { BILLING_ID_PATTERN, billableOperation } from "../../shared/billableOperations";
import { productionBillingBlockers, productionPricingBlockers } from "@/utils/productionBillingPolicy";
import { claimModelBudget,ensureBudgetSchema } from "@/lib/gateway/budgets";
import { createResourceLoader } from "@/utils/resourceAccess";
import { resourceScope } from "@/middleware/resourceScope";
import { expectedAccount } from "@/middleware/expectedAccount";
import {createMediaHistoryRouter} from "@/lib/workspace/mediaHistory";
import { sharedRateLimiter,sharedRates } from "@/middleware/sharedRateLimiter";
import { productionSecurityBlockers } from "@/utils/productionSecurityPolicy";
import {requestBodyGuard} from "@/middleware/requestBodyGuard";
import { mediaStatic } from "@/middleware/mediaStatic";
import {installSecurityLogging} from "@/utils/securityLogging";
import { servicePort, serviceIdentity, localHealthIdentity } from "@/utils/serviceConfig";
import { StartupModules } from "@/utils/startupModules";
import { AnnouncementsStore } from "@/utils/announcementsStore";
import { readinessProbe } from "@/utils/readinessProbe";
import {releaseLifecycle} from "@/utils/releaseLifecycle";
import {privateMedia} from '@/middleware/privateMedia';

const app = express();
installSecurityLogging();
app.disable("x-powered-by");
if (process.env.XOI_TRUST_PROXY) app.set("trust proxy", process.env.XOI_TRUST_PROXY.split(",").map((value) => value.trim()));
const server = http.createServer(app);
server.headersTimeout=15000;
server.requestTimeout=120000;
const generationLimiter = rateLimiter({ windowMs: 60000, max: 60, keyGenerator: (req) => String((req as any).user?.id || req.ip) });
const thumbnailLimiter = rateLimiter({ windowMs: 60000, max: 120 });
/**
 * 缩略图生成并发上限（2026-10-26 性能）：原先写死 8，但 sharp 是 libvips 线程池，
 * 实际吞吐跟着 CPU 核数走——2 核小机上 8 个并发会把事件循环和内存一起拖住，
 * 8 核以上又白白排队。改成 2×核数、夹在 [4,16] 之间：小机不被打爆，大机吃满。
 */
const THUMBNAIL_CONCURRENCY = Math.max(4, Math.min(16, (os.cpus()?.length || 2) * 2));
let thumbnailsInFlight = 0;
let draining=false;
let socketServer:Server|undefined;
const startupModules = new StartupModules(["agent", "team", "site-config"]);

export default async function startServe(randomPort: Boolean = false) {
  serviceIdentity(); // Validate the public release tag before starting any background work.
  const releaseStartMode=process.env.XOI_RELEASE_START_MODE||"active";
  if(!["active","standby"].includes(releaseStartMode))throw Error("XOI_RELEASE_START_MODE 只支持 active/standby");
  if(["prod","production"].includes(process.env.NODE_ENV||"")&&process.env.XOI_RELEASE_ROLLOUT_ENABLED==="1"&&!process.env.XOI_RELEASE_CLUSTER)throw Error("生产启用节点发布必须明确设置 XOI_RELEASE_CLUSTER，不能跨部署互相当作备用节点");
  if(releaseStartMode==="standby")releaseLifecycle.setDraining(true);
  const securityBlockers=productionSecurityBlockers(process.env);
  if(securityBlockers.length)throw new Error(securityBlockers.join("；"));
  await dbReady;
  await (await import("@/lib/workspace/canvasStore")).verifyCanvasStorage();
  await ensureBudgetSchema();
  await sharedRates.ensure();
  await (await import("@/utils/quota")).ensureQuotaOperations();
  await (await import("@/lib/gateway/receipts")).initializeGatewaySafety();
  await u.writeVersion();
  const allowedOrigins = (process.env.XOI_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Socket.IO 与 HTTP CORS 共用同一份白名单：未配置时直接拒绝跨源，不再回退 "*"。
  const io = new Server(server, { cors: { origin: allowedOrigins.length > 0 ? allowedOrigins : false },maxHttpBufferSize:1024*1024 });
  socketServer=io;
  socketInit(io);

  if (process.env.NODE_ENV == "dev") await buildRoute();

  expressWs(app);

  app.use(logger("dev"));

  /**
   * 响应压缩（2026-10-26 性能）：此前后端**完全没有压缩**，主入口 JS 1.01MB、
   * 聊天相关 chunk 3.18MB 全是裸传，这是首屏最大的一个坑。
   * - threshold 1KB：小响应不压，省 CPU 也不值得那点字节。
   * - 显式排除 SSE / 视频音频 / 二进制：压缩器需要攒缓冲才能出块，
   *   套在 event-stream 上会把逐条推送的 token 全堵住，表现就是「AI 一直不说话」。
   * - XOI_COMPRESSION=0 可整体关掉（压测对比、或排查「响应变成 chunked」时用）。
   */
  if (String(process.env.XOI_COMPRESSION || "1") !== "0") app.use(
    compression({
      threshold: 1024,
      level: 6,
      filter: (req, res) => {
        const type = String(res.getHeader("Content-Type") || "");
        if (/event-stream|octet-stream|^video\/|^audio\/|^image\//i.test(type)) return false;
        if (String(req.headers["x-no-compression"] || "") === "1") return false;
        return compression.filter(req, res);
      },
    }),
  );

  // 跨域收紧（2026-10-24）：未配置 XOI_ALLOWED_ORIGINS 时不再反射任意 origin——
  // 同源部署不需要 CORS 头，浏览器同源策略自然阻止外部站点读取 API。
  // 需要跨域（前后端分域部署）时在环境变量里列出精确来源即可。
  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
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
    // 注意：不再下发 `X-XSS-Protection`。该头依赖的 XSS Auditor 已在 Chrome 78+/Edge 移除，
    // 而在仍支持它的旧版浏览器里反而存在已知绕过（攻击者可用它屏蔽页面脚本、做内容劫持）。
    // 现代做法是 CSP（见下方说明）+ 输出编码。
    // 阻止浏览器猜测 favicon
    res.setHeader("X-Download-Options", "noopen");
    // 控制 Referrer 信息
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // HSTS：HTTPS 部署时强制浏览器后续走加密连接（HTTP 明文访问时该头被忽略，无害）。
    // 只设 max-age 不含 includeSubDomains——子域未必都有证书。
    if (req.secure || req.headers["x-forwarded-proto"] === "https") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    }
    // 项目声音素材支持用户主动录音；麦克风仅开放给同源页面，仍需浏览器逐次授权。
    res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
    // CSP（2026-10-26 纵深防御）：此前全站没有任何 CSP，唯一的 XSS 防线是前端
    // safeAssistantMarkup() 的转义 —— 只要有一处漏转义就没有第二道闸。
    // 这里先上 **Report-Only**（只报告、不拦截），用真实流量把违规清单摸清楚，
    // 逐项收敛后再切正式，避免一刀切把页面打白。
    // 刻意保留 'unsafe-inline'/'unsafe-eval'：Vue 运行时编译与 TDesign 的内联样式依赖它们。
    // 但 report-only 也立刻带来一条真收益：connect-src 'self' 意味着即使被注入脚本，
    // 也拿不到把会话数据外带到第三方域的能力（exfil 链被掐断）。
    // 只对 HTML 文档下发：静态 js/css/图片不需要 CSP，带上只是白送几百字节。
    if (!path.extname(req.path) || /\.html?$/i.test(req.path)) {
      res.setHeader(
        "Content-Security-Policy-Report-Only",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss: blob: data:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
      );
    }
    next();
  });

  app.use(requestBodyGuard());
  app.use(["/api/admin", "/api/login", "/api/billing"], express.json({ limit: "1mb" }));
  // 画布项目与扫码上传是「整份数据塞一个 JSON」的接口，天然比普通接口大，需要单独放宽；
  // 必须挂在全局 parser 之前，否则请求会先被下面的全局上限挡成 413。
  // 画布保存的真实路径是 /api/v1/canvas/projects（canvas-compat 挂在 /api/v1 下），
  // 而 /api/v1 同时是网关代理层 —— 图片编辑/参考图这类请求也会带 base64，故整段放宽。
  app.use("/api/v1", express.json({ limit: process.env.XOI_BULK_JSON_LIMIT || "13mb" }));
  // 12 MiB phone media becomes 16 MiB base64, plus bounded JSON metadata.
  app.use("/api/one-stop-uploads", express.json({ limit: 16 * 1024 * 1024 + 512 * 1024 }));
  // 画布媒体任务（生图/图编辑/生视频）的 body 会带多张 base64 参考图：图编辑上限 10 张、
  // 每个 1~2MB 是常态，4MB 全局上限必然打成 413 request entity too large（用户实测）。
  // 这几条路由本身有鉴权 + 生成限流 + 配额校验，放宽到 13mb 与其实际载荷匹配。
  app.use(["/api/canvas-image-tasks", "/api/canvas-video"], express.json({ limit: process.env.XOI_BULK_JSON_LIMIT || "13mb" }));
  // 全局上限 25MB → 4MB（2026-10-26 安全）：普通接口没有一个需要 >4MB，而 25MB 的 body
  // 在 JSON.parse 阶段会放大 2~3 倍内存 —— 一个已登录用户并发几十个请求就能把 2G 小机打满（低成本 DoS）。
  app.use(express.json({ limit: process.env.XOI_JSON_LIMIT || "4mb" }));
  app.use(express.urlencoded({ extended: true, limit: process.env.XOI_FORM_LIMIT || "2mb" }));
  app.use("/api/login/login",sharedRateLimiter("login-ip",60000,10,req=>req.ip||"unknown"));
  app.use("/api/login/register",sharedRateLimiter("register-ip",3600000,5,req=>req.ip||"unknown"));
  app.use("/api/login/captcha",sharedRateLimiter("captcha-ip",60000,30,req=>req.ip||"unknown"));
  // 刷新保活接口（会把 cookie 的有效期重新推满 24h）。本身需要有效凭据，
  // 但放任刷就等于给了一条「无限续期」通道，按 IP 兜个 60 次/分。
  app.use("/api/login/session",sharedRateLimiter("login-session-ip",60000,60,req=>req.ip||"unknown"));
  setInterval(()=>{void sharedRates.clean().catch(e=>console.error("[shared-rate] 清理失败",e.message));},600000).unref();

  // 容器编排探针：liveness 不依赖外部服务，readiness 同时验证共享 PG 与 NewAPI。
  app.get("/api/healthz", (_req, res) => res.set("Cache-Control","no-store").status(200).json(localHealthIdentity()));
  app.get("/api/version", (_req, res) => res.set("Cache-Control","no-store").json(serviceIdentity()));
  const probeReadiness=readinessProbe(async()=>{
      if(!startupModules.ready())throw new Error("后台模块尚未就绪");
      await db.raw("select 1");
      if(!(await import("@/lib/workspace/mediaQueueRuntime")).mediaQueueReady())throw new Error("生成队列调度未就绪");
      if (["prod", "production"].includes(process.env.NODE_ENV || "")) {
        const agents = await db("o_agentDeploy").select("key", "modelName");
        const channels = await db.raw("SELECT id,tag,status,models FROM channels");
        const blockers = productionBillingBlockers(agents as any, channels.rows);
        const upstreamChannels = channels.rows.filter((channel: any) => Number(channel.status) === 1 && (process.env.XOI_UPSTREAM_CHANNEL_ID ? Number(channel.id) === Number(process.env.XOI_UPSTREAM_CHANNEL_ID) : String(channel.tag || "").startsWith("zaowu-")));
        if (!upstreamChannels.length) blockers.push("尚未启用造物上游渠道");
        for (const channel of upstreamChannels) {
          const priceRecord = await db("xoi_upstream_pricing_sync").where("channel_id", channel.id).first();
          blockers.push(...productionPricingBlockers(priceRecord).map(message => `${channel.name || channel.tag || channel.id}：${message}`));
        }
        if (blockers.length) throw new Error(`生产计费配置未就绪：${blockers.join("；")}`);
      }
      const gatewayRoot = String(process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000")
        .trim().replace(/\/+$/, "").replace(/\/v\d+$/, "");
      const upstream = await fetch(`${gatewayRoot}/api/status`, { signal: AbortSignal.timeout(5000) });
      if (!upstream.ok) throw new Error(`gateway HTTP ${upstream.status}`);
  },{warn:e=>console.error("[readyz]",e instanceof Error?e.message:"dependency unavailable")});
  app.get("/api/readyz", async (_req, res) => {
    res.set("Cache-Control","no-store");
    if(draining||releaseLifecycle.isDraining())return res.status(503).json({status:"draining"});
    const ready=await probeReadiness();
    if(!(await import("@/lib/workspace/releaseRuntime")).releaseControlHealthy())return res.status(503).json({status:"not_ready"});
    if(draining||releaseLifecycle.isDraining())return res.status(503).json({status:"draining"});
    return res.status(ready?200:503).json({status:ready?"ready":"not_ready"});
  });

  // oss 静态资源
  const ossDir = u.getPath("oss");
  if (!fs.existsSync(ossDir)) {
    fs.mkdirSync(ossDir, { recursive: true });
  }
  console.log("文件目录:", ossDir);
  app.use(
    "/oss",
    privateMedia(db,ossDir,async()=>String((await db('o_setting').where({key:'tokenKey'}).first())?.value||''),loadAuthUser),
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

        if (thumbnailsInFlight >= THUMBNAIL_CONCURRENCY) return res.status(429).json({ message: "缩略图处理繁忙，请稍后重试" });
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
    // 封面等文件名是 UUID，内容不可变（更新即换名），可安全长缓存；
    // no-store 的旧浏览器缓存无 Hash 失效语义，这里给 7 天足矣。
    express.static(skillsDir, { acceptRanges: false, maxAge: "7d", setHeaders: (res)=>{ res.setHeader("Vary","Accept-Encoding"); } }),
  );

  // assets 静态资源
  const assetsDir = u.getPath("assets");
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  console.log("文件目录:", assetsDir);
  // 主站构建产物与素材目录都使用 /assets 前缀。脚本和样式只从受控的
  // web 构建目录读取，缺失时直接 404，不能回退到可写素材目录。
  const webBuildAssets = express.static(path.join(u.getPath("web"), "assets"), {
    acceptRanges: false,
    fallthrough: false,
    immutable: true,
    maxAge: "1y",
  });
  app.use("/assets", (req, res, next) => {
    if (!/\.(?:js|css)$/i.test(req.path)) return next();
    return webBuildAssets(req, res, next);
  });
  // /assets 仅承载品牌静态素材（如 ending.mp4）。与 /skills / /oss 同理：
  // 若任意可执行文件（html/js/json/可作为文档的 svg 等）误落入此目录，会被同源加载执行，
  // 成为存储型 XSS 或信息泄露面。故只允许媒体/字体/图标类扩展名，并对响应强制 sandbox CSP。
  const ASSET_EXT_RE = /\.(?:mp4|webm|mov|mp3|wav|m4a|jpe?g|png|gif|webp|avif|bmp|svg|ico|woff2?|ttf|otf|eot)$/i;
  app.use("/assets", (req, res, next) => {
    if (!ASSET_EXT_RE.test(req.path)) return res.status(403).end();
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    next();
  }, express.static(assetsDir, { acceptRanges: false }));

  // data/web 静态网站
  const announcements = new AnnouncementsStore();
  await announcements.preserveLegacy();
  app.get("/announcements.json", async (_req,res)=>{
    res.set("Cache-Control","no-store");
    try { res.json(await announcements.read()); }
    catch { res.status(503).json({message:"公告暂时无法读取，请稍后重试"}); }
  });
  const webDir = u.getPath("web");
  if (!fs.existsSync(webDir)) {
    if(process.env.XOI_RELEASE_DIR)throw new Error("发布镜像缺少主站资源，禁止用空目录接收用户流量");
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
  // Cover self-authenticating routers too; a drain cannot bypass admission via reseller/agent paths.
  app.use("/api",releaseLifecycle.admission);
  // 限流（2026-10-26 审计 R-D）：reseller/agent 挂在全局限流(app.ts 靠后)之前，此前无任何速率限制；
  // 这两组全是后台管理类端点（config/audit/finance/redemption 等，无高频生成），按 IP 300 次/分钟
  // 足够正常使用，同时挡住爆破 / 薅 redemption 等资金相关写接口。
  app.use(["/api/reseller","/api/agent"], sharedRateLimiter("reseller-agent-ip",60000,300,req=>req.ip||"unknown"));
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
  void startupModules.start("site-config",async()=>{
    await (await import("@/lib/reseller/store")).initializeResellerConfig();
  },{warn:(name,attempt)=>console.warn(`[startup] ${name} 初始化第 ${attempt} 次未成功`)}).catch(e=>console.error("[site-config] 配置未就绪",e.message));

  // 代理体系的两个后台任务：
  //   ① 启动即建 mc_agents / mc_agent_customers / mc_agent_codes / mc_agent_withdrawals 四张表
  //      （它们是 new-api 库里的表，不归 initDB 管，所以由 agent-store 自己 ensure）；
  //   ② 每 10 分钟重算一次网关的「分组专属倍率」GroupGroupRatio（线路分组会随上游新增）。
  // 放在 listen 之前但**不 await**：库连不上时不应该拖着整个服务起不来，
  // agent-store 内部会把错误记成日志，功能降级为「代理商中心不可用」，其余接口照常。
  void (async () => {
    try {
      await startupModules.start("agent", async () => {
        const store = await import("@/lib/agent/store");
        await store.ensureAgentTables();
        store.startAgentSweeper();
      }, { warn: (name,attempt)=>console.warn(`[startup] ${name} 初始化第 ${attempt} 次未成功，将按上限重试`) });
      console.log("[agent] 代理体系已就绪（4 张 mc_* 表 + 倍率定时同步）");
    } catch (e) {
      console.error("[agent] 代理体系初始化失败（代理商中心将不可用）:", (e as Error).message);
    }
  })();

  // 团队算力池：建表后每分钟按成员周期额度结算。不 await，失败不影响创作主链路启动。
  void (async () => {
    try {
      await startupModules.start("team", async () => {
        const team = await import("@/lib/team/store");
        await team.ensureTeamTables();
        await (await import("@/lib/team/managementRuntime")).teamManagement().ensure();
        team.startTeamSweeper();
      }, { warn: (name,attempt)=>console.warn(`[startup] ${name} 初始化第 ${attempt} 次未成功，将按上限重试`) });
      console.log("[team] 团队模式已就绪（成员 + 算力池 + 周期额度）");
    } catch (error) {
      console.error("[team] 团队模式初始化失败：", (error as Error).message);
    }
  })();

  // 登录桥接会话清道夫：回收偶发回收失败的网关临时会话，防止越积越多并拖垮登录。
  void (async () => {
    try {
      const { startAuthBridgeSweeper } = await import("@/utils/newapi");
      startAuthBridgeSweeper();
      console.log("[auth] 桥接会话清理已启动");
    } catch (error) {
      console.warn("[auth] 桥接会话清理启动失败：", (error as Error).message);
    }
  })();

  app.use(async (req, res, next) => {
    const setting = await u.db("o_setting").where("key", "tokenKey").select("value").first();
    if (!setting) return res.status(444).send({ message: "服务器秘钥未配置，请联系管理员" });
    const { value: tokenKey } = setting;
    // 凭据来源：Authorization header 优先（兼容未迁移的客户端与同源非浏览器调用），
    // 其次 httpOnly 会话 cookie（F3：前端不再把 JWT 落 localStorage）。
    // URL 传 token 一律不支持 —— 会经 Referer / 访问日志 / 浏览器历史泄露。
    const headerToken = String(req.headers.authorization || "").replace(/^(Bearer\s+)+/i, "");
    // 跨站请求只认 header，不认 cookie（cookieAuthAllowed 自带 Sec-Fetch-Site / Origin 双重确认）。
    const cookieToken = cookieAuthAllowed(req) ? readSessionToken(req) : "";
    const token = headerToken || cookieToken;
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
    // Static assets are already served above; API authentication must never depend on an extension.
    // 其余接口一律要求认证（含画布 /api/config、/api/workflows、/api/canvas-*、AI 生成等），
    // 画布端由 auth-bridge.js 自动附加 JWT，避免匿名用户消耗 API/积分预算

    if (!token) return res.status(401).send({ message: "未提供token" });
    try {
      let userInfo: Awaited<ReturnType<typeof resolveIdentity>>;
      try {
        userInfo = await resolveIdentity(token, tokenKey as string, loadAuthUser);
      } catch (headerError) {
        // 兜底（F3）：历史代码把「非凭据」的会话信号当 Bearer 发了出来（如画布仍拼
        // `Authorization: Bearer <uid:nonce>`）。此时 header 不是凭据，但同源请求的
        // httpOnly cookie 里还有真凭据 —— 以 cookie 的身份放行，避免一处漏改就白屏。
        // 跨站请求读不到 cookieToken，因此这条兜底不构成鉴权绕过。
        if (!cookieToken || cookieToken === token) throw headerError;
        userInfo = await resolveIdentity(cookieToken, tokenKey as string, loadAuthUser);
      }
      (req as any).user = userInfo;
      if (userInfo.role !== "admin" && !["GET", "HEAD"].includes(req.method) &&
          !/^\/api\/(pay|setting\/loginConfig)(\/|$)/.test(req.path) &&
          (await getPlatformPolicy()).maintenance) {
        return res.status(503).json({ message: "平台维护中，请稍后再试" });
      }
      const billingId = String(req.headers["x-xoi-billing-id"] || "");
      return runWithGatewayUser(Number(userInfo.id), () => next(), BILLING_ID_PATTERN.test(billingId) ? billingId : undefined);
    } catch (err) {
      return res.status(401).send({ message: "无效的token" });
    }
  });

  app.use("/api", expectedAccount);
  app.use("/api/one-stop/media-history",createMediaHistoryRouter(db));
  // Header-authenticated bootstrap for <img>/<video>. Cookie is never accepted for API writes.
  app.get('/api/login/media-session',(req,res)=>{
    // 迁移后前端已无 JWT 原文可带，这里允许直接复用会话 cookie 里的凭据来颁发媒体 cookie。
    const token=String(req.headers.authorization||'').replace(/^(Bearer\s+)+/i,'')||readSessionToken(req);
    res.setHeader('Cache-Control','no-store');
    res.cookie(`xoi_media_session_${(req as any).user.id}`,token,{httpOnly:true,sameSite:'lax',secure:req.secure||['prod','production'].includes(process.env.NODE_ENV||''),path:'/oss',maxAge:86400000});
    res.status(204).end();
  });
  app.use("/api", resourceScope(createResourceLoader(db)));
  const budgetLimiter=sharedRateLimiter("budget-user",60000,20,req=>String((req as any).user.id));
  const billableLimiter=sharedRateLimiter("generation-user",60000,60,req=>String((req as any).user.id));
  // Read-only job polling must not exhaust a user's generation submission allowance across tabs.
  app.use('/api/one-stop/generation',(req,res,next)=>req.method==='POST'?billableLimiter(req,res,next):next());
  app.use("/api/billing/authorize",budgetLimiter);
  app.use("/api/admin/credits",(req,res,next)=>req.method==="POST"?sharedRateLimiter("credit-admin",60000,10,r=>String((r as any).user.id))(req,res,next):next());
  app.use((req,res,next)=>billableOperation(req.path,req.method)?billableLimiter(req,res,next):next());
  app.use(async (req, res, next) => {
    if (["prod", "production"].includes(process.env.NODE_ENV || "") && billableOperation(req.path, req.method) && !BILLING_ID_PATTERN.test(String(req.headers["x-xoi-billing-id"] || ""))) {
      return res.status(428).json({ message: "请先确认模型调用费用，再提交请求" });
    }
    if (billableOperation(req.path,req.method)) {
      try { await claimModelBudget(Number((req as any).user.id),String(req.headers["x-xoi-billing-id"]||""),req.path,req.headers["x-xoi-billing-step"]?String(req.headers["x-xoi-billing-step"]):undefined); }
      catch (error) { return res.status(428).json({message:(error as Error).message,code:"BUDGET_REQUIRED"}); }
    }
    return next();
  });

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

  app.use("/api/director-scenes", await createDirectorSceneRouter(db));

  // 管理员专属路由保护
  app.use("/api/admin", requireAdmin);
  app.use("/api/setting/agentDeploy", requireAdmin);
  app.use("/api/setting/skillManagement", requireAdmin);
  app.use("/api/setting/modelMap", requireAdmin);
  app.use("/api/setting/promptManage", requireAdmin);
  app.use("/api/setting/dev", requireAdmin);
  app.use("/api/setting/memoryConfig", requireAdmin);
  app.use("/api/other/deleteAllData", requireAdmin);
  // 团队功能（建团队/批量下发账号/重置密码/导出Excel/MFA/资金池）全部仅管理员可用。
  // 必须挂在生成 router 注册之前（router.default(app) 在下方），否则拦不住。
  app.use("/api/team", requireAdmin);
  app.use("/api/other/deleteAllData", (_req, res, next) => {
    if (["prod", "production"].includes(process.env.NODE_ENV || "")) {
      return res.status(403).json({ message: "生产环境请通过服务器备份维护流程执行数据库清空或恢复" });
    }
    next();
  });
  app.use(["/api/admin", "/api/setting"], (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

  const router = await import("@/router");
  app.use("/api/model-catalog", (await import("@/routes/model-catalog")).default);
  app.use("/api/billing", (await import("@/routes/billing-transparency")).default);
  (await import("@/lib/model-catalog/sync")).startUpstreamPricingSync();
  await router.default(app);

  // 管理后台独立查询接口，不与用户侧任务/订单接口混用。
  app.use("/api/admin/tasks", adminTasks);
  app.use("/api/admin/billing", adminBilling);
  app.use("/api/admin/settings", adminSettings);
  // 平台运营：站内公告（读写 data/web/announcements.json，主站直接读它）+
  // 网关记录代理（充值订单 / 兑换码，真钱的真源在网关，不在本仓库的 o_order）
  app.use("/api/admin/announcements", adminAnnouncements);
  app.use("/api/admin/gateway", adminGateway);
  app.use("/api/admin/credits", adminCredits);
  app.use("/api/admin/storage", adminStorage);
  // 平台管理四核心：用户管理（列表/停启用）+ 收益总览（每日消耗/充值/卡密核销，网关同库聚合）
  app.use("/api/admin/users", adminUsers);
  app.use("/api/admin/stats", adminStats);
  app.use("/api/admin/releases",(req,res,next)=>req.method==="POST"?sharedRateLimiter("release-admin",60000,10,r=>String((r as any).user.id))(req,res,next):next(),(await import("@/routes/admin/releases")).default);
  // 版本与更新（rootOnly 在路由内部二次校验；POST/GET 走发布类限流）
  app.use("/api/admin/update",(req,res,next)=>req.method==="POST"?sharedRateLimiter("update-admin",60000,5,r=>String((r as any).user.id))(req,res,next):next(),(await import("@/routes/admin/update")).default);
  // 安全检测（只读聚合，管理员可见）
  app.use("/api/admin/security",(await import("@/routes/admin/security")).default);

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
  const canvasAudioRouter = (await import("@/routes/canvas-audio")).default;
  app.use("/api", canvasAudioRouter);

  // 账号工作区：云端草稿与手机上传配对。
  app.use("/api/workspace", (await import("@/lib/workspace/router")).default);

  // Handlers are registered above; only committed jobs can now be claimed.
  await (await import('@/routes/one-stop')).initializeOneStopGeneration();
  await (await import("@/lib/workspace/mediaQueueRuntime")).startMediaQueue();
  await (await import("@/lib/workspace/releaseRuntime")).startReleaseRuntime(probeReadiness);
  // 画布素材孤儿回收（默认 dry-run，只报告不删；见 lib/workspace/storageSweep.ts 的安全阀）
  (await import("@/lib/workspace/storageSweep")).startStorageSweep();

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

  // Independent XOi default, with an explicit validated deployment override.
  const port = randomPort ? 0 : servicePort();
  return await new Promise((resolve) => {
    server.listen(port, async () => {
      const address = server.address();
      const realPort = typeof address === "string" ? address : address?.port;
      console.log(`[服务启动成功]: http://localhost:${realPort}`);
      // 模型引用自愈：启动后兜底跑一次；之后为事件驱动——网关模型清单变化时自动触发（见 model-catalog/catalogBase），无常驻定时器
      void import("@/lib/model-catalog/repair").then(({ repairStaleModelRefs }) => {
        setTimeout(() => void repairStaleModelRefs(), 8000).unref?.();
      });
      resolve(realPort);
    });
  });
}

// 支持await关闭
export function closeServe(): Promise<void> {
  void import("@/lib/workspace/mediaQueueRuntime").then(runtime=>runtime.stopMediaQueue());
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

// Stop accepting connections and renewals. A subsequent worker recovers expired
// leases; ambiguous submissions are never replayed. Bound container termination.
let shuttingDown=false;
async function gracefulShutdown(){
  if(shuttingDown)return;shuttingDown=true;draining=true;
  const deadline=setTimeout(()=>process.exit(1),55000);deadline.unref();
  try{
    const runtime=await import("@/lib/workspace/releaseRuntime");
    const media=await import("@/lib/workspace/mediaQueueRuntime");
    runtime.forceReleaseDrain();
    const idle=await releaseLifecycle.waitForIdle(()=>{const a=media.mediaQueueActivity();return !a.media&&!a.claiming;},45000);
    if(!idle)console.warn("[shutdown] 排空超时，在途状态保留待核实，禁止自动重放上游请求");
    media.stopMediaQueue();
    socketServer?.disconnectSockets(true);
    await closeServe();
    await runtime.stopReleaseRuntime();
    await db.destroy();
    clearTimeout(deadline);process.exit(0);
  }catch(error){console.error("[shutdown]",error);process.exit(1);}
}
process.once("SIGTERM",()=>void gracefulShutdown());
process.once("SIGINT",()=>void gracefulShutdown());
