/** 支付订单的纯逻辑校验，供路由和自动化测试共用。 */
export const isProductionPayment = (env = process.env.NODE_ENV) =>
  ["prod", "production"].includes(String(env).toLowerCase());
export const simulationPaymentEnabled = (env = process.env.NODE_ENV) =>
  ["dev", "development", "test"].includes(String(env).toLowerCase());
export function paymentNotifyUrl(
  channel: string,
  env = process.env,
): string | undefined {
  const host = String(env.XOI_PAY_NOTIFY_HOST || "").trim();
  if (!host) {
    if (isProductionPayment(env.NODE_ENV))
      throw new Error("真实支付未配置 HTTPS 回调域名，暂不能下单");
    return;
  }
  const url = new URL(host);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["http:", "https:"].includes(url.protocol) ||
    (isProductionPayment(env.NODE_ENV) && url.protocol !== "https:")
  )
    throw new Error("支付回调域名必须是无凭据的 HTTPS 站点地址");
  if (url.pathname !== "/") throw new Error("支付回调域名不能包含路径");
  return `${url.origin}/api/pay/callback/${channel}`;
}
export function paymentExpiry(now = Date.now()) {
  return new Date(now + 15 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
export function paymentIdentityMatches(
  actual: unknown,
  expected: unknown,
): boolean {
  return (
    typeof actual === "string" &&
    String(expected || "").length > 0 &&
    actual === String(expected)
  );
}
export function isPaymentAmountMatch(
  expectedYuan: unknown,
  actualYuan: unknown,
): boolean {
  const expected = Number(expectedYuan);
  const actual = Number(actualYuan);
  if (
    !Number.isFinite(expected) ||
    !Number.isFinite(actual) ||
    expected < 0 ||
    actual < 0
  )
    return false;
  return Math.round(expected * 100) === Math.round(actual * 100);
}

export function isOrderExpired(
  status: unknown,
  expiresAt: unknown,
  nowMs = Date.now(),
): boolean {
  if (status !== "pending" || !expiresAt) return false;
  const expiresMs = new Date(String(expiresAt)).getTime();
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}
