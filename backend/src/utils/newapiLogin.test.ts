import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { newApiLogin, NewApiError } from "./newapi";

async function fixture(t: any) {
  let active = 0,
    logins = 0,
    logouts = 0,
    mode = "normal";
  const headers: string[] = [];
  const server = http.createServer(async (req, res) => {
    let input = "";
    for await (const chunk of req) input += chunk;
    const body = JSON.parse(input || "{}");
    res.setHeader("content-type", "application/json");
    headers.push(req.headers["user-agent"] || "");
    if (req.url === "/api/user/login") {
      logins++;
      if (mode === "limit" || active >= 2) {
        res.statusCode = 409;
        return res.end(
          JSON.stringify({
            success: false,
            code: "AUTH_SESSION_LIMIT",
            message: "Conflict",
          }),
        );
      }
      if (
        mode === "credentials" ||
        (mode === "email" && body.username !== body.username.toLowerCase())
      )
        return res.end(
          JSON.stringify({
            success: false,
            message:
              "Username or password is incorrect, or user has been banned",
          }),
        );
      if (mode === "mfa")
        return res.end(
          JSON.stringify({
            success: true,
            data: {
              require_verification: true,
              flow_token: "fixture-only",
              methods: [],
            },
          }),
        );
      active++;
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            access_token: "fixture-token",
            session: { sid: "fixture-sid" },
            user: { id: 123, username: "fixture", status: 1 },
          },
        }),
      );
    }
    assert.equal(req.url, "/api/user/auth/logout");
    assert.equal(req.headers.authorization, "Bearer fixture-token");
    logouts++;
    if (mode === "cleanup-fails") {
      res.statusCode = 503;
      return res.end(
        JSON.stringify({ success: false, message: "fixture unavailable" }),
      );
    }
    if (mode === "wrong-session")
      return res.end(
        JSON.stringify({
          success: true,
          data: { revoked_sid: "another-session" },
        }),
      );
    active = Math.max(0, active - 1);
    res.end(
      JSON.stringify({ success: true, data: { revoked_sid: "fixture-sid" } }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const old = {
    url: process.env.NEWAPI_BASE_URL,
    admin: process.env.NEWAPI_ADMIN_TOKEN,
  };
  process.env.NEWAPI_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.NEWAPI_ADMIN_TOKEN = "fixture-only";
  t.after(async () => {
    for (const [key, value] of [
      ["NEWAPI_BASE_URL", old.url],
      ["NEWAPI_ADMIN_TOKEN", old.admin],
    ])
      value === undefined
        ? delete process.env[key!]
        : (process.env[key!] = value);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    mode: (value: string) => (mode = value),
    state: () => ({ active, logins, logouts, headers }),
  };
}
test("repeated successful XOi authentication releases every temporary gateway session", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 12; i++)
    assert.equal(
      (await newApiLogin("fixture", "fixture-password")).user.id,
      123,
    );
  assert.deepEqual(
    { ...f.state(), headers: undefined },
    { active: 0, logins: 12, logouts: 12, headers: undefined },
  );
  assert.ok(
    f.state().headers.every((value) => value === "XOi-Auth-Bridge/1.0"),
  );
});
test("session limit is a clear coded error, not a wrong-password failure or an automatic retry", async (t) => {
  const f = await fixture(t);
  f.mode("limit");
  await assert.rejects(
    newApiLogin("A@EXAMPLE.COM", "fixture"),
    (e: any) =>
      e instanceof NewApiError &&
      e.status === 409 &&
      e.upstreamCode === "AUTH_SESSION_LIMIT" &&
      !e.isCredentialFailure &&
      e.message.includes("上限"),
  );
  assert.equal(f.state().logins, 1);
});
test("invalid credentials do not revoke other sessions", async (t) => {
  const f = await fixture(t);
  f.mode("credentials");
  await assert.rejects(
    newApiLogin("fixture", "wrong"),
    (e: any) => e.isCredentialFailure === true,
  );
  assert.equal(f.state().logouts, 0);
});
test("required second factor remains fail-closed without issuing an XOi identity", async (t) => {
  const f = await fixture(t);
  f.mode("mfa");
  await assert.rejects(
    newApiLogin("fixture", "fixture"),
    (e: any) => e.upstreamCode === "AUTH_VERIFICATION_REQUIRED",
  );
  assert.equal(f.state().logouts, 0);
});
test("cleanup failure retries only idempotent logout and never replays login", async (t) => {
  const f = await fixture(t);
  f.mode("cleanup-fails");
  await assert.rejects(
    newApiLogin("fixture", "fixture"),
    (e: any) => e.upstreamCode === "AUTH_BRIDGE_CLEANUP_FAILED",
  );
  assert.equal(f.state().logins, 1);
  assert.equal(f.state().logouts, 2);
});
test("cleanup receipt must refer to this exact temporary session", async (t) => {
  const f = await fixture(t);
  f.mode("wrong-session");
  await assert.rejects(
    newApiLogin("fixture", "fixture"),
    (e: any) => e.upstreamCode === "AUTH_BRIDGE_CLEANUP_FAILED",
  );
  assert.equal(f.state().logins, 1);
});
test("legacy mixed-case email fallback releases the one successful session", async (t) => {
  const f = await fixture(t);
  f.mode("email");
  await newApiLogin("Mixed@Example.com", "fixture");
  assert.equal(f.state().logins, 2);
  assert.equal(f.state().logouts, 1);
  assert.equal(f.state().active, 0);
});
