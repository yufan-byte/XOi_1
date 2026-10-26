/** Opt-in local smoke: one explicit Agnes text request, free-only enforced by the server.
 * Never imports the application runtime, edits pricing, or falls back to paid providers.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";
const db = new pg.Client({
  connectionString:
    process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL,
  connectionTimeoutMillis: 5000,
});
async function main() {
  assert.equal(
    process.env.XOI_RUN_FREE_ONE_STOP_SMOKE,
    "1",
    "Explicit local free-smoke opt-in required",
  );
  const database = new URL(
    process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL || "",
  );
  const gateway = new URL(
    process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000",
  );
  for (const url of [database, gateway])
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      "Local services only",
    );
  await db.connect();
  const user = (await db.query("SELECT session_version FROM o_user WHERE id=1"))
    .rows[0];
  assert.ok(user, "Existing local test account required");
  const secret = (
    await db.query("SELECT value FROM o_setting WHERE key=$1", ["tokenKey"])
  ).rows[0].value;
  const authorization =
    "Bearer " +
    jwt.sign(
      { id: 1, session_version: Number(user.session_version || 0) },
      secret,
      { expiresIn: 300 },
    );
  const api = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch("http://localhost:12121/api" + path, {
      method,
      headers: { authorization, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
    const result = (await r.json()) as any;
    if (!r.ok || result.success === false)
      throw Error(
        `${method} ${path}: HTTP ${r.status}: ${result.message || "request failed"}`,
      );
    return result.data;
  };
  if (process.argv[2] === "--archive-fixtures") {
    const ids = process.argv.slice(3);
    assert.ok(ids.length > 0 && ids.length <= 3);
    for (const id of ids) {
      assert.match(id, /^[a-f0-9-]{36}$/);
      const row = await api("/one-stop/documents/" + id + "?collection=comic");
      assert.equal(row.payload.name, "[验收]一站式免费文字链路");
      assert.equal(
        row.payload.description,
        "仅免费测试账号，一次意图分析，不调用收费模型",
      );
      const jobs = await api("/one-stop/generation/jobs?projectId=" + id);
      assert.ok(
        jobs.every((j: any) =>
          ["succeeded", "failed", "cancelled"].includes(j.status),
        ),
        "Never archive unresolved work",
      );
      await api("/one-stop/documents/" + id, "DELETE", {
        collection: "comic",
        revision: row.revision,
      });
    }
    console.log(
      JSON.stringify({
        testFixturesSoftDeleted: ids.length,
        recoverable: true,
        modelRequests: 0,
      }),
    );
    return;
  }
  const list = await api("/model-catalog?type=text");
  const model = list.find(
    (m: any) => m.modelName === "agnes-2.5-flash" && m.price?.yuan === 0,
  );
  assert.ok(
    model,
    "No explicitly zero-price Agnes text model; abort without dispatch",
  );
  const id = crypto.randomUUID(),
    p = {
      id,
      name: "[验收]一站式免费文字链路",
      description: "仅免费测试账号，一次意图分析，不调用收费模型",
      idea: "一位青衣少年在云海之上寻找失落的仙山，第一幕在山巅拔剑启程。",
      kind: "premium",
      style: "精致国漫",
      ratio: "9:16",
      region: "国产剧 · 中文",
      episodeCount: 1,
      episodeSeconds: 10,
      spec: "默认",
      schedule: "渐进式",
      voice: "alloy",
      models: { chat: model.modelName },
      assets: [],
      done: {},
      log: [],
      stage: "intent",
      status: "进行中",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  await api("/one-stop/documents/" + id, "PUT", {
    collection: "comic",
    revision: 0,
    title: p.name,
    payload: p,
  });
  const request = { projectId: id, operation: "intent" },
    quote = await api("/one-stop/generation/quote", "POST", request);
  assert.equal(
    quote.free,
    true,
    "Authoritative non-free quote: abort without model request",
  );
  assert.equal(quote.quotes.length, 1);
  assert.equal(quote.quotes[0].model, model.modelName);
  assert.equal(quote.quotes[0].points, 0);
  const submitted = await api("/one-stop/generation/jobs", "POST", {
    request,
    revision: quote.revision,
    points: 0.001,
    clientId: crypto.randomUUID(),
  });
  let task: any;
  for (let i = 0; i < 90; i++) {
    task = await api("/one-stop/generation/jobs/" + submitted.id);
    if (!["queued", "running"].includes(task.status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(
    task.status,
    "succeeded",
    task.error || "Free smoke did not finish; do not automatically retry",
  );
  const row = await api("/one-stop/documents/" + id + "?collection=comic");
  assert.ok(row.payload.intent?.audience);
  assert.ok(row.revision > quote.revision);
  const budget = (
    await db.query(
      "SELECT free_only,calls,allowed_models FROM xoi_model_budgets WHERE user_id=1 AND billing_id=$1",
      [submitted.billingId],
    )
  ).rows[0];
  assert.equal(budget.free_only, true);
  assert.equal(budget.calls, 1);
  assert.deepEqual(budget.allowed_models, [model.modelName]);
  const history = await db.query(
    "SELECT revision FROM xoi_one_stop_generation_history WHERE user_id=1 AND project_id=$1 AND task_id=$2",
    [id, submitted.id],
  );
  assert.equal(history.rowCount, 1);
  const receipt = await api(
    "/one-stop/generation/jobs/" + submitted.id + "/receipt",
  );
  assert.equal(receipt.receipt.points, 0);
  // Archive ONLY this invocation's synthetic project via normal recoverable soft deletion.
  await api("/one-stop/documents/" + id, "DELETE", {
    collection: "comic",
    revision: row.revision,
  });
  console.log(
    JSON.stringify({
      passed: true,
      model: model.modelName,
      realFreeTextCalls: 1,
      paidRequests: 0,
      receiptPoints: 0,
      serverCheckpoint: true,
      historyRetained: true,
      testProjectSoftDeleted: true,
      projectId: id,
      taskId: submitted.id,
    }),
  );
}
void main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
