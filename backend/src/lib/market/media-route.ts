/**
 * 灵感广场媒体外链本地化通道（造物 media-store 的最小子集，只做 x/ 外链映射）。
 *
 * 造物的灵感广场静态快照（square-data/*.json）里每张封面都是 /api/media/x/<id>，
 * 由 external-media-map.json（2596 条，id → 上游 URL）解析到真实地址。
 * 本端点：查 map → 有缓存直接流式返回 → 无缓存取上游、落盘、再返回。
 *
 * 安全：
 *  - URL 只能来自 map（不接受任何用户提供的 URL），上游 host 天然被 map 收窄；
 *  - id 白名单正则（hex），杜绝路径穿越；
 *  - 上游响应流式落盘（不驻留内存），单文件上限 300MB、60s 超时。
 * 鉴权：刻意不挂（造物同款，靠随机 id 保密）——瀑布流几十张图不该各带一次鉴权；
 *       本 Router 由 app.ts 挂在全局 JWT 中间件之前。
 */
import path from "node:path";
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { fetchPublicResponse } from "@/utils/safeUrl";
import { safeInlineMediaType } from "@/utils/mediaSecurity";
import u from "@/utils";

type MediaMap = Record<string, string>;

let mediaMap: MediaMap | null = null;
function loadMap(): MediaMap {
  if (!mediaMap) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mediaMap = JSON.parse(fs.readFileSync(path.resolve(__dirname, "external-media-map.json"), "utf-8")) as MediaMap;
  }
  return mediaMap;
}

const ID_RE = /^[a-f0-9]{16,40}$/;
/**
 * 单文件上限：不设小值。
 * 造物广场里混着成片视频，实测有 26MB 的 mp4；按 20MB 卡会把整条作品打成 502，
 * 视频卡在瀑布流里直接空白。这里给足余量，真正的保护靠下面的流式落盘（不驻留内存）。
 */
const MAX_BYTES = 300 * 1024 * 1024;
const cacheDir = u.getPath("media/x");

/** 从上游 URL 推断缓存文件扩展名（拿不到就 .bin，响应时仍按上游 content-type 输出） */
function extOf(url: string): string {
  const m = /\.(jpe?g|png|gif|webp|svg|ico|bmp|mp4|webm|mp3|wav|m3u8)(?:[?#]|$)/i.exec(url);
  return m ? "." + m[1].toLowerCase() : ".bin";
}

/**
 * 真实 Content-Type 侧车文件。
 *
 * 必须存下来：上游 URL 有的不带扩展名（例如 .../1f931ea8e1d4...152 其实是 mp4），
 * extOf() 会退化成 .bin，命中缓存时 express 按扩展名猜类型 → application/octet-stream，
 * 浏览器 <video> 直接拒播。存一份 type 就能在 sendFile 时覆盖。
 */
function typeFileOf(cached: string): string {
  return cached + ".type";
}

function cachedTypeOf(cached: string): string | null {
  try {
    const f = typeFileOf(cached);
    if (!fs.existsSync(f)) return null;
    const t = fs.readFileSync(f, "utf-8").trim();
    return t || null;
  } catch {
    return null;
  }
}

/**
 * 统一出口：用 sendFile 而不是 res.end(buf)。
 * 目的只有一个 —— sendFile 自带 Accept-Ranges / 206 支持，
 * <video preload="metadata"> 只会取首帧那一段，不会把整段 mp4 拉下来。
 */
function sendMedia(res: import("express").Response, file: string, type: string | null) {
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  type = safeInlineMediaType(type || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  return res.sendFile(file, type ? { headers: { "Content-Type": type } } : {});
}

/**
 * 上游并发闸门。
 *
 * 广场一屏就是 30 张封面，全部未命中缓存时会同时回源同一个 CDN 域名；
 * 实测这样打过去会被上游限流，个别请求直接失败（而失败不入缓存 → 前端那张图就永久裂了）。
 * 这里把回源并发压到 6，让请求排队而不是一拥而上。
 */
const UPSTREAM_CONCURRENCY = 6;
let running = 0;
const waiters: Array<() => void> = [];
async function acquireUpstream(): Promise<void> {
  if (running < UPSTREAM_CONCURRENCY) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  running++;
}
function releaseUpstream(): void {
  running--;
  waiters.shift()?.();
}

export default async function mediaRouter(): Promise<Router> {
  const r = Router();
  fs.mkdirSync(cacheDir, { recursive: true });

  r.get("/x/:id", async (req, res) => {
    const id = String(req.params.id || "");
    if (!ID_RE.test(id)) return res.status(400).json({ code: 400, message: "bad media id" });
    const upstream = loadMap()[id];
    if (!upstream) return res.status(404).json({ code: 404, message: "unknown media id" });

    // 命中缓存：走 sendFile（带 Range 支持 + 侧车里的真实类型）
    const cached = path.join(cacheDir, id + extOf(upstream));
    if (fs.existsSync(cached)) {
      return sendMedia(res, cached, cachedTypeOf(cached));
    }

    // 回源：先过并发闸门（排队期间可能别的请求已把文件落好，要再查一次缓存），
    // 再流式落盘（不把整段视频读进内存），落完走 sendFile 让本次请求也吃到 Range
    await acquireUpstream();
    try {
      if (fs.existsSync(cached)) return sendMedia(res, cached, cachedTypeOf(cached));

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      const resp = await fetchPublicResponse(upstream, { signal: ctrl.signal }, MAX_BYTES);
      if (!resp.ok || !resp.body) {
        clearTimeout(timer);
        await resp.body?.cancel();
        return res.status(502).json({ code: 502, message: `upstream ${resp.status}` });
      }

      const file = path.join(cacheDir, id + extOf(upstream));
      const tmp = file + ".part";
      let total = 0;
      const nodeStream = Readable.fromWeb(resp.body as unknown as import("node:stream/web").ReadableStream);
      // 超限直接掐断，别把磁盘写满
      nodeStream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BYTES) nodeStream.destroy(new Error("upstream too large"));
      });
      try {
        await pipeline(nodeStream, fs.createWriteStream(tmp));
      } catch (e) {
        clearTimeout(timer);
        fs.rmSync(tmp, { force: true });
        return res.status(502).json({ code: 502, message: "upstream fetch failed: " + String((e as Error)?.message || e) });
      }
      clearTimeout(timer);
      fs.renameSync(tmp, file);

      const type = resp.headers.get("content-type");
      if (type) fs.writeFileSync(typeFileOf(file), type, "utf-8");
      return sendMedia(res, file, type);
    } catch (e: any) {
      return res.status(502).json({ code: 502, message: "upstream fetch failed: " + String(e?.message || e) });
    } finally {
      releaseUpstream();
    }
  });

  return r;
}
