import assert from "node:assert/strict";
import test from "node:test";
import { isOrderExpired, isPaymentAmountMatch,paymentExpiry,paymentNotifyUrl,simulationPaymentEnabled,paymentIdentityMatches } from "./guards";
test("production aliases never enable simulation; callbacks require a clean HTTPS origin",()=>{
  for(const env of ["prod","production","staging",undefined])assert.equal(simulationPaymentEnabled(env),false);
  for(const env of ["dev","development","test"])assert.equal(simulationPaymentEnabled(env),true);
  for(const NODE_ENV of ["prod","production"]){
    for(const host of ["","http://localhost","https://user:pw@example.com","https://example.com/path","https://example.com?x=1"])assert.throws(()=>paymentNotifyUrl("wechat",{NODE_ENV,XOI_PAY_NOTIFY_HOST:host} as any));
    assert.equal(paymentNotifyUrl("wechat",{NODE_ENV,XOI_PAY_NOTIFY_HOST:"https://example.com/"} as any),"https://example.com/api/pay/callback/wechat");
  }
});
test("wechat absolute expiry is fifteen minutes ahead, not eight hours early",()=>{
  const now=Date.parse("2026-10-14T02:00:00Z");assert.equal(Date.parse(paymentExpiry(now))-now,900000);
  assert.equal(paymentIdentityMatches("app-a","app-a"),true);assert.equal(paymentIdentityMatches("app-b","app-a"),false);assert.equal(paymentIdentityMatches(undefined,"app-a"),false);
});

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
