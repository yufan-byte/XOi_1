import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import axios from "axios";

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

export function validateOutboundUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("只允许不含用户名和密码的 HTTP(S) 地址");
  }
  if (process.env.XOI_ALLOW_PRIVATE_UPSTREAMS !== "true" &&
    (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
     (net.isIP(hostname) && !isPublicAddress(hostname)))) {
    throw new Error("不允许访问内网或保留地址");
  }
  return url;
}

// Validate the DNS answer used by the socket itself, preventing DNS rebinding.
const safeLookup = (hostname: string, options: any, callback: any) => {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || (process.env.XOI_ALLOW_PRIVATE_UPSTREAMS !== "true" &&
        addresses.some(({ address }) => !isPublicAddress(address)))) {
      return callback(new Error("不允许访问内网或保留地址"));
    }
    if (options?.all) return callback(null, addresses);
    const selected = addresses.find((item) => !options?.family || item.family === options.family);
    if (!selected) return callback(new Error("无法解析上游地址"));
    callback(null, selected.address, selected.family);
  });
};
const httpAgent = new http.Agent({ lookup: safeLookup as any });
const httpsAgent = new https.Agent({ lookup: safeLookup as any });

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
