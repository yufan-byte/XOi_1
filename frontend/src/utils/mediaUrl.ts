/**
 * 展示层媒体地址工具（2026-10-26 性能）。
 *
 * 后端 `/oss/*` 支持按需生成缩略图：`?size=200x200`（等比压到边界，尺寸按 64 取整）
 * 或 `?size=30`（原图的 30%，按 10 取整）。生成结果缓存在 `smallImage/` 下，
 * 同一尺寸只算一次。列表页一张原图动辄 200KB~2MB，缩略图通常只有 20~60KB。
 *
 * ⚠️ 使用边界（很重要）：
 *  1. 只给**纯展示**的 `<img>` 用。凡是「点击放大 / 下载 / 上传给模型当参考图 /
 *     做连续性分析」的地方，必须继续用原始地址 —— 缩略图的像素不足以支撑这些用途。
 *  2. 得到的 URL 是**另一个资源身份**，绝不可用于任何「同一张图？」的比对
 *     （同一文件的 `?size=` 与原图是两个地址；反向的剥离逻辑见 continuityImageUrl）。
 *  3. 只处理本站 `/oss/` 资源：外链、CDN、非图片（mp4/webm）原样返回，不做任何改写。
 */

const THUMBNAILABLE = /\.(jpe?g|png|webp|avif|gif)$/i;

export function thumbUrl(src: string | null | undefined, width: number, height?: number): string {
  if (!src) return "";
  let url: URL;
  try {
    url = new URL(src, window.location.origin);
  } catch {
    return src;
  }
  // 跨域资源（CDN / 外链封面）没有本站缩略图能力，原样返回
  if (url.origin !== window.location.origin) return src;
  if (!url.pathname.startsWith("/oss/")) return src;
  // 调用方已经显式指定尺寸时尊重原值，避免叠加两个 size 参数
  if (url.searchParams.has("size")) return url.href;
  if (!THUMBNAILABLE.test(url.pathname)) return src;
  const w = Math.max(1, Math.min(2048, Math.round(width)));
  const h = Math.max(1, Math.min(2048, Math.round(height ?? width)));
  url.searchParams.set("size", `${w}x${h}`);
  return url.href;
}
