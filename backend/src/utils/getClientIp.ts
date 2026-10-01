import type { Request } from "express";
// Express only trusts proxy headers from explicitly configured proxies.
export function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}
export default getClientIp;
