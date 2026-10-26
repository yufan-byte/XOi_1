import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { transform } from "sucrase";
import { WorkspaceDocuments, validateDocument } from "../lib/workspace/documents";
import { DurableTasks, type DurableTask } from "../lib/workspace/tasks";
import { createVideoRecovery } from "../lib/workspace/videoRecoveryLogic";
import { UploadSessions } from "../lib/workspace/uploadSessions";

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xoi-workspace-test-"));
  const connection = { filename: path.join(directory, "test.sqlite") };
  const connect = () => knex({ client: "better-sqlite3", connection, useNullAsDefault: true, pool: { min: 1, max: 1 } });
  const db = connect();
  await db.schema.createTable("xoi_workspace_documents", t => {
    t.increments("id"); t.integer("user_id"); t.string("kind"); t.string("document_id"); t.string("title"); t.integer("revision"); t.bigInteger("updated_at"); t.text("payload"); t.unique(["user_id", "kind", "document_id"]);
  });
  await db.schema.createTable("xoi_generation_tasks", t => {
    t.increments("id"); t.string("kind"); t.string("task_id"); t.integer("user_id"); t.string("status"); t.string("worker_id"); t.bigInteger("updated_at"); t.text("payload"); t.unique(["kind", "task_id"]);
  });
  await db.schema.createTable("xoi_upload_sessions", t => { t.string("id").primary(); t.integer("user_id"); t.bigInteger("expires_at"); t.text("payload"); });
  return { db, connect, directory };
}
test("cloud drafts survive a reopened database, isolate owners and reject stale revisions", async t => {
  const f = await fixture(); let db = f.db;
  t.after(async () => { await db.destroy(); fs.rmSync(f.directory, { recursive: true, force: true }); });
  let docs = new WorkspaceDocuments(db);
  assert.equal((await docs.save(1, "viral", "draft", 0, "原稿", { shots: [] })).revision, 1);
  assert.equal(await docs.get(2, "viral", "draft"), null);
  assert.deepEqual(await docs.list(2, "viral"), []);
  await assert.rejects(docs.save(1, "viral", "draft", 0, "覆盖", {}), (e: any) => e.status === 409);
  await db.destroy(); db = f.connect(); docs = new WorkspaceDocuments(db);
  assert.equal((await docs.get(1, "viral", "draft"))?.title, "原稿");
  const writes = await Promise.allSettled([docs.save(1, "viral", "draft", 1, "设备A", {}), docs.save(1, "viral", "draft", 1, "设备B", {})]);
  assert.equal(writes.filter(x => x.status === "fulfilled").length, 1);
  assert.equal((await docs.get(1, "viral", "draft"))?.revision, 2);
});
test("portable drafts reject temporary local URLs and oversized payloads", () => {
  assert.throws(() => validateDocument("viral", "../bad", {}));
  assert.throws(() => validateDocument("unknown", "ok", {}));
  assert.throws(() => validateDocument("timeline", "ok", { src: "blob:abc" }));
  assert.throws(() => validateDocument("viral", "ok", { data: "a".repeat(13 * 1024 * 1024) }), (e: any) => e.status === 413);
});
test('empty timeline autosaves cannot erase an existing cloud edit', async t => {
  const f = await fixture();
  t.after(async () => { await f.db.destroy(); fs.rmSync(f.directory, { recursive: true, force: true }); });
  const docs = new WorkspaceDocuments(f.db);
  const original = { tracks: [{ id: 'main', clips: [{ id: 'clip', sourceUrl: '/oss/example.mp4', startTime: 0, endTime: 15 }] }] };
  await docs.save(1, 'timeline', 'edit', 0, 'original', original);
  await assert.rejects(docs.save(1, 'timeline', 'edit', 1, 'empty', { tracks: [{ clips: [] }] }), (e: any) => e.status === 409 && /原稿已保留/.test(e.message));
  assert.deepEqual((await docs.get(1, 'timeline', 'edit'))?.payload, original);
  assert.equal((await docs.get(1, 'timeline', 'edit'))?.revision, 1);
  assert.equal((await docs.save(1, 'timeline', 'edit', 1, 'edited', original)).revision, 2);
});
test("task records survive restart, keep remote identity, isolate owners and freeze terminal results", async t => {
  const f = await fixture(); let db = f.db;
  t.after(async () => { await db.destroy(); fs.rmSync(f.directory, { recursive: true, force: true }); });
  let tasks = new DurableTasks<DurableTask>(db, "video", undefined, "worker-A");
  assert.equal(await tasks.create("task", 1, { status: "running", modelKey: "newapi:test" }), true);
  await tasks.set("task", { status: "running", upstreamId: "remote-123" });
  await db.destroy(); db = f.connect(); tasks = new DurableTasks(db, "video", undefined, "worker-B");
  assert.equal(await tasks.getForUser("task", 2), undefined);
  assert.deepEqual(await tasks.listForUser(2), []);
  assert.equal((await tasks.getForUser("task", 1))?.recoveryRequired, true);
  assert.equal((await tasks.getForUser("task", 1))?.upstreamId, "remote-123");
  assert.equal((await tasks.listForUser(1))[0]?.recoveryRequired, true);
  assert.equal(await tasks.deleteForUser("task", 1), false);
  await tasks.set("task", { status: "succeeded", result: { url: "/saved.mp4" } });
  await tasks.set("task", { status: "failed", error: "late watchdog" });
  assert.equal((await tasks.getForUser("task", 1))?.status, "succeeded");
  assert.equal((await tasks.getForUser("task", 1))?.upstreamId, "remote-123");
  assert.equal(await tasks.deleteForUser("task", 2), false);
  assert.equal(await tasks.deleteForUser("task", 1), true);
  for (let i = 0; i < 6; i++) assert.equal(await tasks.create(`pending-${i}`, 1, { status: "running" }), true);
  assert.equal(await tasks.create("too-many", 1, { status: "running" }), false);
  await db("xoi_generation_tasks").where({ task_id: "pending-0" }).update({ updated_at: Date.now() - 31 * 60 * 1000 });
  assert.equal((await tasks.getForUser("pending-0", 1))?.recoveryRequired, true);
  assert.equal((await tasks.listForUser(1)).find(task => task.id === "pending-0")?.recoveryRequired, true);
});
test("restart recovery only GETs the original video, coalesces polling, and never resubmits", async t => {
  const f = await fixture(); t.after(async () => { await f.db.destroy(); fs.rmSync(f.directory, { recursive: true, force: true }); });
  const old = new DurableTasks<DurableTask>(f.db, "video", undefined, "old");
  await old.create("task", 1, { status: "running", upstreamId: "remote-123", modelKey: "newapi:test" });
  await old.create("uncertain", 1, { status: "running" });
  const current = new DurableTasks<DurableTask>(f.db, "video", undefined, "new");
  const calls: string[] = []; let files = 0, status = "processing";
  const recovery = createVideoRecovery({
    getCredentials: async user => { assert.equal(user, 1); return { baseUrl: "https://fixture.invalid/v1", apiKey: "fixture-only" }; },
    get: async url => { calls.push(url); await new Promise(resolve => setTimeout(resolve, 10)); return url.endsWith("/content") ? { data: Buffer.from([0,0,0,20,102,116,121,112,105,115,111,109]) } : { data: { status } }; },
    writeFile: async (_path, buffer) => { assert.equal(buffer.toString("ascii", 4, 8), "ftyp"); files++; },
  });
  assert.equal(await recovery(current, "task", 2), undefined); assert.equal(calls.length, 0);
  await assert.rejects(recovery(current, "uncertain", 1), (e: any) => e.status === 409); assert.equal(calls.length, 0);
  await recovery(current, "task", 1); assert.equal(calls.length, 1); assert.equal(files, 0);
  status = "completed";
  const both = await Promise.all([recovery(current, "task", 1), recovery(current, "task", 1)]);
  assert.ok(both.every(task => task?.status === "succeeded")); assert.equal(files, 1);
  assert.equal(calls.length, 3); assert.ok(calls.every(url => url.includes("/videos/remote-123")));
  await recovery(current, "task", 1); assert.equal(calls.length, 3);
});
test("phone upload sessions enforce owner, expiry, file cap and idempotent receipts", async t => {
  const f = await fixture(); t.after(async () => { await f.db.destroy(); fs.rmSync(f.directory, { recursive: true, force: true }); });
  let now = 1000; const sessions = new UploadSessions(f.db, () => now);
  const session = await sessions.create(1);
  await assert.rejects(sessions.get(2, session.id), (e: any) => e.status === 404);
  await assert.rejects(sessions.append(2, session.id, { url: "test", name: "test", bytes: 10 }));
  await sessions.close(2, session.id); assert.equal((await sessions.get(1, session.id)).files.length, 0);
  for (let i = 0; i < 10; i++) await sessions.append(1, session.id, { url: `image-${i}`, name: "test", bytes: 10 });
  assert.equal((await sessions.append(1, session.id, { url: "image-0", name: "test", bytes: 10 })).length, 10);
  await assert.rejects(sessions.append(1, session.id, { url: "overflow", name: "test", bytes: 10 }), (e: any) => e.status === 413);
  await sessions.create(1); await sessions.create(1);
  await assert.rejects(sessions.create(1), (e: any) => e.status === 429);
  now += 10 * 60 * 1000;
  await assert.rejects(sessions.get(1, session.id), (e: any) => e.status === 404);
  await assert.rejects(sessions.append(1, session.id, { url: "late", name: "test", bytes: 10 }), (e: any) => e.status === 404);
  assert.ok((await sessions.create(1)).id);
});
test("NewAPI adapter commits upstream task ID before any polling", async () => {
  const code = transform(fs.readFileSync(path.resolve("data/vendor/newapi.ts"), "utf8"), { transforms: ["typescript", "imports"] }).code;
  const calls: string[] = []; let committed = false;
  const context: any = { exports: {}, Buffer, log: () => {},
    axios: { post: async () => { calls.push("POST create"); return { data: { id: "remote" } }; }, get: async (url: string) => { assert.equal(committed, true); calls.push("GET"); return url.endsWith("content") ? { data: Buffer.from("fixture") } : { data: { status: "completed" } }; } },
    pollTask: async (fn: any) => fn(),
  };
  vm.runInNewContext(code, context);
  context.exports.vendor.inputValues = { baseUrl: "https://fixture.invalid", apiKey: "fixture" };
  const config: any = { prompt: "fixture", duration: 5, resolution: "480p", aspectRatio: "9:16", mode: [], onSubmitted: async (id: string) => { assert.equal(id, "remote"); calls.push("COMMIT"); committed = true; } };
  await context.exports.videoRequest(config, { modelName: "fixture" });
  assert.deepEqual(calls, ["POST create", "COMMIT", "GET", "GET"]);
  calls.length = 0; committed = false; config.onSubmitted = async () => { throw new Error("storage down"); };
  await assert.rejects(context.exports.videoRequest(config, { modelName: "fixture" }));
  assert.deepEqual(calls, ["POST create"]);
});
