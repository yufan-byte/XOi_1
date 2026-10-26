import brand from "./platform-brand.json";
/** One default identity; explicit white-label logos remain a separate, higher-priority choice. */
export const PLATFORM_BRAND=brand;
export function platformBrandAsset(kind:"logo"|"favicon"|"touch",base="/"){
  return base.replace(/\/?$/,"/")+brand[kind].replace(/^\//,"");
}
