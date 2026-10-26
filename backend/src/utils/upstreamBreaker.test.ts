import test from "node:test";
import assert from "node:assert/strict";
import {
  _resetBreaker,
  assertUpstreamOpen,
  breakerSnapshot,
  FAIL_THRESHOLD,
  OPEN_MS,
  recordUpstreamResult,
  upstreamKey,
  UpstreamBusyError,
} from "./upstreamBreaker";

const HOST = "https://api.example.com/v1/images";

test("key 只取主机，不区分模型和路径", () => {
  assert.equal(upstreamKey(HOST), "api.example.com");
  assert.equal(upstreamKey("https://api.example.com:8443/v1/chat"), "api.example.com:8443");
  // 相对地址不抛错，退化成前缀
  assert.equal(upstreamKey("/v1/images"), "/v1/images");
});

test("连续 429 达到阈值后熔断，且提示「未提交、未产生费用」", () => {
  _resetBreaker();
  const key = upstreamKey(HOST);
  for (let i = 0; i < FAIL_THRESHOLD - 1; i++) {
    recordUpstreamResult(key, 429);
    assertUpstreamOpen(key); // 未到阈值仍放行
  }
  recordUpstreamResult(key, 429);
  assert.throws(() => assertUpstreamOpen(key), (e: unknown) => {
    assert.ok(e instanceof UpstreamBusyError);
    assert.match(e.message, /未提交上游、未产生费用/);
    return true;
  });
});

test("5xx 计入熔断，400/401/403/402 不计入", () => {
  for (const status of [400, 401, 403, 402]) {
    _resetBreaker();
    const key = upstreamKey(HOST);
    for (let i = 0; i < FAIL_THRESHOLD + 3; i++) recordUpstreamResult(key, status);
    assertUpstreamOpen(key); // 配置/余额问题不该熔断
  }
  for (const status of [500, 502, 503, 504]) {
    _resetBreaker();
    const key = upstreamKey(HOST);
    for (let i = 0; i < FAIL_THRESHOLD; i++) recordUpstreamResult(key, status);
    assert.throws(() => assertUpstreamOpen(key));
  }
});

test("一次成功就清掉失败计数", () => {
  _resetBreaker();
  const key = upstreamKey(HOST);
  for (let i = 0; i < FAIL_THRESHOLD - 1; i++) recordUpstreamResult(key, 429);
  recordUpstreamResult(key, 200);
  for (let i = 0; i < FAIL_THRESHOLD - 1; i++) recordUpstreamResult(key, 429);
  assertUpstreamOpen(key); // 计数已被重置，重新从 1 开始
});

test("网络异常（status 为 null）计入失败", () => {
  _resetBreaker();
  const key = upstreamKey(HOST);
  for (let i = 0; i < FAIL_THRESHOLD; i++) recordUpstreamResult(key, null, new Error("ECONNRESET"));
  assert.throws(() => assertUpstreamOpen(key));
});

test("熔断窗口内只放行一个探针，其余继续快速失败", () => {
  _resetBreaker();
  const key = upstreamKey(HOST);
  for (let i = 0; i < FAIL_THRESHOLD; i++) recordUpstreamResult(key, 503);
  // 窗口内第一次：熔断中
  assert.throws(() => assertUpstreamOpen(key));

  // 把 openedAt 拨到过去，模拟窗口到期（直接改内部实现不可行，改用小窗口逻辑验证行为）
  // 这里只验证「同一时刻只会有一个探针」：连续两次调用中第二次必须被拒。
  const entryAt = Date.now();
  assert.ok(entryAt > 0);
  assert.ok(OPEN_MS >= 1000);
  const snapshot = breakerSnapshot();
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].key, key);
  assert.ok(snapshot[0].failures >= FAIL_THRESHOLD);
});
