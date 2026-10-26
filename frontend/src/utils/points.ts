/** 产品层积分换算：底层仍由 NewAPI 以 quota / 人民币记账。 */
export const POINTS_PER_YUAN = 10;
export const QUOTA_PER_YUAN = 500_000;
export const CREDIT_RULE_LABEL = "1 元 = 10 积分";

export function isValidYuan(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function yuanToPoints(yuan: number): number {
  return Math.max(0, Number(yuan) || 0) * POINTS_PER_YUAN;
}

export function formatPointsFromYuan(yuan: number, suffix = " 积分"): string {
  if (!isValidYuan(yuan)) return "暂无报价";
  return formatPoints(yuanToPoints(yuan), suffix);
}

/** Values already denominated in points (e.g. pointsDeducted) must not be multiplied again. */
export function formatPoints(points: number, suffix = " 积分"): string {
  if (!isValidYuan(points)) return "—";
  if (points > 0 && points < 0.001) return `<0.001${suffix}`;
  const digits = points >= 100 ? 2 : 3;
  return `${points.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}${suffix}`;
}

export function yuanToSignedPoints(yuan: number): number {
  return Number.isFinite(yuan) ? yuan * POINTS_PER_YUAN : 0;
}

/** Account summaries can be negative after refunds; model price quotes cannot. */
export function formatAccountPointsFromYuan(yuan: number, suffix = " 积分"): string {
  if (typeof yuan !== "number" || !Number.isFinite(yuan)) return "—";
  return `${yuan < 0 ? "-" : ""}${formatPointsFromYuan(Math.abs(yuan), suffix)}`;
}

export function formatYuan(yuan: number): string {
  if (!isValidYuan(yuan)) return "暂无报价";
  if (yuan > 0 && yuan < 0.0001) return "<¥0.0001";
  return `¥${yuan.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}`;
}

/** All Vue/React price surfaces derive points from yuan, never from a legacy points field. */
export function formatCatalogPrice(row: { rates?: { resolution: string; yuan: number; unit: string }[]; price?: { yuan: number; unit?: string } | null; outputPrice?: { yuan: number } | null; displayPrice?: string }): string {
  if (row.rates?.length && row.rates.every(rate => isValidYuan(rate.yuan))) {
    return row.rates.map(rate => `${rate.resolution} ${formatPointsFromYuan(rate.yuan)}/${rate.unit}（${formatYuan(rate.yuan)}）`).join(" · ");
  }
  if (row.price && isValidYuan(row.price.yuan)) {
    if (row.outputPrice && isValidYuan(row.outputPrice.yuan)) return `输入 ${formatPointsFromYuan(row.price.yuan, "")} / 输出 ${formatPointsFromYuan(row.outputPrice.yuan, "")} 积分 / 百万 Token（${formatYuan(row.price.yuan)} / ${formatYuan(row.outputPrice.yuan)}）`;
    return `${formatPointsFromYuan(row.price.yuan)} / ${row.price.unit || "次"}（${formatYuan(row.price.yuan)}）`;
  }
  // No numeric price: never guess units or relabel an old string as converted.
  return "按实际用量计费 · 暂无预估";
}
