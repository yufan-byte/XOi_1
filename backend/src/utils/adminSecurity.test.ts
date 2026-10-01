import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { resolveIdentity } from "./authIdentity";
import { validateOutboundUrl, fetchTextWithLimit, isPublicAddress } from "./safeUrl";
import { vendorCodePath, maskInputs, mergeInputs, SECRET_MASK } from "./vendorSecurity";
import { boundedInteger } from "./adminQuery";
import { rateLimiter } from "../middleware/rateLimiter";
import { requireAdmin } from "../middleware/requireAdmin";

test("old admin JWT cannot retain a revoked database role", async () => {
  const key = "test-only-signing-key";
  const token = jwt.sign({ id: 8, role: "admin", name: "old" }, key);
  const identity = await resolveIdentity(token, key, async () => ({ id: 8, role: "user", name: "current" }));
  assert.equal(identity.role, "user");
  assert.equal(identity.name, "current");
  let status = 0, passed = false;
  const res = { status(code: number) { status = code; return this; }, send() {} };
  requireAdmin({ user: identity } as any, res as any, () => { passed = true; });
  assert.equal(status, 403);
  assert.equal(passed, false);
});

test("deleted/banned accounts and wrong algorithm are rejected", async () => {
  const key = "test-only-signing-key";
  const token = jwt.sign({ id: 8 }, key);
  await assert.rejects(resolveIdentity(token, key, async () => undefined));
  await assert.rejects(resolveIdentity(token, key, async () => ({ id: 8, status: "banned" })));
  await assert.rejects(resolveIdentity(token, key, async () => ({ id: 8, session_version: 1 })));
  await assert.rejects(resolveIdentity(jwt.sign({ id: 8 }, key, { algorithm: "HS384" }), key, async () => ({ id: 8 })));
});

test("outbound guard blocks metadata, alternative IP notation, mapped IPv6 and credentials", async () => {
  const previous = process.env.XOI_ALLOW_PRIVATE_UPSTREAMS;
  delete process.env.XOI_ALLOW_PRIVATE_UPSTREAMS;
  try {
    for (const url of [
      "http://169.254.169.254/latest/meta-data", "http://2130706433", "http://0x7f000001",
      "http://[::ffff:127.0.0.1]", "http://[fe90::1]", "http://[fd00::1]",
      "http://localhost./", "file:///etc/passwd", "https://user:pass@example.com",
    ]) assert.throws(() => validateOutboundUrl(url), url);
    await assert.rejects(fetchTextWithLimit("http://127.0.0.1:1"));
    assert.equal(isPublicAddress("100.64.0.1"), false);
    assert.equal(isPublicAddress("8.8.8.8"), true);
  } finally {
    if (previous === undefined) delete process.env.XOI_ALLOW_PRIVATE_UPSTREAMS;
    else process.env.XOI_ALLOW_PRIVATE_UPSTREAMS = previous;
  }
});

test("vendor paths reject traversal and credential masks preserve original values", () => {
  for (const id of ["../db", "/tmp/code", "a/b", "..", "a\\b", "x\0"]) assert.throws(() => vendorCodePath("/tmp/vendors", id));
  assert.equal(vendorCodePath("/tmp/vendors", "volcengineSd2"), "/tmp/vendors/volcengineSd2.ts");
  const before = { apiKey: "test-secret", baseUrl: "https://example.com", custom: "private" };
  const masked = maskInputs(before, [{ key: "custom", type: "password" }]);
  assert.equal(masked.apiKey, SECRET_MASK);
  assert.equal(masked.custom, SECRET_MASK);
  assert.deepEqual(mergeInputs(before, masked), before);
  assert.equal(mergeInputs(before, { apiKey: "" }).apiKey, "");
  assert.throws(() => mergeInputs({}, JSON.parse('{"__proto__":"x"}')));
});

test("pagination rejects unbounded/non-integer values", () => {
  for (const value of ["Infinity", "-1", "-100", "NaN", [], {}, "1.5"]) assert.equal(boundedInteger(value, 20, 100), 20);
  assert.equal(boundedInteger("100000", 20, 100), 100);
});

test("login and registration rate limits have independent counters", () => {
  const login = rateLimiter({ windowMs: 60000, max: 1 });
  const register = rateLimiter({ windowMs: 60000, max: 1 });
  let passed = 0, status = 0;
  const request = { ip: "127.0.0.1" } as any;
  const response = { setHeader() {}, status(value: number) { status = value; return this; }, json() {} } as any;
  login(request, response, () => passed++);
  login(request, response, () => passed++);
  assert.equal(status, 429);
  register(request, response, () => passed++);
  assert.equal(passed, 2);
});
