import { test } from "node:test";
import assert from "node:assert/strict";
import { queryPricing, pricingFailure } from "../../../frontend/src/utils/pricingRequest";
test("read-only pricing retries connection failure, keeps genuine zero, and stops at its bound", async () => {
  let count = 0;
  assert.equal(await queryPricing(async () => { if (++count < 3) throw new TypeError("fetch failed"); return 0; }, new AbortController().signal, [0, 0]), 0);
  assert.equal(count, 3);
  count = 0;
  await assert.rejects(queryPricing(async () => { count++; throw new Error("offline"); }, new AbortController().signal, [0, 0]));
  assert.equal(count, 3);
});
test("login/parameter errors are not retried and lifecycle abort stops backoff", async () => {
  let count = 0;
  await assert.rejects(queryPricing(async () => { count++; throw { status: 401 }; }, new AbortController().signal, [0, 0]));
  assert.equal(count, 1);
  assert.equal(pricingFailure({ status: 422, message: "当前参数暂无可靠预估" }).retryable, false);
  assert.equal(pricingFailure({ status: 502, message: "模型目录暂时不可用" }).retryable, true);
  const controller = new AbortController();
  await assert.rejects(queryPricing(async () => { controller.abort(); throw new TypeError("offline"); }, controller.signal, [0, 0]), { name: "AbortError" });
});

test("a non-cooperative pricing adapter cannot hang loading or exceed the retry bound", { timeout: 1500 }, async () => {
  let calls = 0;
  const signals: AbortSignal[] = [];
  await assert.rejects(queryPricing(signal => {
    calls++; signals.push(signal); return new Promise<never>(() => {});
  }, new AbortController().signal, [0], 15), { name: "TimeoutError" });
  assert.equal(calls, 2);
  assert.ok(signals.every(signal => signal.aborted));
});

test("lifecycle cancellation promptly rejects an adapter that ignores abort, without retry", { timeout: 1500 }, async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = queryPricing(() => { calls++; return new Promise<never>(() => {}); }, controller.signal, [0], 1000);
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(calls, 1);
});

test("a late success cannot overwrite a completed retry, and a late rejection is handled", { timeout: 1500 }, async () => {
  let release!: (value: number) => void, rejectLate!: (error: Error) => void, calls = 0;
  const result = await queryPricing(() => ++calls === 1 ? new Promise<number>(resolve => { release = resolve; }) : Promise.resolve(0), new AbortController().signal, [0], 15);
  assert.equal(result, 0); release(999);
  await assert.rejects(queryPricing(() => new Promise<number>((_resolve, reject) => { rejectLate = reject; }), new AbortController().signal, [], 15), { name: "TimeoutError" });
  rejectLate(new Error("late adapter error"));
  await new Promise(resolve => setTimeout(resolve, 0));
});

test("already cancelled or invalid requests never start a pricing transport", async () => {
  let calls = 0;
  const request = async () => ++calls;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(queryPricing(request, controller.signal), { name: "AbortError" });
  for (const timeout of [0, -1, NaN, Infinity]) await assert.rejects(queryPricing(request, new AbortController().signal, [], timeout), RangeError);
  await assert.rejects(queryPricing(request, new AbortController().signal, [-1]), RangeError);
  assert.equal(calls, 0);
});
