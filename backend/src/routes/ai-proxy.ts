/**
 * 上游画布编辑器的 AI 账号代理（/api/v1/*，仅服务端）。
 *
 * 背景：上游画布页（atelier/src/pages/canvas 直接 re-export 上游 page）在登录态下走
 * "账号代理"（usesAccountProxy = remote || (local && token)），所有 AI 请求都打到
 * `/api/v1/${path}`（services/api/{image,video,audio}.ts 的 aiApiUrl）。上游那套期望
 * 站点自带一个后端，XOi 没有 —— 此前这些路径整条 404，画布里 LLM/视频/音频节点全部失败。
 *
 * 做法不是逐个仿写，而是**按前缀白名单原样转发到 new-api 网关**：
 *   · 路径一一对应（/api/v1/chat/completions → 网关 /v1/chat/completions）；
 *   · 鉴权换成**当前用户专属令牌**（服务端按 new-api uid 取得，绝不把 sk- 下发浏览器）；
 *   · 响应**流式透传**（SSE / 二进制 / 分片都不落中间层）。
 * 这样画布的 LLM 节点、直连生图、视频任务、语音合成全部走网关统一计费并扣当前用户额度，
 * 渠道/倍率/限流复用网关侧能力 —— 与"模型与渠道管理复用 new-api"的架构决策一致。
 *
 * 白名单之外（/api/v1/user-config、/files、/generation-logs/*、/storage/*、/canvas/* 等）
 * 一律 next() 放行走原有逻辑（404 或既有 stub）—— **不做 catch-all 转发**，
 * 否则非 AI 路径会被悄悄打到网关上，排障时完全看不出真因。
 *
 * 红线自查：只透传，不代理 /api/token/*；用户令牌只存在于服务端。
 */
import express, { type Request, type Response, type NextFunction } from "express";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { allowedGatewayTail } from "@/utils/gatewayProxyPath";
import { getUserGatewayCredentials } from "@/lib/gateway/newapi";

const router = express.Router();

/** 允许转发到网关的路径前缀（相对 /api/v1/）。**只放 AI 调用**，配置/存储/日志类一律不放行。
 *  ⚠️ 视频相关（videos / video-tasks / async-result）**不放这里**：画布视频走 XOi 自己的
 *  供应商管线（canvas-stubs 的 /api/v1/videos* 适配层，o_points 计费+预扣/退款看门狗），
 *  与画布图片同一套口径；转发网关会绕开这套计费且契约不匹配。 */
const HOP_BY_HOP = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

router.use(async (req: Request, res: Response, next: NextFunction) => {
  const tail = String(req.url || "").replace(/^\/+/, "");
  let allowed: boolean;
  try { allowed = allowedGatewayTail(tail); }
  catch { return res.status(400).json({ message: "代理路径无效" }); }
  if (!allowed) return next();
  if (!["GET", "POST", "DELETE", "HEAD"].includes(req.method)) return res.sendStatus(405);

  const controller = new AbortController();
  const cancel = () => { if (!res.writableFinished) controller.abort(); };
  res.on("close", cancel);
  const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  timer.unref();

  try {
    const userId = Number((req as any).user?.id);
    const cred = await getUserGatewayCredentials(userId);

    // 请求体：JSON 已被全局 express.json 消费成 req.body → 重新序列化；
    // multipart / 其它非 JSON 类型未被消费 → 原样把流交给 fetch（images/edits 场景）。
    let body: any;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentType = String(req.headers["content-type"] || "");
      if (contentType.includes("application/json")) body = JSON.stringify(req.body ?? {});
      else if (contentType) {
        const maxBytes = 32 * 1024 * 1024;
        if (Number(req.headers["content-length"]) > maxBytes) return res.status(413).json({ message: "请求体超过 32MB" });
        let bytes = 0;
        body = new Transform({ transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          callback(bytes > maxBytes ? new Error("请求体超过 32MB") : null, bytes > maxBytes ? undefined : chunk);
        } });
        void pipeline(req, body, { signal: controller.signal }).catch(() => controller.abort());
      }
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${cred.apiKey}` };
    if (req.headers.accept) headers.accept = String(req.headers.accept);
    headers["content-type"] = contentTypeOf(req) || "application/json";

    const upstream = await fetch(`${cred.baseUrl}/${tail}`, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
      redirect: "manual",
      ...(body instanceof Transform ? { duplex: "half" } : {}),
    } as RequestInit);

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key) && key !== "set-cookie") res.setHeader(key, value);
    });
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body as any), res, { signal: controller.signal });
  } catch (e) {
    console.error("[ai-proxy] 转发失败:", (e as Error).message);
    if (!res.headersSent && !res.destroyed) res.status(502).json({ code: 502, msg: "模型网关转发失败，请稍后重试", data: null });
    else res.end();
  } finally {
    clearTimeout(timer);
    res.off("close", cancel);
    controller.abort();
  }
});

function contentTypeOf(req: Request): string {
  const ct = String(req.headers["content-type"] || "");
  return ct || "";
}

export default router;
