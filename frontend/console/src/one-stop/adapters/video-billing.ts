/** 视频估价要喂给 tierPriceOf 的取值。
 *
 * 视频页自己的取值键和计费表达式的维度名不同：清晰度存在 res、时长存在 seconds，而表达式按
 * resolution / duration / ref_video 分档（同步脚本把 u("billing_resolution") 记成 resolution）。
 * 以前直接把页面取值交给 tierPriceOf，清晰度一维永远对不上，报价落到 default 档：
 * seedance2.5-line1 选 720P 报 ¥0.588/秒（480p 价），网关按 720p 扣 ¥0.91/秒，
 * 报价比上游成本 ¥0.65/秒 还低（2026-10-02 站长截图）。带参考视频时网关按 ×1.6 档扣，报价也没算进去。
 *
 * resolution / duration 传「实际会发出去的值」（resolutionOf / durationOf 校验后的），ref_video 按是否挂了参考视频。
 * 页面自己的 res / seconds 要去掉：tierPriceOf 先按「档名每段都出现在取值里」匹配，草稿模式强制 480p 时
 * 残留的 res=720p 会让 720p 档误中。 */
export function videoBillingValues(values: Record<string, string | undefined>, actual: { resolution?: string; duration?: string; refVideos?: number; extra?: Record<string, string | undefined> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) if (typeof v === "string" && k !== "res" && k !== "seconds") out[k] = v;
  // 页面自己的键（ratio、布尔开关的 "1"/"0"）与计费维度不同名 / 不同值：按实际发出去的值补上
  for (const [k, v] of Object.entries(actual.extra ?? {})) if (typeof v === "string") out[k] = v;
  if (actual.resolution) out.resolution = actual.resolution;
  if (actual.duration) out.duration = actual.duration;
  out.ref_video = (actual.refVideos ?? 0) > 0 ? "true" : "false";
  return out;
}
