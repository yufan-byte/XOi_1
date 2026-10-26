import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listFiles } from "./listFiles";
import { allowedGatewayTail } from "./gatewayProxyPath";
import { resourceScope } from "../middleware/resourceScope";
import { validateFields } from "../middleware/middleware";
import { createResourceLoader } from "./resourceAccess";
import { OwnedTasks } from "./ownedTasks";
import { isAllowedMedia, safeInlineMediaType } from "./mediaSecurity";
import { skillDirectory } from "./skillDirectory";
import { fetchBinaryWithLimit, fetchPublicResponse, makeSafeLookup } from "./safeUrl";

// Independent database fixtures: no application/production DB import or real data mutation.
test("resource authorization follows persisted ownership and relationships", async (t) => {
  const db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
  t.after(() => db.destroy());
  await db.schema.createTable("o_project", (table) => { table.integer("id"); table.integer("userId"); });
  for (const name of ["o_script", "o_novel", "o_assets", "o_storyboard", "o_videoTrack", "o_video", "o_tasks", "o_agentWorkData"]) {
    await db.schema.createTable(name, (table) => {
      for (const col of ["id", "projectId", "scriptId", "assetsId", "videoTrackId", "flowId"]) table.integer(col);
    });
  }
  await db.schema.createTable("o_image", (table) => { table.integer("id"); table.integer("assetsId"); });
  await db.schema.createTable("o_imageFlow", (table) => { table.integer("id"); table.integer("userId"); });
  await db.schema.createTable("o_event", (table) => table.integer("id"));
  await db.schema.createTable("o_eventChapter", (table) => { table.integer("eventId"); table.integer("novelId"); });
  await db("o_project").insert([{ id: 10, userId: 1 }, { id: 20, userId: 2 }, { id: 30, userId: 1 }]);
  for (const name of ["o_script", "o_novel", "o_assets", "o_storyboard", "o_videoTrack", "o_video", "o_tasks", "o_agentWorkData"]) {
    await db(name).insert([{ id: 101, projectId: 10, scriptId: 101, flowId: 302, videoTrackId: 101 }, { id: 201, projectId: 20, scriptId: 201, flowId: 301 }, { id: 401, projectId: 30, scriptId: 401 }]);
  }
  await db("o_image").insert([{ id: 101, assetsId: 101 }, { id: 201, assetsId: 201 }, { id: 401, assetsId: 401 }]);
  await db("o_imageFlow").insert([{ id: 301, userId: 1 }, { id: 302, userId: null }, { id: 303, userId: null }]);
  await db("o_event").insert({ id: 101 });
  await db("o_eventChapter").insert([{ eventId: 101, novelId: 101 }, { eventId: 101, novelId: 201 }]);
  const guard = resourceScope(createResourceLoader(db));
  async function check(route: string, body: any, expected: number, query: any = {}) {
    let status = 0, called = false;
    const res = { status(code: number) { status = code; return this; }, json() {} };
    await guard({ path: `/${route}`, body, query, user: { id: 1, role: "user" } } as any, res as any, (error?: any) => { assert.ifError(error); called = true; });
    assert.equal(status, expected);
    assert.equal(called, expected === 0);
  }
  await t.test("ID-only reads and writes cannot target another account", async () => {
    for (const route of ["assets/updateAssets", "assets/delImage", "novel/updateNovel", "script/updateScript", "production/storyboard/editStoryboardInfo", "production/workbench/delVideo"]) await check(route, { id: 201 }, 403);
    await check("task/taskDetails", { taskId: 201 }, 403);
    await check("assets/updateAssets", { id: 101 }, 0);
    await check('general/getSingleProject',{id:10},0);
    await check('general/getSingleProject',{id:20},403);
    await check('works/history',{},0,{projectId:'10'});
    await check('works/history',{},403,{projectId:'20'});
  });
  await t.test("own project cannot disguise foreign/missing/nested resources", async () => {
    await check("assets/updateAssets", { projectId: 10, id: 201 }, 403);
    await check("assets/updateAssets", { id: 999 }, 403);
    await check("assets/batchDelete", { id: [101, 201] }, 403);
    await check("assetsGenerate/batchGenerateImageAssets", { items: [{ id: 101 }, { id: 201 }] }, 403);
    await check("production/workbench/generateVideo", { projectId: 10, uploadData: [{ sources: "storyboard", id: 201 }] }, 403);
  });
  await t.test("relationships cannot cross projects/episodes/parents", async () => {
    await check("assets/updateAssets", { projectId: 10, id: 401 }, 403);
    await check("production/workbench/selectVideo", { trackId: 401, videoId: 101 }, 403);
    await check("assets/saveAssets", { id: 101, imageId: 401 }, 403);
    await check("production/storyboard/editStoryboardInfo", { id: 401, scriptId: 101 }, 403);
  });
  await t.test("query references and unknown ID parameters fail closed", async () => {
    await check("assets/getImage", {}, 403, { assetsId: "201" });
    await check("assets/getImage", { id: 201 }, 400);
    await check("assets/updateAssets", { id: -1 }, 400);
    await check("assets/batchDelete", { id: Array(501).fill(101) }, 400);
    await check("assets/getAssets", { scriptId: 0, projectId: 10 }, 0);
  });
  await t.test("flow owners and shared legacy links cannot grant foreign access", async () => {
    await check("production/editImage/getImageFlow", { id: 301 }, 0);
    await check("production/editImage/getImageFlow", { id: 302 }, 0);
    await check("production/editImage/getImageFlow", { id: 303 }, 403);
    await check("novel/event/deletEvent", { id: 101 }, 403);
  });
});

