import { fetchPublicResponse, validateOutboundUrl } from "@/utils/safeUrl";
import { pipeline } from "node:stream/promises";
import { rateLimiter } from "@/middleware/rateLimiter";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import express from "express";

const router = express.Router();
router.use(rateLimiter({ windowMs: 60000, max: 120 }));
const proxySecret = crypto.randomBytes(32);
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

type SourceResult = { platform: "douyin" | "bilibili" | "direct"; title: string; cover?: string; duration?: number; remoteUrl: string; headers?: Record<string, string> };

function firstUrl(value: string) {
  return value.match(/https?:\/\/[^\s，。；;]+/i)?.[0]?.replace(/[)\]}>]+$/, "") || "";
}

const assertPublicUrl = (raw: string) => validateOutboundUrl(raw, false);
const safeFetch = (input: URL, init: RequestInit = {}) => fetchPublicResponse(input.href, init);

function platformOf(url: URL) {
  const host = url.hostname.toLowerCase();
  if (host === "douyin.com" || host.endsWith(".douyin.com") || host === "iesdouyin.com" || host.endsWith(".iesdouyin.com")) return "douyin";
  if (host === "bilibili.com" || host.endsWith(".bilibili.com") || host === "b23.tv" || host.endsWith(".b23.tv")) return "bilibili";
  if (/\.(mp4|webm|mov)(?:$|\?)/i.test(url.href)) return "direct";
  throw new Error("暂只支持抖音、B站分享链接，以及 mp4/webm/mov 视频直链");
}

async function expand(url: URL) {
  const response = await safeFetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`链接访问失败（HTTP ${response.status}）`);
  return { response, url: assertPublicUrl(response.url || url.href) };
}

async function resolveBilibili(input: URL): Promise<SourceResult> {
  const expanded = input.hostname.includes("b23.tv") ? (await expand(input)).url : input;
  const match = expanded.pathname.match(/\/(BV[\w]+|av(\d+))/i);
  if (!match) throw new Error("没有从 B站链接中识别到 BV 号");
  const id = match[1];
  const viewApi = /^BV/i.test(id)
    ? `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(id)}`
    : `https://api.bilibili.com/x/web-interface/view?aid=${encodeURIComponent(match[2])}`;
  const viewResponse = await fetchPublicResponse(viewApi, { headers: { "User-Agent": USER_AGENT, Referer: "https://www.bilibili.com/" }, signal: AbortSignal.timeout(12000) });
  const view: any = await viewResponse.json();
  if (view?.code !== 0 || !view?.data?.cid) throw new Error(view?.message || "B站视频信息读取失败");
  const query = /^BV/i.test(id) ? `bvid=${encodeURIComponent(id)}` : `avid=${encodeURIComponent(match[2])}`;
  const playResponse = await fetchPublicResponse(`https://api.bilibili.com/x/player/playurl?${query}&cid=${view.data.cid}&qn=64&fnval=0&fourk=0`, { headers: { "User-Agent": USER_AGENT, Referer: expanded.href }, signal: AbortSignal.timeout(12000) });
  const play: any = await playResponse.json();
  const remoteUrl = play?.data?.durl?.[0]?.url;
  if (!remoteUrl) throw new Error("B站暂未返回可读取的视频流，可能需要登录或该视频受限");
  return { platform: "bilibili", title: view.data.title || "B站视频", cover: view.data.pic, duration: Number(view.data.duration) || undefined, remoteUrl, headers: { Referer: "https://www.bilibili.com/" } };
}

function findDouyinItem(value: any): any {
  if (!value || typeof value !== "object") return null;
  if (value.video?.play_addr?.url_list || value.video?.play_addr?.uri) return value;
  if (Array.isArray(value)) { for (const item of value) { const hit = findDouyinItem(item); if (hit) return hit; } return null; }
  for (const child of Object.values(value)) { const hit = findDouyinItem(child); if (hit) return hit; }
  return null;
}

