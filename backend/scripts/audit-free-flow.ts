/** User-authorized local acceptance. Never imports db initialization; never touches prices. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:12121";
const db = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL });
let runId = `验收测试-20261014-${randomUUID().slice(0, 8)}`;
const steps: any[] = [];
const budgets: string[] = [];
let token = "";
let actualCalls = 0;
async function request(path: string, body?: unknown, billingId?: string, timeout = 180000) {
  const start = Date.now();
  const response = await fetch(base + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(billingId ? { "X-Xoi-Billing-Id": billingId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text(); let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 160) }; }
  return { status: response.status, ms: Date.now() - start, data };
}
async function freeCall(path: string, body: any) {
  if (++actualCalls > 12) throw new Error("本次测试达到12次业务提交上限");
  const preview = await request("/billing/preview", { path, body });
  if (preview.status !== 200 || preview.data?.data?.quote?.yuan !== 0) throw new Error(`拒绝非零价请求 ${path}`);
  const auth = await request("/billing/authorize", { path, points: .01 });
  if (auth.status !== 200) throw new Error("预算授权失败");
  const id = auth.data.data.id; budgets.push(id);
  const response = await request(path, body, id);
  steps.push({ operation: path, model: body.model || preview.data.data.model, previewYuan: 0, ...response, billingId: id });
  console.log(JSON.stringify({ operation: path, status: response.status, ms: response.ms, previewYuan: 0, response: JSON.stringify(response.data).slice(0, 400) }));
  return response;
}
async function waitExtraction(projectId: number, scriptId: number) {
  for (let i = 0; i < 48; i++) {
    const row = (await db.query('SELECT id,"extractState","errorReason" FROM o_script WHERE "projectId"=$1 AND id=$2', [projectId, scriptId])).rows[0];
    if (row && [1,-1].includes(Number(row.extractState))) {
      const assets = (await db.query('SELECT id,name,type,describe FROM o_assets WHERE "projectId"=$1', [projectId])).rows;
      steps.push({ operation: "素材提取终态", script: row, assets });
      console.log(JSON.stringify({ operation: "素材提取终态", state: row.extractState, error: row.errorReason, assetCount: assets.length }));
      return;
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  steps.push({ operation: "素材提取等待超时（不是成功）" });
}
async function waitTasks() {
  for (const task of steps.filter(s => ["/canvas-image-tasks", "/canvas-video"].includes(s.operation) && s.data?.task_id)) {
    const start = Date.now(); let result;
    for (let i = 0; i < 60; i++) {
      result = await request(task.operation + "/" + task.data.task_id);
      if (["succeeded", "failed", "unknown"].includes(result.data?.status) || result.status !== 200) break;
      await new Promise(r => setTimeout(r, 3000));
    }
    steps.push({ operation: "异步任务终态", taskId: task.data.task_id, waitedMs: Date.now() - start, ...result });
    console.log(JSON.stringify({ operation: "异步任务终态", taskId: task.data.task_id, state: result?.data?.status, error: result?.data?.error }));
  }
}
async function main() {
  await db.connect();
  const user = (await db.query('SELECT u.id,u.session_version,n.quota,n.status,n."group" FROM o_user u JOIN users n ON n.id=u.id WHERE u.id=1')).rows[0];
  const secret = (await db.query('SELECT value FROM o_setting WHERE key=$1', ["tokenKey"])).rows[0]?.value;
  if (!user || !secret || Number(user.status) !== 1) throw new Error("本地测试账号不可用");
  token = jwt.sign({ id: Number(user.id), session_version: Number(user.session_version || 0) }, secret, { expiresIn: 3600 });
  const catalog = (await request("/model-catalog")).data.data;
  const channels = (await db.query('SELECT id,name,status,models,"group" FROM channels')).rows;
  const options = Object.fromEntries((await db.query('SELECT key,value FROM options WHERE key=ANY($1)', [["ModelPrice", "ModelRatio"]])).rows.map(r => [r.key, JSON.parse(r.value)]));
  const agents = (await db.query('SELECT key,"modelName" FROM "o_agentDeploy" ORDER BY key')).rows;
  const free = catalog.filter((r: any) => /^agnes/.test(r.modelName));
  const preflight = { runId, points: Number(user.quota) / 50000, group: user.group,
    freeModels: free.map((r: any) => ({ model: r.modelName, type: r.type, yuan: r.price?.yuan, zeroOption: options.ModelPrice[r.modelName] })),
    channels: channels.map(c => ({ id: c.id, name: c.name, status: c.status, modelCount: String(c.models).split(",").length, agnes: String(c.models).split(",").filter(m => /^agnes/.test(m)) })), agents };
  console.log(JSON.stringify(preflight, null, 2));
  if (!process.argv.includes("--run-free") && !process.argv.includes("--resume-free")) return;
  if (!free.length || free.some((r: any) => r.price?.yuan !== 0 || options.ModelPrice[r.modelName] !== 0)) throw new Error("Agnes零价检查不通过");
  const agnesChannels = channels.filter(c => Number(c.status) === 1 && String(c.models).split(",").some(m => /^agnes/.test(m)));
  if (agnesChannels.length !== 1 || Number(agnesChannels[0].id) !== 1 || String(agnesChannels[0].models).split(",").some(m => !/^agnes/.test(m))) throw new Error("免费渠道路由不唯一，拒绝调用");
  if (agents.some(a => !/^newapi:agnes/.test(String(a.modelName)))) throw new Error("辅助Agent不是全部免费模型，拒绝实际流程");
  const started = Date.now(); const quotaBefore = Number(user.quota);
  let projectId: number | undefined;
  try {
    if (process.argv.includes("--resume-free")) {
      const previous = JSON.parse(await readFile("/tmp/xoi-free-flow-audit-20261014.json", "utf8"));
      projectId = Number(previous.projectId); runId = previous.runId;
      const owned = (await db.query('SELECT id,name FROM o_project WHERE id=$1 AND "userId"=1', [projectId])).rows[0];
      if (!owned || owned.name !== runId || !String(runId).startsWith("验收测试-20261014-")) throw new Error("仅可恢复本次验收测试项目");
      steps.push(...previous.steps); budgets.push(...previous.steps.filter((s: any) => s.operation === "真实费用回执").map((s: any) => s.billingId));
      actualCalls = previous.steps.filter((s: any) => s.previewYuan === 0 && s.billingId).length;
      const scriptId = Number((await db.query('SELECT id FROM o_script WHERE "projectId"=$1 ORDER BY id DESC LIMIT 1', [projectId])).rows[0]?.id);
      await freeCall("/script/extractAssets", { projectId, scriptIds: [scriptId], groupSize: 1 });
      await waitExtraction(projectId!, scriptId);
      const flow = await request("/production/getFlowData", { projectId, episodesId: scriptId });
      steps.push({ operation: "素材提取后打开导演工作区", status: flow.status, data: flow.data });
      await waitTasks();
      return;
    }
    await freeCall("/v1/chat/completions", { model: "agnes-2.5-flash", stream: false, max_tokens: 300,
      messages: [{ role: "user", content: "你是短片编剧。用中文写一段15秒温暖咖啡店广告短片剧本，3个镜头、2个人物阿禾和小雨。主题是雨天互相递伞。只给剧本，200字以内。" }] });
    const created = await request("/project/addProject", { projectType: "script", name: runId, intro: "免费验收测试：雨天咖啡店递伞，3镜头15秒", type: "温暖日常", artStyle: "realpeople_urban_modern", directorManual: "", videoRatio: "16:9", imageModel: "newapi:agnes-image-2.5-flash", videoModel: "newapi:agnes-video-v2.0", imageQuality: "1K", mode: "text" });
    steps.push({ operation: "创建测试项目（不收费）", ...created });
    projectId = Number((await db.query('SELECT id FROM o_project WHERE name=$1 AND "userId"=1 ORDER BY id DESC LIMIT 1', [runId])).rows[0]?.id);
    if (!Number.isSafeInteger(projectId)) throw new Error("未找到新建测试项目");
    const novel = await freeCall("/novel/addNovel", { projectId, data: [{ index: 1, reel: "验收", chapter: "雨天的伞", chapterData: "雨水打在咖啡店玻璃上。阿禾推开门，看见小雨没有带伞。他递来一杯热咖啡，把伞放在柜台。小雨微笑，将伞撑开，两人一起走入雨幕。" }] });
    if (novel.status === 200) {
      for (let i = 0; i < 12; i++) {
        const chapters = (await db.query('SELECT id,"eventState",event,"errorReason" FROM o_novel WHERE "projectId"=$1', [projectId])).rows;
        if (chapters.length && chapters.every(c => Number(c.eventState) !== 0)) { steps.push({ operation: "章节事件分析结果", chapters }); break; }
        await new Promise(r => setTimeout(r, 2500));
      }
    }
    const story = "场景：雨天咖啡店。人物：阿禾、小雨。镜头1：雨滴划过窗玻璃，阿禾递上热咖啡。镜头2：小雨接过纸杯，笑着拿起伞。镜头3：两人撑伞走进雨中，字幕：温暖，一起分享。";
    const save = await request("/script/addScript", { name: runId + "-第1集", content: story, projectId, assets: [] });
    steps.push({ operation: "保存正式剧本（不收费）", ...save });
    const scriptId = Number((await db.query('SELECT id FROM o_script WHERE "projectId"=$1 ORDER BY id DESC LIMIT 1', [projectId])).rows[0]?.id);
    if (scriptId) {
      await freeCall("/script/extractAssets", { projectId, scriptIds: [scriptId], groupSize: 1 });
      await waitExtraction(projectId!, scriptId);
      const flow = await request("/production/getFlowData", { projectId, episodesId: scriptId });
      steps.push({ operation: "打开导演工作区（不收费）", status: flow.status, data: flow.data });
    }
    // Single simple image, single 5-second video; no auto-regeneration or paid fallback.
    const image = await freeCall("/canvas-image-tasks", { model: "agnes-image-2.5-flash", prompt: "A warm coffee shop on a rainy day, one cup of coffee on a wooden counter, cinematic realistic photograph, no text", size: "1024x1024", n: 1, aspect_ratio: "1:1" });
    if (image.status === 200) steps.push({ operation: "生图任务已提交", data: image.data });
    await freeCall("/canvas-video", { model: "agnes-video-v2.0", prompt: "Rain runs down a warm coffee shop window, cinematic static shot, gentle motion, no people, no text", seconds: 5, duration: 5, resolution: "720p", aspect_ratio: "16:9" });
    await waitTasks();
  } catch (error: any) { steps.push({ operation: "流程异常", message: error.message }); }
  finally {
    for (const id of budgets) {
      const receipt = await request("/billing/receipt/" + id);
      steps.push({ operation: "真实费用回执", billingId: id, data: receipt.data });
      await request("/billing/budget/" + id + "/stop", {});
    }
    const links = budgets.length ? (await db.query('SELECT request_id FROM xoi_billing_links WHERE user_id=1 AND billing_id=ANY($1::uuid[])', [budgets])).rows.map(r => r.request_id) : [];
    const logs = links.length ? (await db.query('SELECT id,type,quota,model_name,channel_id,request_id FROM logs WHERE user_id=1 AND request_id=ANY($1)', [links])).rows : [];
    const quotaAfter = Number((await db.query('SELECT quota FROM users WHERE id=1')).rows[0].quota);
    const report = { runId, projectId, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), actualSubmissions: actualCalls, quotaBefore, quotaAfter, deltaPoints: (quotaBefore - quotaAfter) / 50000, paidLogs: logs.filter(r => Number(r.quota) > 0), logs, steps };
    await writeFile("/tmp/xoi-free-flow-audit-20261014.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ report: "/tmp/xoi-free-flow-audit-20261014.json", runId, projectId, actualSubmissions: actualCalls, logs: logs.length, paidLogs: report.paidLogs.length, deltaPoints: report.deltaPoints }));
  }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
