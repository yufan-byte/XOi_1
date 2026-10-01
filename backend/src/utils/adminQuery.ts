export function boundedInteger(value: unknown, fallback: number, max: number): number {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}
export function queryText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
