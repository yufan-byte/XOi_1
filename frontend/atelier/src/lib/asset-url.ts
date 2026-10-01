/**
 * 静态资源路径解析：本应用整体跑在宿主 /atelier-canvas/ 子路径下（同源 iframe），
 * 代码里不能写根绝对路径（/prompt-covers/... 会被宿主 SPA 兜底成 HTML 导致图片裂掉）。
 * 统一经 document.baseURI（= index.html 实际地址，hash 路由变化不影响）解析成真路径。
 */
export function assetUrl(path: string): string {
    if (/^(https?:|data:|blob:)/i.test(path)) return path;
    return new URL(path.replace(/^\/+/, ""), document.baseURI).href;
}
