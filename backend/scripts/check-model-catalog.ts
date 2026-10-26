import "@/env";
import pg from "pg";
import jwt from "jsonwebtoken";
import { buildCatalog, publicModel, quoteModel } from "@/lib/model-catalog";
import { syncUpstreamPricing } from "@/lib/model-catalog/sync";
import { getOptions } from "@/lib/agent/newapi-admin";

async function main() {
  if (process.argv.includes("--sync")) {
    const guard = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL });
    await guard.connect();
    try {
      const before = await getOptions();
      const accounts = (await guard.query('SELECT id,quota,used_quota FROM users ORDER BY id')).rows;
      const localPrices = JSON.parse(before.ModelPrice || "{}");
      console.log("sync", await syncUpstreamPricing());
      const after = await getOptions();
      if (before.GroupRatio !== after.GroupRatio || before.GroupGroupRatio !== after.GroupGroupRatio) throw new Error("同步意外改变了售价倍率");
      if (JSON.stringify(accounts) !== JSON.stringify((await guard.query('SELECT id,quota,used_quota FROM users ORDER BY id')).rows)) throw new Error("验证期间账户额度发生变化");
      const prices = JSON.parse(after.ModelPrice || "{}");
      for (const name of Object.keys(localPrices).filter(name => /agnes/i.test(name))) if (prices[name] !== localPrices[name]) throw new Error("同步改变了 Agnes 测试价");
      console.log("sync safeguards", { retailMarkupUnchanged: true, quotaUnchanged: true, agnesPricesUnchanged: true });
    } finally { await guard.end(); }
  }
  const url = process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000";
  const pricing = await fetch(`${url}/api/pricing`).then(r => r.json()) as any;
  const models = buildCatalog(pricing.data);
  const snapshotDb = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL });
  await snapshotDb.connect();
  try {
    const snapshot = (await snapshotDb.query("SELECT snapshot FROM xoi_upstream_pricing_sync WHERE snapshot->>'status'='synced' ORDER BY synced_at DESC LIMIT 1")).rows[0]?.snapshot;
    const tokenRows = (snapshot?.rows || []).filter((r: any) => Number(r.quota_type) === 0 && Number(r.model_price || 0) === 0);
    const bad = tokenRows.filter((source: any) => {
      const live = pricing.data.find((r: any) => r.model_name === source.model_name);
      return live && Number(live.quota_type) === 1;
    });
    if (bad.length) throw new Error(`${bad.length} 个 Token 模型仍被误配置为按次计费`);
    console.log("token billing modes", { checked: tokenRows.length, incorrectlyPerRequest: bad.length });
  } finally { await snapshotDb.end(); }
  console.log("catalog", Object.fromEntries(["text","image","video","audio"].map(type => [type, models.filter(m => m.type === type).length])));
  const unknown: string[] = [];
  for (const model of models) if (!publicModel(model, 1).price) unknown.push(model.modelName);
  console.log("unquoted", unknown);
  if (process.argv.includes("--sync-only")) return;
  for (const name of ["gpt-5.6-sol", "gpt-image-2", "seedance2.0-guanzhuan-720p", "gemini-3.1-flash-tts"]) {
    const model = models.find(m => m.modelName === name);
    if (model) console.log("sample", name, publicModel(model, 1).displayPrice, quoteModel(model, { seconds: 5, inputLength: 1000 }, 1.3));
  }
  const client = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL });
  await client.connect();
  try {
    const secret = (await client.query('SELECT value FROM "o_setting" WHERE key=$1', ["tokenKey"])).rows[0].value;
    const user = (await client.query('SELECT id,session_version FROM "o_user" WHERE id=$1', [1])).rows[0];
    const token = jwt.sign({ id: Number(user.id), session_version: Number(user.session_version || 0) }, secret, { expiresIn: "5m" });
    const balanceResponse = await fetch("http://127.0.0.1:12121/api/login/self", { headers: { Authorization: `Bearer ${token}` } });
    const balance = (await balanceResponse.json() as any).data;
    if (!balanceResponse.ok || balance?.pointsPerYuan !== 10 || !Number.isFinite(balance?.points) || Math.abs(balance.points - Number(balance.quota) / 50000) > 0.000001) throw new Error("余额积分单位未统一为 1 元 = 10 积分");
    console.log("balance units", { pointsPerYuan: balance.pointsPerYuan, consistent: true });
    for (const path of ["/api/model-catalog", "/api/config", "/api/modelSelect/getModelList", "/api/model-catalog/quote", "/api/reseller/models/upstream-status"]) {
      const response = await fetch(`http://127.0.0.1:12121${path}`, { method: path.endsWith("getModelList") || path.endsWith("quote") ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: path.endsWith("getModelList") ? JSON.stringify({type:"all"}) : path.endsWith("quote") ? JSON.stringify({model:"gpt-image-2",params:{n:2}}) : undefined });
      const body = await response.json() as any;
      if (!response.ok) throw new Error(`${path}: ${response.status} ${body.message}`);
      console.log("endpoint", path, response.status, Array.isArray(body.data) ? { models: body.data.length, recommended: body.data.filter((m:any)=>m.recommended).length, leakedCost: body.data.some((m:any)=>m.pricing||m.billing_expr) } : path.endsWith("config") ? { text:body.chat_models.length,image:body.image_models.length,video:body.video_models.length,audio:body.audio_models.length } : body.data);
    }
    // Quote-only contract checks: these never call image/video generation endpoints.
    for (const model of ["deepseek-v4-flash", "claude-sonnet-4-6", "gpt-5.6-sol", "gpt-image-2", "gemini-3.1-flash-tts"]) {
      const response = await fetch("http://127.0.0.1:12121/api/model-catalog/quote", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, params: { inputLength: 1000, outputTokens: 800, n: 1, input: "这是一次只读价格验证" } }) });
      const body = await response.json() as any;
      if (!response.ok || !(body.data?.points > 0) || Math.abs(body.data.points - body.data.yuan * 10) > 0.000001) throw new Error(`${model} 报价或积分换算错误`);
      console.log("quote only", { model, points: body.data.points, yuan: body.data.yuan });
    }
    for (const model of ["seedance2.0-line1", "seedance2.5-line1", "seedance2.0-line1-fast"]) for (const hasReferenceVideo of [false, true]) {
      const response = await fetch("http://127.0.0.1:12121/api/model-catalog/quote", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, params: { seconds: 5, resolution: "720p", hasReferenceVideo } }) });
      const body = await response.json() as any;
      if (!response.ok) throw new Error(`reference quote: ${response.status} ${body.message}`);
      if (!Number.isFinite(body.data.points) || Math.abs(body.data.points - body.data.yuan * 10) > 0.001) throw new Error("模型报价积分换算不一致");
      console.log("reference quote", { model, hasReferenceVideo, points: body.data.points, yuan: body.data.yuan, multiplier: body.data.referenceVideoAdjustment?.multiplier ?? null });
      const multiplier = Number(body.data.referenceVideoAdjustment?.multiplier);
      if (hasReferenceVideo && (!Number.isFinite(multiplier) || Math.abs(multiplier - 1.5) > 0.00001)) throw new Error("参考视频倍率未正确加载");
    }
  } finally { await client.end(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
