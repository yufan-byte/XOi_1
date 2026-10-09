const ALLOWED = ["chat/", "responses", "images/", "audio/", "tts/", "models"];

/** Match endpoint boundaries before URL normalization; reject encoded separators and traversal. */
export function allowedGatewayTail(tail: string): boolean {
  const pathname = tail.split("?")[0];
  if (pathname.split("/").some((part) => {
    const decoded = decodeURIComponent(part);
    return decoded === "." || decoded === ".." || /[\\/\x00-\x1f]/.test(decoded);
  })) throw new Error("代理路径无效");
  return ALLOWED.some((prefix) => prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`));
}