async function resolveDouyin(input: URL): Promise<SourceResult> {
  const expandedResult = await expand(input);
  const expanded = expandedResult.url;
  const awemeId = expanded.pathname.match(/\/video\/(\d+)/)?.[1] || expanded.searchParams.get("modal_id") || expanded.href.match(/(\d{17,22})/)?.[1];
  if (!awemeId) throw new Error("没有从抖音分享链接中识别到视频编号");
  let item: any = null;
  try {
    const apiResponse = await fetchPublicResponse(`https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${awemeId}`, { headers: { "User-Agent": USER_AGENT, Referer: expanded.href }, signal: AbortSignal.timeout(12000) });
    const data: any = await apiResponse.json();
    item = data?.item_list?.[0];
  } catch {}
  if (!item) {
    const html = await expandedResult.response.text();
    const render = html.match(/<script[^>]+id="RENDER_DATA"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (render) {
      try { item = findDouyinItem(JSON.parse(decodeURIComponent(render))); } catch {}
    }
  }
  if (!item) throw new Error("抖音视频解析失败，可能是私密、图文或平台临时限制；可先保存到本地后上传");
  const urls: string[] = item.video?.play_addr?.url_list || item.video?.play_addr_h264?.url_list || [];
  const remoteUrl = String(urls[0] || "").replace("playwm", "play");
  if (!remoteUrl) throw new Error("抖音没有返回可读取的视频流");
  return { platform: "douyin", title: item.desc || item.share_info?.share_title || "抖音视频", cover: item.video?.cover?.url_list?.[0] || item.video?.origin_cover?.url_list?.[0], duration: item.video?.duration ? Number(item.video.duration) / 1000 : undefined, remoteUrl, headers: { Referer: "https://www.douyin.com/" } };
}

async function resolveDirect(url: URL): Promise<SourceResult> {
  const response = await safeFetch(url, { method: "HEAD", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`视频直链不可访问（HTTP ${response.status}）`);
  const type = response.headers.get("content-type") || "";
  if (type && !type.startsWith("video/") && !type.includes("octet-stream")) throw new Error("该链接返回的不是视频文件");
  return { platform: "direct", title: decodeURIComponent(url.pathname.split("/").pop() || "视频直链"), remoteUrl: response.url || url.href };
}

function signSource(source: SourceResult) {
  const payload = Buffer.from(JSON.stringify({ url: source.remoteUrl, headers: source.headers || {}, exp: Date.now() + 2 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", proxySecret).update(payload).digest("base64url");
  return `/api/viral/proxy?p=${encodeURIComponent(payload)}&s=${encodeURIComponent(signature)}`;
}

router.post("/resolve", async (req, res) => {
  try {
    const raw = firstUrl(String(req.body?.input || req.body?.url || ""));
    const url = assertPublicUrl(raw);

    const platform = platformOf(url);
    const source = platform === "bilibili" ? await resolveBilibili(url) : platform === "douyin" ? await resolveDouyin(url) : await resolveDirect(url);
    res.json({ success: true, data: { platform: source.platform, title: source.title, cover: source.cover || "", duration: source.duration || 0, sourceUrl: signSource(source), originalUrl: url.href } });
  } catch (error) {
    res.status(400).json({ success: false, message: error instanceof Error ? error.message : "视频链接解析失败" });
  }
});

router.get("/proxy", async (req, res) => {
  try {
    const payload = String(req.query.p || ""); const signature = String(req.query.s || "");
    const expected = crypto.createHmac("sha256", proxySecret).update(payload).digest("base64url");
    if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(403).json({ message: "视频地址签名无效" });
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(Number(data.exp)) || Date.now() > Number(data.exp)) return res.status(410).json({ message: "视频地址已过期，请重新获取" });
    assertPublicUrl(data.url);
    const headers: Record<string, string> = { "User-Agent": USER_AGENT, ...(data.headers || {}) };
    if (req.headers.range) headers.Range = req.headers.range;
    const abort = new AbortController();
    res.once("close", () => abort.abort());
    const upstream = await fetchPublicResponse(data.url, { headers, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]) }, 300 * 1024 * 1024);
    if (!upstream.ok && upstream.status !== 206) { await upstream.body?.cancel(); return res.status(upstream.status).end(); }
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
    }
    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    res.status(upstream.status);
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body as any), res);
  } catch (error) {
    if (!res.headersSent) res.status(502).json({ message: error instanceof Error ? error.message : "视频流读取失败" });
    else res.end();
  }
});

export default router;
