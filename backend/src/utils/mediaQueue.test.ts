import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import crypto from "node:crypto";
import { MediaQueue } from "../lib/workspace/mediaQueue";
import { DurableTasks } from "../lib/workspace/tasks";
import { runWithGatewayUser } from "../lib/gateway/context";

async function fixture(t: any, limits = {}) {
  const db = knex({
    client: "better-sqlite3",
    connection: { filename: ":memory:" },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  });
  t.after(() => db.destroy());
  await db.schema.createTable("xoi_generation_tasks", (table) => {
    table.increments("id");
    table.string("kind");
    table.string("task_id");
    table.integer("user_id");
    table.string("status");
    table.string("worker_id");
    table.bigInteger("updated_at");
    table.text("payload");
    table.unique(["kind", "task_id"]);
  });
  let now = Date.now();
  const queue = new MediaQueue(db, "fixture-worker", limits, () => now);
  const enqueue = (
    id: string,
    uid = 1,
    client?: string,
    body: any = { model: "fixture" },
  ) =>
    queue.enqueue(
      "image",
      id,
      uid,
      crypto.randomUUID(),
      body,
      { modelKey: "fixture" },
      client,
    );
  return { db, queue, enqueue, advance: (ms: number) => (now += ms) };
}
test("queue commits before acknowledgement, deduplicates parameters and isolates owners", async (t) => {
  const f = await fixture(t);
  await f.enqueue("a", 1, "client");
  assert.equal((await f.enqueue("b", 1, "client")).id, "a");
  // 同编号但参数变化 = 新一次生成（画布改提示词后重新生成），不再 409
  assert.equal((await f.enqueue("c", 1, "client", { model: "other" })).id, "c");
  await assert.rejects(
    f.queue.cancel(2, "image", "a"),
    (e: any) => e.status === 404,
  );
  assert.equal((await f.db("xoi_generation_tasks").first()).status, "queued");
  assert.equal((await f.db("xoi_media_queue")).length, 2);
});
test("bounded waiting capacity rejects without leaving orphan task records", async (t) => {
  const f = await fixture(t, { waitingGlobal: 2, waitingUser: 1 });
  await f.enqueue("a");
  await assert.rejects(f.enqueue("b"), (e: any) => e.status === 429);
  await f.enqueue("c", 2);
  await assert.rejects(f.enqueue("d", 3), (e: any) => e.status === 429);
  assert.equal((await f.db("xoi_generation_tasks")).length, 2);
});
test("claim is exclusive and skips users already at capacity", async (t) => {
  const f = await fixture(t, { runningUser: 1 });
  await f.enqueue("a");
  await f.enqueue("b");
  await f.enqueue("c", 2);
  const jobs = await Promise.all([
    f.queue.claim(["image"]),
    f.queue.claim(["image"]),
  ]);
  assert.deepEqual(
    new Set(jobs.map((job) => job?.taskId)),
    new Set(["a", "c"]),
  );
  assert.equal(await f.queue.claim(["image"]), undefined);
});
test("restart requeues only undispatched jobs and fences previous worker", async (t) => {
  const f = await fixture(t);
  await f.enqueue("a");
  const old = (await f.queue.claim(["image"]))!;
  f.advance(90001);
  await f.queue.recover();
  await assert.rejects(f.queue.markDispatch(old));
  assert.equal(await f.queue.heartbeat(old), false);
  const next = (await f.queue.claim(["image"]))!;
  assert.notEqual(next.leaseToken, old.leaseToken);
  await f.queue.markDispatch(next);
  f.advance(90001);
  await f.queue.recover();
  assert.equal(await f.queue.claim(["image"]), undefined);
  assert.equal((await f.db("xoi_media_queue").first()).state, "unknown");
  assert.equal((await f.db("xoi_media_queue").first()).request, "{}");
});
test('an old ambiguous POST is never automatically released as a safe failure',async t=>{
 const f=await fixture(t);await f.enqueue('long');const job=(await f.queue.claim(['image']))!;await f.queue.markDispatch(job);f.advance(11*60_000);await f.queue.recover();
 assert.equal((await f.db('xoi_media_queue').first()).state,'unknown');assert.equal(await f.queue.claim(['image']),undefined);
});
test('a committed one-stop boundary can resume with its persisted revision and cursor, never an in-flight POST',async t=>{
 const f=await fixture(t);await f.queue.enqueue('one-stop','pipeline',1,crypto.randomUUID(),{revision:1,completedSteps:0},{projectId:'fixture'});
 const old=(await f.queue.claim(['one-stop']))!;await f.queue.markDispatch(old);
 // Production commit performs this reset in the SAME transaction as the document CAS.
 await f.db('xoi_media_queue').where({task_id:'pipeline'}).update({dispatch_started_at:null,request:JSON.stringify({revision:2,completedSteps:1})});
 f.advance(90001);await f.queue.recover();const next=(await f.queue.claim(['one-stop']))!;
 assert.equal(next.body.revision,2);assert.equal(next.body.completedSteps,1);assert.notEqual(next.leaseToken,old.leaseToken);assert.equal(await f.queue.heartbeat(old),false);
});
test("cancel races cannot dispatch or resurrect a cancelled task", async (t) => {
  const f = await fixture(t);
  await f.enqueue("a");
  const job = (await f.queue.claim(["image"]))!;
  await f.queue.cancel(1, "image", "a");
  await assert.rejects(f.queue.markDispatch(job));
  const tasks = new DurableTasks<any>(f.db, "image");
  await assert.rejects(
    runWithGatewayUser(
      1,
      () => tasks.set("a", { status: "succeeded" }),
      job.billingId,
      job,
    ),
  );
  assert.equal(
    (await f.db("xoi_generation_tasks").first()).status,
    "cancelled",
  );
});
test("dispatched jobs refuse free cancellation, expired waiting jobs never execute", async (t) => {
  const f = await fixture(t);
  await f.enqueue("a");
  const job = (await f.queue.claim(["image"]))!;
  await f.queue.markDispatch(job);
  await assert.rejects(
    f.queue.cancel(1, "image", "a"),
    (e: any) => e.status === 409,
  );
  await f.enqueue("b", 2);
  f.advance(600001);
  await f.queue.recover();
  assert.equal(
    (await f.db("xoi_media_queue").where("task_id", "b").first()).state,
    "cancelled",
  );
  assert.equal(await f.queue.claim(["image"]), undefined);
});
test("completed task is immutable and payload is cleared after execution", async (t) => {
  const f = await fixture(t);
  await f.enqueue("a");
  const job = (await f.queue.claim(["image"]))!;
  const tasks = new DurableTasks<any>(f.db, "image");
  await runWithGatewayUser(
    1,
    () => tasks.set("a", { status: "succeeded", result: { url: "/fixture" } }),
    job.billingId,
    job,
  );
  await f.queue.finish(job);
  assert.equal((await f.db("xoi_media_queue").first()).request, "{}");
  assert.equal((await tasks.getForUser("a", 1))?.status, "succeeded");
});

