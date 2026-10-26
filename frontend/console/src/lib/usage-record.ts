export interface UsageSource { status: "recorded" | "unknown" | "unavailable"; label?: string; kind?: "text" | "image" | "video" | "audio"; billingId?: string }
export function usageTitle(item: { type: number; xoi_source?: UsageSource }) {
  if (item.type === 1) return "积分充值";
  return item.xoi_source?.status === "recorded" && item.xoi_source.label ? item.xoi_source.label : "模型调用 · 来源未记录";
}
export function usageState(item: { type: number; quota: number }) {
  return item.type === 1 ? "已到账" : item.quota < 0 ? "已退款" : item.quota === 0 ? "未扣积分" : "已扣积分";
}
export function usageSign(item: { type: number; quota: number }) {
  return item.quota === 0 ? "" : item.type === 1 || item.quota < 0 ? "+" : "−";
}
/** Excel formula injection and embedded delimiter/newline protection. */
export function usageCsvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
