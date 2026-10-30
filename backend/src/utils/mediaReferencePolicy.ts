import { mediaPath } from "./privateMedia";
/** Inspect the raw path before URL normalization. A provider grant never substitutes for ownership. */
export function localMediaReference(value: string): string | undefined {
  const raw = /^https?:\/\/[^/?#]+(\/[^?#]*)/i.exec(value)?.[1] ?? value.split(/[?#]/, 1)[0];
  let decoded: string;
  try { decoded = decodeURIComponent(raw); }
  catch { throw Object.assign(new Error("参考素材路径无效"), {status: 400}); }
  if (!/^\/oss(?:\/|$)/i.test(decoded)) return;
  try { return mediaPath(raw).replace(/^\/oss/i, ""); }
  catch { throw Object.assign(new Error("参考素材路径无效"), {status: 400}); }
}
export async function authorizeMediaReference(value: unknown, authorize: (path: string) => Promise<unknown>) {
  if (typeof value !== "string" || !value || value.length > 20 * 1024 * 1024)
    throw Object.assign(new Error("参考素材格式或大小无效"), {status: 400});
  const path = localMediaReference(value);
  if (path) {
    try { await authorize(path); }
    catch { throw Object.assign(new Error("无权读取参考素材，请使用当前账号的素材"), {status: 403}); }
  }
  return path;
}
