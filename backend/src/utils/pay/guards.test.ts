import assert from "node:assert/strict";
import test from "node:test";
import { isOrderExpired, isPaymentAmountMatch } from "./guards";

test("金额按分比较，避免浮点误差", () => {
  assert.equal(isPaymentAmountMatch("39.00", 39), true);
  assert.equal(isPaymentAmountMatch(0.1 + 0.2, "0.30"), true);
  assert.equal(isPaymentAmountMatch(39, 38.99), false);
  assert.equal(isPaymentAmountMatch(39, undefined), false);
});

test("只有 pending 订单才能被判定为过期", () => {
  const now = Date.parse("2026-09-06T00:00:00.000Z");
  assert.equal(isOrderExpired("pending", "2026-09-05T23:59:59.000Z", now), true);
  assert.equal(isOrderExpired("pending", "2026-09-06T00:00:01.000Z", now), false);
  assert.equal(isOrderExpired("paid", "2026-09-05T23:59:59.000Z", now), false);
  assert.equal(isOrderExpired("pending", "not-a-date", now), false);
});
