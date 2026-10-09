import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import axios from "axios";
import { format } from "node:url";
import { Readable, Transform } from "node:stream";

export function isPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19)));
  }
  if (!net.isIPv6(address)) return false;
  // Only global unicast; exclude transition/tunnel ranges.
  const first = parseInt(address.split(":")[0], 16);
  return first >= 0x2000 && first <= 0x3fff && first !== 0x2001 && first !== 0x2002;
}

export function validateOutboundUrl(rawUrl: string, allowPrivate = process.env.XOI_ALLOW_PRIVATE_UPSTREAMS === "true"): URL {
  const url = new URL(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("只允许不含用户名和密码的 HTTP(S) 地址");
  }
  if (!allowPrivate &&
    (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
     (net.isIP(hostname) && !isPublicAddress(hostname)))) {
    throw new Error("不允许访问内网或保留地址");
  }
  return url;
}

// Validate the DNS answer used by the socket itself, preventing DNS rebinding.
export const makeSafeLookup = (allowPrivate: boolean, lookup: typeof dns.lookup = dns.lookup) => (hostname: string, options: any, callback: any) => {
  lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || (!allowPrivate &&
        addresses.some(({ address }) => !isPublicAddress(address)))) {
      return callback(new Error("不允许访问内网或保留地址"));
    }
    if (options?.all) return callback(null, addresses);
    const selected = addresses.find((item) => !options?.family || item.family === options.family);
    if (!selected) return callback(new Error("无法解析上游地址"));
    callback(null, selected.address, selected.family);
  });
};
const safeLookup = (hostname: string, options: any, callback: any) => makeSafeLookup(process.env.XOI_ALLOW_PRIVATE_UPSTREAMS === "true")(hostname, options, callback);
const httpAgent = new http.Agent({ lookup: safeLookup as any });
const httpsAgent = new https.Agent({ lookup: safeLookup as any });
const publicHttpAgent = new http.Agent({ lookup: makeSafeLookup(false) as any });
const publicHttpsAgent = new https.Agent({ lookup: makeSafeLookup(false) as any });

/** Every redirect and the DNS answer used by the socket are checked; bytes are bounded while streaming. */
export async function fetchPublicResponse(rawUrl: string, init: RequestInit = {}, maxBytes = 32 * 1024 * 1024): Promise<Response> {
  const url = validateOutboundUrl(rawUrl, false);
  const response = await axios.request<Readable>({
    url: url.href, method: init.method || "GET", headers: Object.fromEntries(new Headers(init.headers)),
    httpAgent: publicHttpAgent, httpsAgent: publicHttpsAgent, proxy: false, maxRedirects: 5,
    beforeRedirect: (options) => {
      if (options.auth) throw new Error("不允许携带上游凭据");
      validateOutboundUrl(format({ protocol: options.protocol, hostname: options.hostname, port: options.port, pathname: options.path }), false);
    },
    timeout: 15000, signal: init.signal || AbortSignal.timeout(60000), responseType: "stream", validateStatus: () => true,
  });
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) if (value != null && !["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(key)) headers.set(key, String(value));
  if (Number(response.headers["content-length"]) > maxBytes) {
    response.data.destroy();
    throw new Error("媒体文件超过大小限制");
  }
  let bytes = 0;
  const bounded = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    callback(bytes > maxBytes ? new Error("媒体文件超过大小限制") : null, bytes > maxBytes ? undefined : chunk);
  } });
  response.data.on("error", (error) => bounded.destroy(error));
  bounded.on("close", () => response.data.destroy());
  bounded.on("error", () => {});
  response.data.pipe(bounded);
  const noBody = init.method === "HEAD" || [204, 205, 304].includes(response.status);
  if (noBody) response.data.destroy();
  const result = new Response(noBody ? null : Readable.toWeb(bounded) as ReadableStream<Uint8Array>, { status: response.status, headers });
  Object.defineProperty(result, "url", { value: response.request?.res?.responseUrl || url.href });
  return result;
}

/** User-controlled media URLs never inherit the administrator's private-upstream exception. */
export async function fetchBinaryWithLimit(rawUrl: string, maxBytes = 32 * 1024 * 1024) {
  let url: URL;
  try { url = validateOutboundUrl(rawUrl, false); }
  catch (error) { throw Object.assign(error as Error, { status: 400 }); }
  const response = await fetchPublicResponse(url.href, { signal: AbortSignal.timeout(15000) }, maxBytes);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`上游返回 HTTP ${response.status}`);
  }
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "application/octet-stream" };
}

export async function fetchTextWithLimit(rawUrl: string, maxBytes = 2 * 1024 * 1024, headers: Record<string, string> = {}): Promise<string> {
  const url = validateOutboundUrl(rawUrl);
  const response = await axios.get<string>(url.toString(), {
    httpAgent, httpsAgent, proxy: false, maxRedirects: 0,
    timeout: 15_000, signal: AbortSignal.timeout(15_000),
    maxContentLength: maxBytes, maxBodyLength: maxBytes,
    responseType: "text", transformResponse: [(data) => data], headers,
  });
  return response.data;
}
