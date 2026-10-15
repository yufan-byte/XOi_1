/** Local integration: a generated MP4 fixture, own temporary project, no model/payment requests. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const base = "http://localhost:10588";
const database = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL, connectionTimeoutMillis: 10000 });
const name = "__归档验收__" + randomUUID();
let projectId: number | undefined, uploadedUrl = "", token = "", temp = "";
async function post(route: string, body: unknown) {
  return fetch(base + route, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
}
async function main() {
  await database.connect();
  const owner = (await database.query("SELECT id,session_version FROM o_user WHERE id=1")).rows[0];
  const secret = (await database.query("SELECT value FROM o_setting WHERE key=$1", ["tokenKey"])).rows[0].value;
  token = jwt.sign({ id: Number(owner.id), session_version: Number(owner.session_version || 0) }, secret, { expiresIn: 300 });
  assert.equal((await post("/api/project/addProject", { projectType: "script", name, intro: "自动化临时验收项目", type: "test", artStyle: "", directorManual: "", videoRatio: "16:9", imageModel: "", videoModel: "", imageQuality: "1K", mode: "" })).status, 200);
  projectId = Number((await database.query('SELECT id FROM o_project WHERE name=$1 AND "userId"=1', [name])).rows[0].id);
  assert.equal((await post("/api/script/addScript", { projectId, name: name + "第一集", content: "本地 MP4 归档测试，不调用模型。", assets: [] })).status, 200);
  const episode = Number((await database.query('SELECT id FROM o_script WHERE "projectId"=$1', [projectId])).rows[0].id);

  temp = await fs.mkdtemp(path.join(os.tmpdir(), "xoi-archive-api-"));
  const video = path.join(temp, "fixture.mp4");
  execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=320x180:r=10", "-t", "0.6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video], { timeout: 20000 });
  const original = await fs.readFile(video);
  // A legal MP4 free box pads a decodable clip beyond the old 18 MiB boundary.
  const bytes = Buffer.alloc(20 * 1024 * 1024); original.copy(bytes);
  bytes.writeUInt32BE(bytes.length - original.length, original.length); bytes.write("free", original.length + 4, "ascii");
  const upload = await fetch(base + "/api/canvas-files?ext=mp4", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/octet-stream" }, body: bytes, signal: AbortSignal.timeout(120000) });
  assert.equal(upload.status, 200); uploadedUrl = (await upload.json() as any).url;
  assert.match(uploadedUrl, /^\/oss\/canvas-files\/1\/[a-f0-9]{32}\.mp4$/);
  const content = { projectId, episodesId: episode, assetUrl: uploadedUrl, name, duration: 0.6, resolution: "320x180" };
  const saved = await post("/api/production/output/saveOutput", content);
  assert.equal(saved.status, 200, "archive the uploaded MP4"); const archive = (await saved.json() as any).data;
  assert.equal(archive.size, bytes.length);
  const flow = await post("/api/production/getFlowData", { projectId, episodesId: episode });
  assert.equal(flow.status, 200); const outputs = (await flow.json() as any).data.output;
  assert.equal(outputs.length, 1); assert.equal(outputs[0].id, archive.id);
  assert.equal(outputs[0].size, bytes.length);
  assert.equal(outputs[0].duration, 1, "fractional duration is normalized to the persisted seconds contract");
  const media = await fetch(base + uploadedUrl, { headers: { Range: "bytes=0-31" }, signal: AbortSignal.timeout(10000) });
  assert.equal(media.status, 206); assert.match(media.headers.get("content-type") || "", /video\/mp4/);
  assert.equal((await media.arrayBuffer()).byteLength, 32);
  assert.equal((await post("/api/production/output/saveOutput", { ...content, assetUrl: uploadedUrl.replace("/1/", "/2/") })).status, 400);
  assert.equal((await post("/api/production/output/saveOutput", { ...content, assetUrl: "https://example.com" + uploadedUrl })).status, 400);
  assert.equal((await post("/api/production/output/saveOutput", { ...content, base64Data: "data:video/mp4;base64,AAAA" })).status, 400);
  assert.equal(Number((await database.query('SELECT count(*) count FROM o_output WHERE "projectId"=$1', [projectId])).rows[0].count), 1);
  console.log(JSON.stringify({ passed: true, uploadedMiB: 20, archiveVisibleInCorrectEpisode: true, mediaRange: true, foreignFileRejected: true, externalUrlRejected: true, conflictingSourcesRejected: true, modelRequests: 0, paymentRequests: 0, cleanup: "own temporary project and upload only" }));
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  try {
    if (projectId) {
      // Delete only this script's uniquely named fixtures; never repair existing projects.
      await database.query('DELETE FROM o_output WHERE "projectId"=$1 AND name=$2', [projectId, name]);
      assert.equal((await post("/api/project/delProject", { id: projectId })).status, 200);
    }
    if (/^\/oss\/canvas-files\/1\/[a-f0-9]{32}\.mp4$/.test(uploadedUrl)) await fs.rm(path.join(process.cwd(), "data", uploadedUrl.slice(1)), { force: true });
    if (temp) await fs.rm(temp, { recursive: true, force: true });
  } catch (error) { console.error("Own fixture cleanup failed:", error instanceof Error ? error.message : "unknown"); process.exitCode = 1; }
  await database.end();
});
