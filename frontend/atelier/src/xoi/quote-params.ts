export type QuoteConfig = { model?: string; size?: string; quality?: string; videoSeconds?: string; videoMode?: string; vquality?: string; videoGenerateAudio?: string; count?: string | number; canvasImageCount?: string };

export function videoAspectRatio(size?: string) {
    if (/^\d+:\d+$/.test(size || "")) return size;
    const pixels = /^(\d+)x(\d+)$/i.exec(size || "");
    if (!pixels || Number(pixels[2]) <= 0) return undefined;
    const ratio = Number(pixels[1]) / Number(pixels[2]);
    return ["1:1", "3:4", "4:3", "9:16", "16:9", "21:9"].reduce((best, value) => {
        const [w, h] = value.split(":").map(Number), [bw, bh] = best.split(":").map(Number);
        return Math.abs(w / h - ratio) < Math.abs(bw / bh - ratio) ? value : best;
    });
}

/** Match the generation adapter: vquality is resolution; size is aspect ratio/pixel dimensions. */
export function modelQuoteParams(config: QuoteConfig, type: "text" | "image" | "video" | "audio", prompt: string, hasReferenceVideo: boolean) {
    const raw = String(config.vquality || "720p").toLowerCase();
    const resolution = raw.replace(/^(480|720|1080)$/, "$1p");
    return {
        seconds: type === "video" ? Number(config.videoSeconds || 6) : 5,
        size: config.size, resolution: type === "video" ? resolution : undefined,
        aspect_ratio: type === "video" ? videoAspectRatio(config.size) : undefined,
        quality: type === "image" ? config.quality : undefined, mode: config.videoMode,
        generate_audio: config.videoGenerateAudio,
        n: type === "image" ? Number(config.canvasImageCount || config.count || 1) : 1,
        inputLength: prompt.length, input: type === "audio" ? prompt : undefined, hasReferenceVideo,
    };
}
