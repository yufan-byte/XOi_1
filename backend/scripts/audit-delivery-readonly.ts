/** Authenticated delivery audit. Only SELECT and read APIs; no model, payment or project writes. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { productionSecurityBlockers } from "../src/utils/productionSecurityPolicy";
import { productionBillingBlockers, productionPricingBlockers } from "../src/utils/productionBillingPolicy";

const base = process.env.XOI_AUDIT_BASE || "http://localhost:10588";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("This audit only operates against the local delivery instance");
const database = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
const report: { check: string; passed: boolean; detail?: string }[] = [];
const readPosts = new Set(["/api/project/getProject", "/api/script/getScrptApi", "/api/production/getFlowData"]);
let readRequests = 0;
async function request(path: string, token?: string, body?: unknown) {
  if (body && !readPosts.has(path)) throw new Error("Audit refused a non-read POST");
  readRequests++;
  return fetch(base + path, {
    method: body ? "POST" : "GET", headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
}
async function check(name: string, run: () => Promise<void>) {
  try { await run(); report.push({ check: name, passed: true }); }
  catch (error) { report.push({ check: name, passed: false, detail: error instanceof Error ? error.message : "Unexpected response" }); }
}

async function main() {
  await database.connect();
  await database.query("BEGIN READ ONLY");
  const secret = (await database.query("SELECT value FROM o_setting WHERE key=$1", ["tokenKey"])).rows[0]?.value;
  assert.ok(secret, "Application signing key must be configured");
  const identities = (await database.query(`SELECT o.id,o.role,o.session_version FROM o_user o JOIN users u ON o.id=u.id
    WHERE o.status<>'banned' AND u.status=1 AND u.deleted_at IS NULL ORDER BY o.id LIMIT 100`)).rows;
  const admin = identities.find(row => row.role === "admin");
  const member = identities.find(row => row.role !== "admin");
  const owner = identities.find(row => Number(row.id) === Number(process.env.XOI_AUDIT_OWNER || 1));
  assert.ok(owner, "Audit owner must be an active existing account");
  const sign = (row: any, expiresIn = 300) => jwt.sign({ id: Number(row.id), session_version: Number(row.session_version || 0) }, secret, { expiresIn });
  const token = sign(owner);
  for (const path of ["/api/healthz", "/api/readyz"]) await check(path, async () => { assert.equal((await request(path)).status, 200); });
  const adminPaths = ["/api/admin/tasks", "/api/admin/billing", "/api/admin/billing/security", "/api/admin/credits"];
  for (const path of adminPaths) {
    await check("anonymous denied " + path, async () => { assert.equal((await request(path)).status, 401); });
    if (member) await check("member denied " + path, async () => { assert.equal((await request(path, sign(member))).status, 403); });
    if (admin) await check("admin read " + path, async () => {
      const response = await request(path, sign(admin)); assert.equal(response.status, 200);
      const body = await response.json() as any; assert.equal(body.code, 200); assert.ok(body.data);
    });
  }
  await check("expired session denied", async () => { assert.equal((await request("/api/workspace/generation-tasks", sign(owner, -1))).status, 401); });
  await check("task summary is bounded and omits generation payload", async () => {
    const response = await request("/api/workspace/generation-tasks", token); assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    const body = await response.json() as any; assert.ok(Array.isArray(body.data)); assert.ok(body.data.length <= 50);
    for (const row of body.data) for (const field of ["request", "payload", "apiKey", "headers", "prompt"]) assert.equal(row[field], undefined);
  });
  const response = await request("/api/project/getProject", token, {});
  assert.equal(response.status, 200);
  const projects = (await response.json() as any).data;
  assert.ok(Array.isArray(projects));
  await check("project list matches persisted ownership", async () => {
    const owned = new Set((await database.query('SELECT id FROM o_project WHERE "userId"=$1', [owner.id])).rows.map(row => String(row.id)));
    assert.equal(projects.length, owned.size); for (const project of projects) assert.ok(owned.has(String(project.id)));
  });
  let episodes = 0;
  const candidates = projects.slice(0, 5);
  for (const project of candidates) {
    const scriptsResponse = await request("/api/script/getScrptApi", token, { projectId: Number(project.id), name: "" });
    assert.equal(scriptsResponse.status, 200);
    const scripts = (await scriptsResponse.json() as any).data; assert.ok(Array.isArray(scripts));
    for (const script of scripts.slice(0, 2)) {
      await check(`director context project ${project.id} episode ${script.id}`, async () => {
        const flowResponse = await request("/api/production/getFlowData", token, { projectId: Number(project.id), episodesId: Number(script.id) });
        assert.equal(flowResponse.status, 200);
        const { data } = await flowResponse.json() as any;
        assert.equal(data.script, script.content || "");
        assert.ok(Array.isArray(data.assets)); assert.ok(Array.isArray(data.storyboard)); assert.ok(Array.isArray(data.output));
        assert.ok(data.videoProgress && Number.isFinite(data.videoProgress.total)); episodes++;
      });
    }
  }
  // Evaluate the real production rules explicitly: a dev readyz=200 is not a release gate.
  const securityBlockers = productionSecurityBlockers({ ...process.env, NODE_ENV: "production" });
  const agents = (await database.query('SELECT key,"modelName" FROM "o_agentDeploy"')).rows;
  const channels = (await database.query("SELECT id,tag,status,models FROM channels")).rows;
  const billingBlockers = productionBillingBlockers(agents, channels);
  const upstream = channels.find(channel => Number(channel.status) === 1 && (process.env.XOI_UPSTREAM_CHANNEL_ID
    ? Number(channel.id) === Number(process.env.XOI_UPSTREAM_CHANNEL_ID) : channel.tag === "zaowu-all"));
  const priceTable = (await database.query("SELECT to_regclass('xoi_upstream_pricing_sync') name")).rows[0]?.name;
  const priceRecord = upstream && priceTable ? (await database.query("SELECT synced_at,snapshot FROM xoi_upstream_pricing_sync WHERE channel_id=$1", [upstream.id])).rows[0] : undefined;
  const production = { configuredMode: process.env.NODE_ENV || "unset", securityBlockers, billingBlockers, pricingBlockers: productionPricingBlockers(priceRecord) };
  await database.query("ROLLBACK");
  const output = {
    passed: report.every(row => row.passed),
    readyForProduction: !securityBlockers.length && !billingBlockers.length && !production.pricingBlockers.length,
    production, projectsChecked: candidates.length, episodesChecked: episodes, readRequests, modelRequests: 0, paymentRequests: 0, writes: 0, checks: report,
  };
  const file = process.env.XOI_AUDIT_REPORT || "/tmp/xoi-delivery-readonly.json";
  await writeFile(file, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
  if (!output.passed) process.exitCode = 1;
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => database.end());
