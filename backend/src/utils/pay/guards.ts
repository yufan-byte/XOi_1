/** 支付订单的纯逻辑校验，供路由和自动化测试共用。 */
export function isPaymentAmountMatch(expectedYuan: unknown, actualYuan: unknown): boolean {
  const expected = Number(expectedYuan);
  const actual = Number(actualYuan);
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected < 0 || actual < 0) return false;
  return Math.round(expected * 100) === Math.round(actual * 100);
}

export function isOrderExpired(status: unknown, expiresAt: unknown, nowMs = Date.now()): boolean {
  if (status !== "pending" || !expiresAt) return false;
  const expiresMs = new Date(String(expiresAt)).getTime();
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}
