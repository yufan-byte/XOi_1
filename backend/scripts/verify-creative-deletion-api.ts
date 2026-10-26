/** Real local HTTP lifecycle; only this run's uniquely named fixture projects are mutated. No AI/payment APIs. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const base = process.env.XOI_AUDIT_BASE || "http://localhost:12121";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Only the local delivery server is allowed");
const db = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
const marker = "__删除接口验收__" + randomUUID();
const fixtures: number[] = [];
let token = "", userId = 0, checks = 0;
async function post(route: string, body: unknown, credential = token) {
  return fetch(base + "/api/" + route, {
    method: "POST", headers: { Authorization: "Bearer " + credential, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
}
async function expectStatus(route: string, body: unknown, status: number, credential = token) {
  const response = await post(route, body, credential);
  assert.equal(response.status, status, route + ": " + (await response.text()).slice(0, 400));
  checks++;
}
async function insert(table: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  // All identifiers below are internal fixture constants, never user input.
  const columns = keys.map(key => '"' + key + '"').join(",");
  return Number((await db.query('INSERT INTO "' + table + '" (' + columns + ") VALUES (" + keys.map((_, i) => "$" + (i + 1)).join(",") + ') RETURNING id', Object.values(fields))).rows[0].id);
}
async function count(table: string, field: string, id: number) {
  return Number((await db.query('SELECT count(*) n FROM "' + table + '" WHERE "' + field + '"=$1', [id])).rows[0].n);
}
async function createProject() {
  const name = marker + "-" + fixtures.length;
  await expectStatus("project/addProject", { projectType: "script", name, intro: marker, type: "test", artStyle: "", directorManual: "", videoRatio: "16:9", imageModel: "", videoModel: "", imageQuality: "1K", mode: "" }, 200);
  const id = Number((await db.query('SELECT id FROM o_project WHERE name=$1 AND "userId"=$2', [name, userId])).rows[0].id);
  fixtures.push(id);
  return id;
}
async function main() {
  await db.connect();
  const secret = (await db.query("SELECT value FROM o_setting WHERE key='tokenKey'")).rows[0]?.value;
  const users = (await db.query("SELECT o.id,o.session_version FROM o_user o JOIN users u ON o.id=u.id WHERE o.status<>'banned' AND u.status=1 AND u.deleted_at IS NULL ORDER BY o.id LIMIT 100")).rows;
  const owner = users.find(row => Number(row.id) === Number(process.env.XOI_AUDIT_OWNER || 1));
  assert.ok(secret && owner, "Active local fixture owner and signing key are required");
  userId = Number(owner.id);
  const sign = (row: any) => jwt.sign({ id: Number(row.id), session_version: Number(row.session_version || 0) }, secret, { expiresIn: 600 });
  token = sign(owner);
  const project = await createProject(), kept = await createProject();
  await insert("o_agentWorkData", { projectId: kept, key: "scriptAgent", data: JSON.stringify({ script: [{ name: marker + "-draft", content: marker }] }) });
  await expectStatus("scriptAgent/adoptScripts", { projectId: kept }, 200);
  await expectStatus("scriptAgent/adoptScripts", { projectId: kept }, 409);
  assert.equal(await count("o_script", "projectId", kept), 1, "draft adoption uses the shared DB transaction API");
  // A fixture file proves rejection leaves media intact and successful deletion cleans the project directory.
  const media = path.join(process.cwd(), "data", "oss", String(project), "delete-fixture.txt");
  await fs.mkdir(path.dirname(media), { recursive: true });
  await fs.writeFile(media, marker);
  const novels = [];
  for (const id of [project, project, kept]) novels.push(await insert("o_novel", { projectId: id, chapter: marker, chapterData: marker, eventState: 1 }));
  const events = [];
  for (let i = 0; i < 4; i++) events.push(await insert("o_event", { name: marker, detail: marker }));
  for (const [eventId, novelId] of [[events[0], novels[0]], [events[1], novels[0]], [events[1], novels[1]], [events[2], novels[1]], [events[3], novels[2]]]) await insert("o_eventChapter", { eventId, novelId });
  await expectStatus("novel/batchDeleteNovel", { ids: [] }, 400);
  await expectStatus("novel/delNovel", { id: -1 }, 400);
  const other = users.find(row => Number(row.id) !== userId);
  if (other) {
    await expectStatus("novel/delNovel", { id: novels[0] }, 403, sign(other));
    await expectStatus("novel/event/deletEvent", { id: events[0] }, 403, sign(other));
    await expectStatus("project/delProject", { id: project }, 403, sign(other));
  }
  assert.equal(await fs.readFile(media, "utf8"), marker);
  await expectStatus("novel/delNovel", { id: novels[0] }, 200);
  assert.equal(await count("o_event", "id", events[0]), 0);
  assert.equal(await count("o_event", "id", events[1]), 1);
  assert.equal(await count("o_event", "id", events[3]), 1);
  await expectStatus("novel/event/deletEvent", { id: events[1] }, 200);
  await expectStatus("novel/event/batchDeleteEvent", { ids: [events[2]] }, 200);
  await expectStatus("novel/batchDeleteNovel", { ids: [novels[1]] }, 200);
  // Refill chapter associations so deleting the whole project exercises foreign-key ordering too.
  const chapter = await insert("o_novel", { projectId: project, chapter: marker, chapterData: marker, eventState: 1 });
  const event = await insert("o_event", { name: marker, detail: marker });
  await insert("o_eventChapter", { novelId: chapter, eventId: event });
  const episodes = [];
  for (let i = 0; i < 2; i++) {
    await expectStatus("script/addScript", { projectId: project, name: marker + i, content: marker, assets: [] }, 200);
    episodes.push(Number((await db.query('SELECT id FROM o_script WHERE "projectId"=$1 AND name=$2', [project, marker + i])).rows[0].id));
  }
  const asset = await insert("o_assets", { projectId: project, scriptId: episodes[0], name: marker, promptState: "已完成" });
  const image = await insert("o_image", { assetsId: asset, state: "生成成功" });
  await db.query('UPDATE o_assets SET "imageId"=$1 WHERE id=$2', [image, asset]);
  for (const scriptId of episodes) {
    await db.query('INSERT INTO "o_scriptAssets" ("scriptId","assetId") VALUES ($1,$2)', [scriptId, asset]);
    const frame = await insert("o_storyboard", { projectId: project, scriptId, state: "已完成" });
    await db.query('INSERT INTO "o_assets2Storyboard" ("storyboardId","assetId") VALUES ($1,$2)', [frame, asset]);
    await insert("o_videoTrack", { projectId: project, scriptId, state: "已完成" });
    await insert("o_video", { projectId: project, scriptId, state: "生成成功" });
    await insert("o_output", { projectId: project, episodesId: scriptId, name: marker });
  }
  await db.query('UPDATE o_script SET "extractState"=2 WHERE id=$1', [episodes[0]]);
  await expectStatus("script/delScript", { ids: [episodes[0]] }, 409);
  await expectStatus("project/delProject", { id: project }, 409);
  assert.equal(await count("o_output", "projectId", project), 2);
  assert.equal(await fs.readFile(media, "utf8"), marker);
  await db.query('UPDATE o_script SET "extractState"=1 WHERE id=$1', [episodes[0]]);
  await expectStatus("script/delScript", { ids: [episodes[0]] }, 200);
  for (const table of ["o_video", "o_videoTrack", "o_storyboard"]) assert.equal(await count(table, "scriptId", episodes[0]), 0, table);
  assert.equal(await count("o_output", "episodesId", episodes[0]), 0);
  assert.equal(await count("o_output", "episodesId", episodes[1]), 1);
  assert.equal(await count("o_assets", "id", asset), 1);
  assert.equal(await count("o_image", "id", image), 1);
  const flow = await post("production/getFlowData", { projectId: project, episodesId: episodes[1] });
  assert.equal(flow.status, 200);
  const remaining = (await flow.json() as any).data;
  assert.equal(remaining.script, marker);
  assert.ok(remaining.assets.some((row: any) => Number(row.id) === asset));
  assert.equal(remaining.output.length, 1);
  checks++;
  await expectStatus("project/delProject", { id: project }, 200);
  assert.equal(await count("o_event", "id", event), 0);
  assert.equal(await count("o_output", "projectId", project), 0);
  assert.equal(await count("o_image", "id", image), 0);
  await assert.rejects(() => fs.access(media), { code: "ENOENT" });
  assert.equal(await count("o_novel", "projectId", kept), 1);
  assert.equal(await count("o_event", "id", events[3]), 1);
  console.log(JSON.stringify({ passed: true, apiChecks: checks, crossOwnerChecks: other ? 3 : 0, busyRejectionPreservesMedia: true, projectDirectoryCleanedAfterCommit: true, sharedAssetsPreservedOnEpisodeDelete: true, unrelatedFixturePreserved: true, modelCalls: 0, paymentCalls: 0 }));
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  try {
    // The name+owner checks protect all pre-existing projects from cleanup.
    for (const id of fixtures) {
      const row = (await db.query('SELECT name,"userId" FROM o_project WHERE id=$1', [id])).rows[0];
      if (!row) continue;
      assert.ok(row.name.startsWith(marker) && Number(row.userId) === userId);
      await db.query('UPDATE o_script SET "extractState"=1 WHERE "projectId"=$1', [id]);
      await expectStatus("project/delProject", { id }, 200);
    }
    assert.equal(Number((await db.query("SELECT count(*) n FROM o_event WHERE name=$1", [marker])).rows[0].n), 0);
    console.log("Own fixture projects and events cleaned up.");
  } catch (error) { console.error("Own fixture cleanup failed: " + (error instanceof Error ? error.message : "unknown")); process.exitCode = 1; }
  await db.end();
});
