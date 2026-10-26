/** Public release URLs only. Never put pairing credentials or account tokens in build settings. */
export function safeConnectorLink(value?: string): string {
    const text = String(value || "").trim();
    if (!text || text.startsWith("//")) return "";
    if (text.startsWith("/")) return /^\/[A-Za-z0-9/_%.,~+-]+$/.test(text) ? text : "";
    try {
        const url = new URL(text);
        return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url.href : "";
    } catch { return ""; }
}

export function canvasConnectorLinks(config: { download?: string; source?: string }) {
    return { download: safeConnectorLink(config.download), source: safeConnectorLink(config.source) };
}