test("late upstream identity cannot downgrade a recovered terminal result", async (t) => {
  const f = await fixture(t);
  await f.enqueue("late");
  const job = (await f.queue.claim(["image"]))!;
  await f.queue.markDispatch(job);
  f.advance(90001);
  await f.queue.recover();
  const tasks = new DurableTasks<any>(f.db, "image");
  await tasks.set("late", {
    status: "succeeded",
    result: { url: "/recovered" },
  });
  await runWithGatewayUser(
    1,
    () => tasks.set("late", { status: "running", upstreamId: "late-remote" }),
    job.billingId,
    job,
  );
  assert.equal((await tasks.get("late"))?.status, "succeeded");
  assert.equal((await tasks.get("late"))?.result.url, "/recovered");
});
test("stopping a budget cancels only its undispatched jobs", async (t) => {
  const f = await fixture(t);
  await f.enqueue("a");
  await f.enqueue("b", 2);
  const job = (await f.queue.claim(["image"]))!;
  await f.queue.cancelBudget(job.userId, job.billingId);
  assert.equal(
    (await f.db("xoi_media_queue").where("task_id", "a").first()).state,
    "cancelled",
  );
  assert.equal(
    (await f.db("xoi_media_queue").where("task_id", "b").first()).state,
    "queued",
  );
});
