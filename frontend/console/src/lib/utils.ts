import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { QUOTA_PER_YUAN } from "../../../src/utils/points";
export { formatAccountPointsFromYuan as fmtPoints, yuanToSignedPoints as yuanToPoints } from "../../../src/utils/points";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const QUOTA_PER_UNIT = QUOTA_PER_YUAN; // new-api: 500000 quota = ¥1（站内 $ 即元）

export function quotaToUsd(quota: number) {
  return quota / QUOTA_PER_UNIT;
}

export function fmtUsd(v: number, digits = 2) {
  if (!Number.isFinite(v)) return "-";
  if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(digits)}`;
}

export function fmtCount(n: number) {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function timeHM(ts: number | string) {
  const d = new Date(typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function dateLabel(ts: number) {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** new-api 站内 "$" 即人民币（客户 1:1 充值），不做汇率换算。 */
export const USD_TO_CNY = 1;
export function fmtCny(usd: number) {
  if (!Number.isFinite(usd)) return "-";
  const v = usd * USD_TO_CNY;
  return `¥${v >= 100 ? v.toFixed(0) : v.toFixed(2)}`;
}