test("generation tasks enforce owner, running limit, retention and capacity", () => {
  let now = 1000;
  const expired: string[] = [];
  const tasks = new OwnedTasks<{ status: string }>((id) => expired.push(id), () => now);
  for (let i = 0; i < 6; i++) assert.equal(tasks.create(String(i), 1, { status: "running" }), true);
  assert.equal(tasks.create("limit", 1, { status: "running" }), false);
  assert.equal(tasks.getForUser("0", 2), undefined);
  assert.equal(tasks.deleteForUser("0", 1), false);
  tasks.set("0", { status: "completed" });
  assert.equal(tasks.deleteForUser("0", 2), false);
  assert.equal(tasks.deleteForUser("0", 1), true);
  assert.equal(tasks.create("done", 1, { status: "completed" }), true);
  now += 24 * 60 * 60 * 1000 + 1;
  assert.equal(tasks.getForUser("done", 1), undefined);
  assert.ok(expired.includes("done"));
  for (let i = 0; i < 2010; i++) assert.equal(tasks.create(`done-${i}`, 2, { status: "completed" }), true);
  assert.equal(tasks.getForUser("done-0", 2), undefined);
  assert.ok(tasks.getForUser("done-2009", 2));
});

test("media cannot become an executable same-origin document", () => {
  const payload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
  for (const ext of ["svg", "png", "mp4", "jpg"]) assert.equal(isAllowedMedia(payload, ext), false);
  assert.equal(isAllowedMedia(Buffer.from([137,80,78,71,13,10,26,10]), "png"), true);
  for (const type of ["text/html", "image/svg+xml", "application/xml"]) assert.equal(safeInlineMediaType(type), "application/octet-stream");
  assert.equal(safeInlineMediaType("image/png; charset=utf-8"), "image/png");
});

test("shared manual paths reject traversal, empty roots and symlinks", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xoi-skill-security-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const value of ["", ".", "..", "../a", "a/b", "a\\b", " a", "1"]) assert.throws(() => skillDirectory(root, value));
  assert.equal(skillDirectory(root, "导演手册"), path.join(root, "导演手册"));
  fs.symlinkSync(os.tmpdir(), path.join(root, "link"));
  assert.throws(() => skillDirectory(root, "link"));
});

test("parsed defaults and field stripping reach handlers; abuse bounds reject", () => {
  const guard = validateFields({ title: z.string().default("default"), limit: z.number().optional() });
  const req = { body: { unwanted: "value" } } as any;
  let called = false, status = 0;
  const res = { status(value: number) { status = value; return this; }, json() {} } as any;
  guard(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.deepEqual(req.body, { title: "default" });
  guard({ body: { limit: 1000000 } } as any, res, () => assert.fail("must not run"));
  assert.equal(status, 400);
});

test("public media cannot inherit trusted private upstream permissions", async () => {
  const previous = process.env.XOI_ALLOW_PRIVATE_UPSTREAMS;
  process.env.XOI_ALLOW_PRIVATE_UPSTREAMS = "true";
  try {
    await assert.rejects(fetchBinaryWithLimit("http://127.0.0.1:18763/probe.txt"), (error: any) => error.status === 400);
    await assert.rejects(fetchPublicResponse("http://169.254.169.254/latest/meta-data"));
    const lookup = makeSafeLookup(false, ((_host: any, _opts: any, callback: any) => callback(null, [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }])) as any);
    const error = await new Promise((resolve) => lookup("attacker.example", { all: true }, (error: Error) => resolve(error)));
    assert.ok(error instanceof Error);
  } finally {
    if (previous === undefined) delete process.env.XOI_ALLOW_PRIVATE_UPSTREAMS; else process.env.XOI_ALLOW_PRIVATE_UPSTREAMS = previous;
  }
});

test("gateway paths enforce exact boundaries and reject traversal before normalization", () => {
  for (const route of ["models", "models?limit=5", "responses/task-id", "chat/completions", "images/edits"]) assert.equal(allowedGatewayTail(route), true);
  for (const route of ["models-malicious", "responses-admin", "api/token", "videos"]) assert.equal(allowedGatewayTail(route), false);
  for (const route of ["chat/../token", "chat/%2e%2e/token", "chat/%2fapi", "chat/%5capi", "chat/%00", "chat/%ZZ"]) assert.throws(() => allowedGatewayTail(route));
});

test("file scans filter extensions and omit symbolic links without glob parsing", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xoi-file-security-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "SKILL.md"), "content");
  fs.writeFileSync(path.join(root, "nested", "ref.json"), "{}");
  fs.writeFileSync(path.join(root, "run.sh"), "ignored");
  fs.symlinkSync(os.tmpdir(), path.join(root, "link"));
  assert.deepEqual(await listFiles(root, [".md", ".json"]), ["SKILL.md", "nested/ref.json"]);
  assert.deepEqual(await listFiles(root, [".md", ".json"], false), ["SKILL.md"]);
});
