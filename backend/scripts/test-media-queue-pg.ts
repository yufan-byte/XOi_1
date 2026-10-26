/** Isolated temporary PostgreSQL schema. No model/payment/network upstream calls. */
import "dotenv/config";
import crypto from "node:crypto";
import knex from "knex";
import pg from "pg";
import assert from "node:assert/strict";
import { MediaQueue } from "../src/lib/workspace/mediaQueue";
import { completeMediaBudgets } from "../src/lib/workspace/budgetCompletion";
const name = `xoi_queue_fixture_${crypto.randomUUID().replace(/-/g, "")}`;
const url = process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL;
if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw Error("仅允许本机 PostgreSQL 临时测试库；不连接远程生产库");
const admin = new pg.Pool({ connectionString: url, max: 1 });
let db: ReturnType<typeof knex> | undefined,
  created = false;
async function main() {
  assert.match(name, /^xoi_queue_fixture_[a-f0-9]{32}$/);
  await admin.query(`CREATE SCHEMA ${name}`);
  created = true;
  db = knex({
    client: "pg",
    connection: { connectionString: url },
    searchPath: [name],
    pool: { min: 0, max: 8 },
  });
  assert.equal(
    (await db.raw("select current_schema() name")).rows[0].name,
    name,
  );
  await db.schema.createTable("xoi_generation_tasks", (t) => {
    t.increments("id");
    t.string("kind");
    t.string("task_id");
    t.bigInteger("user_id");
    t.string("status");
    t.string("worker_id");
    t.bigInteger("updated_at");
    t.text("payload");
    t.unique(["kind", "task_id"]);
  });
  let now = Date.now();
  const qa = new MediaQueue(
      db,
      "worker-A",
      { waitingGlobal: 8, waitingUser: 2, runningGlobal: 4, runningUser: 1 },
      () => now,
    ),
    qb = new MediaQueue(db, "worker-B", qa.limits, () => now);
  await Promise.all([qa.ensure(), qb.ensure()]);
  const admission = await Promise.allSettled(
    Array.from({ length: 40 }, (_, i) =>
      (i % 2 ? qa : qb).enqueue(
        "video",
        `job_${i}`,
        1 + (i % 4),
        crypto.randomUUID(),
        { model: "fixture" },
        {},
      ),
    ),
  );
  assert.equal(
    admission.filter((item) => item.status === "fulfilled").length,
    8,
  );
  const claims = await Promise.all(
    Array.from({ length: 16 }, (_, i) => (i % 2 ? qa : qb).claim(["video"])),
  );
  const jobs = claims.filter((job): job is NonNullable<typeof job> =>
    Boolean(job),
  );
  assert.equal(jobs.length, 4);
  assert.equal(new Set(jobs.map((job) => job.taskId)).size, 4);
  assert.equal(new Set(jobs.map((job) => job.userId)).size, 4);
  const dispatched = jobs[0];
  await qa.markDispatch(dispatched);
  await assert.rejects(
    qb.cancel(dispatched.userId, "video", dispatched.taskId),
  );
  const cancelled = jobs[1];
  await qb.cancel(cancelled.userId, "video", cancelled.taskId);
  await assert.rejects(qa.markDispatch(cancelled));
  now += 90001;
  await qb.recover();
  assert.equal(
    (await db("xoi_media_queue").where("task_id", dispatched.taskId).first())
      .state,
    "unknown",
  );
  assert.equal(await qa.heartbeat(jobs[2]), false);
  // Duplicate client IDs across independent workers commit exactly one task.
  await db("xoi_generation_tasks").delete();
  await db("xoi_media_queue").delete();
  const duplicate = await Promise.all(
    Array.from({ length: 16 }, (_, i) =>
      (i % 2 ? qa : qb).enqueue(
        "image",
        `same_${i}`,
        9,
        crypto.randomUUID(),
        { model: "fixture" },
        {},
        "client-repeat",
      ),
    ),
  );
  assert.equal(new Set(duplicate.map((job) => job.id)).size, 1);
  assert.equal((await db("xoi_generation_tasks")).length, 1);
  await db.schema.createTable("xoi_model_budgets", (t) => {
    t.integer("user_id");
    t.uuid("billing_id").primary();
    t.text("operation_path");
    t.text("state");
    t.text("stop_reason");
    t.bigInteger("reserved_quota");
  });
  const queued = await db("xoi_media_queue").first();
  await db("xoi_model_budgets").insert({
    user_id: 9,
    billing_id: queued.billing_id,
    operation_path: "/v1/canvas/image-tasks",
    state: "active",
    reserved_quota: 123,
  });
  await completeMediaBudgets(db);
  assert.equal((await db("xoi_model_budgets").first()).state, "active");
  await db("xoi_media_queue").update({ state: "unknown" });
  await completeMediaBudgets(db);
  const stopped = await db("xoi_model_budgets").first();
  assert.equal(stopped.state, "stopped");
  assert.equal(Number(stopped.reserved_quota), 123);
  // Same fenced queue contract also applies to one-stop orchestration jobs.
  const flowBudget=crypto.randomUUID();
  const flow=await qa.enqueue('one-stop','flow',11,flowBudget,{request:{projectId:'fixture',operation:'autopilot'}},{projectId:'fixture'},'flow-client');
  const replay=await qb.enqueue('one-stop','another',11,flowBudget,{request:{projectId:'fixture',operation:'autopilot'}},{projectId:'fixture'},'flow-client');
  assert.equal(flow.id,replay.id);
  const flowJob=await qa.claim(['one-stop']);assert.ok(flowJob);assert.equal(flowJob.taskId,'flow');
  await qa.markDispatch(flowJob);now+=90001;await qb.recover();
  assert.equal((await db('xoi_media_queue').where({kind:'one-stop',task_id:'flow'}).first()).state,'unknown');
  assert.equal(await qb.claim(['one-stop']),undefined);
  console.log(
    JSON.stringify({
      passed: true,
      parallelEnqueues: 40,
      accepted: 8,
      parallelClaims: 16,
      claimed: 4,
      uniqueUsers: 4,
      deduplicatedAttempts: 16,
      ambiguousReplayBlocked: true,
      oneStopQueuedAndFenced:true,
      paidRequests: 0,
      realBalanceMutations: 0,
      production2000OnlineVerified: false,
    }),
  );
}
void main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db?.destroy();
    if (created) await admin.query(`DROP SCHEMA ${name} CASCADE`);
    await admin.end();
  });
