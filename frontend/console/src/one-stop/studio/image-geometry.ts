/** 与图片网关的尺寸白名单一致，避免四舍五入产生 1024:439 等非法比例。 */
const SIZES: Record<string, string[]> = {
  "1:1": ["1024x1024", "2048x2048", "2880x2880"],
  "3:2": ["1536x1024", "3072x2048", "3456x2304"],
  "2:3": ["1024x1536", "2048x3072", "2304x3456"],
  "4:3": ["1280x960", "2560x1920", "3200x2400"],
  "3:4": ["960x1280", "1920x2560", "2400x3200"],
  "5:4": ["1280x1024", "2560x2048", "3216x2576"],
  "4:5": ["1024x1280", "2048x2560", "2576x3216"],
  "16:9": ["1920x1088", "2048x1152", "3840x2160"],
  "9:16": ["1088x1920", "1152x2048", "2160x3840"],
  "21:9": ["2016x864", "2688x1152", "3840x1648"],
  "9:21": ["864x2016", "1152x2688", "1648x3840"],
};

export function imageGeometry(ratio: string, resolution = "1K") {
  const tier = resolution.toUpperCase();
  const exact = /^\d{2,4}x\d{2,4}$/i.test(ratio);
  const size = exact ? ratio.toLowerCase() : SIZES[ratio]?.[tier === "4K" ? 2 : tier === "2K" ? 1 : 0] ?? "1024x1024";
  const [width, height] = size.split("x").map(Number);
  return { width, height, exact, size };
}
