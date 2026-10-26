import { test } from "node:test";
import assert from "node:assert/strict";
import { createCatalogCache } from "../../../frontend/src/utils/catalogCache";

test("concurrent pickers share a request, warm reopen is instant, empty/zero are valid", async () => {
  let calls = 0, release!: (value: number[]) => void;
  const cache = createCatalogCache(() => "account-a", () => { calls++; return new Promise<number[]>(resolve => { release = resolve; }); });
  const a = cache.get(), b = cache.get(true);
  assert.equal(a, b); assert.equal(calls, 1);
  release([0]); await a;
  assert.deepEqual(cache.peek(), [0]); assert.deepEqual(await cache.get(), [0]); assert.equal(calls, 1);
  cache.invalidate(); assert.equal(cache.peek(), undefined);
  const empty = cache.get(); release([]); assert.deepEqual(await empty, []);
  assert.deepEqual(await cache.get(), []); assert.equal(calls, 2);
});

test("TTL refresh preserves last good catalog, applies new prices, hard expires old data", async () => {
  let now = 1, price = 1, calls = 0;
  const cache = createCatalogCache(() => "a", async () => { calls++; return [price]; }, { now: () => now });
  await cache.get(); now += 29_999; await cache.get(); assert.equal(calls, 1);
  now += 1; price = 2;
  assert.deepEqual(cache.peek(), [1]); await cache.get(); assert.deepEqual(cache.peek(), [2]); assert.equal(calls, 2);
  now += 120_000; assert.equal(cache.peek(), undefined);
});

test("account/base-url switch never reuses old values or an old in-flight response", async () => {
  let scope = "account-a/server-a";
  const waits: Array<(value: string[]) => void> = [];
  const cache = createCatalogCache(() => scope, () => new Promise<string[]>(resolve => waits.push(resolve)));
  const old = cache.get();
  const rejected = assert.rejects(old, { name: "AbortError" });
  scope = "account-b/server-a"; assert.equal(cache.peek(), undefined);
  const next = cache.get(); waits[1](["b"]); await next;
  waits[0](["a"]); await rejected;
  assert.deepEqual(cache.peek(), ["b"]);
  scope = "account-b/server-b"; assert.equal(cache.peek(), undefined);
});

test("access errors clear cached prices and automatic failures have a retry cooldown", async () => {
  let now = 1, fail = false, calls = 0;
  const cache = createCatalogCache(() => "a", async () => {
    calls++; if (fail) throw { status: 403 }; return [0];
  }, { now: () => now });
  await cache.get(); fail = true;
  await assert.rejects(cache.get(true)); assert.equal(cache.peek(), undefined);
  await assert.rejects(cache.get()); assert.equal(calls, 2);
  fail = false; await cache.get(true); assert.equal(calls, 3);
  cache.invalidate(); now += 1; await cache.get(); assert.equal(calls, 4);
});

test("temporary errors keep bounded stale values and retry only once, not for 34 seconds", async () => {
  let now = 1, fail = false, calls = 0;
  const cache = createCatalogCache(() => "a", async () => {
    calls++; if (fail) throw { status: 502 }; return [5];
  }, { now: () => now });
  await cache.get(); now += 30_000; fail = true;
  await assert.rejects(cache.get()); assert.equal(calls, 3);
  assert.deepEqual(cache.peek(), [5]);
  await assert.rejects(cache.get()); assert.equal(calls, 3);
  now += 90_000; assert.equal(cache.peek(), undefined);
});

test("invalidating an unresponsive shared request releases waiters and rejects its late catalog", { timeout: 1500 }, async () => {
  const releases: Array<(rows: string[]) => void> = [];
  const cache = createCatalogCache(() => "same-account", () => new Promise<string[]>(resolve => releases.push(resolve)));
  const old = cache.get();
  const rejected = assert.rejects(old, { name: "AbortError" });
  cache.invalidate();
  await rejected;
  const next = cache.get();
  releases[1](["current"]); await next;
  releases[0](["obsolete"]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(cache.peek(), ["current"]);
});
