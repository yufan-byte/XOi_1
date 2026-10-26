import { modelQuoteParams, type QuoteConfig } from "./quote-params";

export function isCatalogSeedance(model: string) {
    return /^seedance2\.[05]-(line1(?:-fast)?|full(?:-fast)?)(?:-xoi)?$/.test(model);
}

/** Native JSON contract: do not clamp dotted 2.5 IDs to 15s or confuse ratio with resolution. */
export function catalogVideoInput(config: QuoteConfig, model: string, prompt: string, refs: { images: string[]; videos: string[]; audios: string[] }) {
    const params = modelQuoteParams(config, "video", prompt, refs.videos.length > 0);
    return { model, prompt, seconds: params.seconds, resolution: params.resolution, aspect_ratio: params.aspect_ratio || "16:9", ...refs };
}
