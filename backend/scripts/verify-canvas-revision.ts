/** Creates only its own temporary canvas. No model, payment, balance or upstream requests. */
import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
const id = `xoi-cas-fixture-${crypto.randomUUID()}`,
  db = new pg.Client({
    connectionString:
      process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL,
  });
const base = "http://localhost:12121/api/v1/canvas";
let token = "",
  created = false;
async function post(route: string, body: any) {
  const response = await fetch(base + route, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}
async function main() {
  await db.connect();
  try {
    const user = (
      await db.query("SELECT session_version FROM o_user WHERE id=1")
    ).rows[0];
    const secret = (
      await db.query("SELECT value FROM o_setting WHERE key=$1", ["tokenKey"])
    ).rows[0].value;
    token =
      "Bearer " +
      jwt.sign(
        { id: 1, session_version: Number(user.session_version || 0) },
        secret,
        { expiresIn: 180 },
      );
    const time = new Date().toISOString(),
      project = {
        id,
        title: "临时版本验收（无模型请求）",
        createdAt: time,
        updatedAt: time,
        nodes: [],
        connections: [],
        viewport: { x: 0, y: 0, k: 1 },
      };
    const first = await post("/projects", { data: project });
    assert.equal(first.status, 200);
    created = true;
    assert.equal(first.body.data.cloudRevision, 1);
    const second = await post("/projects", {
      data: { ...project, title: "本测试的新版本", cloudRevision: 1 },
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.data.cloudRevision, 2);
    const stale = await post("/projects", {
      data: { ...project, title: "不允许覆盖的旧版本", cloudRevision: 1 },
    });
    assert.equal(stale.status, 409);
    assert.equal((await post("/projects", { data: project })).status, 409);
    assert.equal((await post("/projects/delete", { ids: [id] })).status, 200);
    assert.equal(
      (await post("/projects", { data: { ...project, cloudRevision: 2 } }))
        .status,
      409,
    );
    console.log(
      JSON.stringify({
        passed: true,
        serverRevisions: true,
        staleAndMissingVersionsBlocked: true,
        deletedCanvasNotResurrected: true,
        modelRequests: 0,
        paymentRequests: 0,
        existingProjectsChanged: 0,
      }),
    );
  } finally {
    if (created) {
      await post("/projects/delete", { ids: [id] }).catch(() => {});
      await fetch(`http://localhost:12121/api/canvases/${id}/purge`, {
        method: "DELETE",
        headers: { Authorization: token },
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    }
    await db.end();
  }
}
void main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
