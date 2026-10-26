/** Follow up only the explicitly named acceptance project. No price/config changes. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const db = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL });
const base = "http://127.0.0.1:12121";
const results: any[] = []; const budgets: string[] = [];
let token = ""; let socket: any;
async function api(path: string, body?: any, billingId?: string) {
  const response = await fetch(base + "/api" + path, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(billingId ? { "X-Xoi-Billing-Id": billingId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(120000) });
  const text = await response.text(); let data: any; try { data = JSON.parse(text); } catch { data = { text }; }
  return { status: response.status, data };
}
async function authorize(path: string, body: any) {
  const preview = await api("/billing/preview", { path, body });
  if (preview.data.data?.quote?.yuan !== 0) throw new Error("拒绝非零价操作");
  const auth = await api("/billing/authorize", { path, points: .01 });
  if (auth.status !== 200) throw new Error("免费测试预算授权失败");
  budgets.push(auth.data.data.id); return auth.data.data.id;
}
async function main() {
  await db.connect();
  const previous = JSON.parse(await readFile("/tmp/xoi-free-flow-audit-20261014.json", "utf8"));
  const project = (await db.query('SELECT * FROM o_project WHERE id=$1 AND "userId"=1', [previous.projectId])).rows[0];
  if (project?.name !== previous.runId || !String(project.name).startsWith("验收测试-20261014-")) throw new Error("不能改已有用户项目");
  const user = (await db.query('SELECT id,session_version FROM o_user WHERE id=1')).rows[0];
  const secret = (await db.query('SELECT value FROM o_setting WHERE key=$1', ["tokenKey"])).rows[0].value;
  token = jwt.sign({ id: Number(user.id), session_version: Number(user.session_version || 0) }, secret, { expiresIn: 1800 });
  const agents = (await db.query('SELECT "modelName" FROM "o_agentDeploy"')).rows;
  if (agents.some(a => !/^newapi:agnes/.test(a.modelName))) throw new Error("拒绝非免费Agent");
  // Use a real style identifier, not the display label, on this test project only.
  const edit = await api("/project/editProject", { ...project, id: Number(project.id), artStyle: "realpeople_urban_modern" });
  results.push({ operation: "测试项目选择有效视觉手册", ...edit });
  const asset = (await db.query('SELECT * FROM o_assets WHERE "projectId"=$1 AND type=$2 ORDER BY id LIMIT 1', [project.id, "role"])).rows[0];
  if (asset) {
    const body = { projectId: Number(project.id), assetsId: Number(asset.id), type: asset.type, name: asset.name, describe: asset.describe };
    const id = await authorize("/assetsGenerate/polishAssetsPrompt", body);
    const start = Date.now(); const response = await api("/assetsGenerate/polishAssetsPrompt", body, id);
    const state = (await db.query('SELECT id,"promptState",prompt,"promptErrorReason" FROM o_assets WHERE id=$1', [asset.id])).rows[0];
    results.push({ operation: "真实免费提示词优化", ms: Date.now() - start, ...response, state, billingId: id });
    console.log(JSON.stringify({ operation: "真实免费提示词优化", ms: Date.now() - start, status: response.status, state: state.promptState, hasPrompt: !!state.prompt }));
  }
  const path = "/socket/scriptAgent";
  const id = await authorize(path, { model: "newapi:agnes-2.5-flash", content: "只用中文写3个镜头提纲，50字以内，不调用工具。" });
  const { io } = await import(pathToFileURL(resolve("../frontend/node_modules/socket.io-client/build/esm/index.js")).href);
  socket = io(base + "/api/socket/scriptAgent", { transports: ["websocket"], reconnection: false,
    auth: { token: "Bearer " + token, projectId: Number(project.id), isolationKey: project.id + ":scriptAgent" } });
  const events: any[] = []; const states = new Map<string, string>(); let last = Date.now();
  socket.onAny((event: string, data: any) => { last = Date.now(); if (events.length < 1500) events.push({ event, data }); if (event === "message" || event === "message:update") states.set(data.id, data.status); });
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); setTimeout(() => reject(new Error("实时连接超时")), 15000).unref(); });
  socket.emit("chat", { model: "newapi:agnes-2.5-flash", billingId: id, content: "验收测试：只用中文简短答复雨天咖啡店广告的三个镜头提纲，每个镜头一句，总计80字以内。不写长剧本，不调用任何工具，不改项目，不生成图片视频音频。" });
  const start = Date.now();
  while (Date.now() - start < 90000) {
    if (states.size && [...states.values()].every(s => ["complete", "error", "stop"].includes(s)) && Date.now() - last > 2000) break;
    const receipt = (await api("/billing/receipt/" + id)).data.data;
    if (receipt?.budget?.calls >= 5 || receipt?.budget?.state === "stopped") { socket.emit("stop", {}); await api("/billing/budget/" + id + "/stop", {}); break; }
    await new Promise(r => setTimeout(r, 2000));
  }
  socket.emit("stop", {}); socket.disconnect();
  results.push({ operation: "真实免费剧本Socket助手", billingId: id, ms: Date.now() - start, states: Object.fromEntries(states), events });
  console.log(JSON.stringify({ operation: "真实免费剧本Socket助手", ms: Date.now() - start, states: Object.fromEntries(states), eventCount: events.length }));
  results.push({ operation: "音频任务读取接口", ...await api("/v1/canvas/audio-tasks/audit-nonexistent") });
  results.push({ operation: "重新读取项目与剧本", projectId: Number(project.id), scripts: (await db.query('SELECT id,name,"extractState" FROM o_script WHERE "projectId"=$1', [project.id])).rows });
}
void main().catch(error => { results.push({ error: error.message }); console.error(error.message); process.exitCode = 1; }).finally(async () => {
  socket?.disconnect();
  for (const id of budgets) { results.push({ operation: "真实费用回执", billingId: id, ...await api("/billing/receipt/" + id) }); await api("/billing/budget/" + id + "/stop", {}); }
  await writeFile("/tmp/xoi-free-flow-extra-20261014.json", JSON.stringify(results, null, 2));
  await db.end();
});
