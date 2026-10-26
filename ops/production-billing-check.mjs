/** Read-only delivery gate; no generation calls, no credentials printed, no configuration writes. */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const require = createRequire(path.join(root,"backend/package.json"));
const dotenv = require("dotenv"), pg = require("pg");
dotenv.config({path:path.join(root,"backend/.env"),quiet:true});
const client = new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL});
try {
  await client.connect();
  const agents = (await client.query('SELECT key,"modelName" FROM "o_agentDeploy"')).rows;
  const channels = (await client.query('SELECT id,name,tag,status,models FROM channels')).rows;
  const blockers = [];
  if (!agents.length) blockers.push("未配置 Agent 默认模型");
  for (const agent of agents) {
    if (!String(agent.modelName||"").startsWith("newapi:") || /(?:^|:)agnes(?:-|$)/i.test(agent.modelName)) blockers.push(`${agent.key} 仍为测试或非 NewAPI 默认模型：${agent.modelName||"未设置"}`);
    else if (!channels.some(channel=>Number(channel.status)===1 && String(channel.models||"").split(',').includes(agent.modelName.slice(7)))) blockers.push(`${agent.key} 默认模型没有启用的上游渠道`);
  }
  // Agnes is allowed to stay enabled for administrator-only smoke tests; the
  // application enforces role-based catalog visibility and invocation admission.
  const upstreams = channels.filter(channel=>Number(channel.status)===1 && (process.env.XOI_UPSTREAM_CHANNEL_ID ? Number(channel.id)===Number(process.env.XOI_UPSTREAM_CHANNEL_ID) : String(channel.tag||'').startsWith('zaowu-')));
  const table = (await client.query("SELECT to_regclass('xoi_upstream_pricing_sync') AS name")).rows[0].name;
  if(!upstreams.length)blockers.push("尚未启用造物上游渠道");
  for(const upstream of upstreams){
    const sync = table ? (await client.query('SELECT synced_at,snapshot FROM xoi_upstream_pricing_sync WHERE channel_id=$1',[upstream.id])).rows[0] : undefined;
    const label=upstream.name||upstream.tag||upstream.id;
    if (!sync || !Array.isArray(sync.snapshot.rows) || !sync.snapshot.rows.length) blockers.push(`${label}：造物价格尚未完成同步`);
    else if ((sync.snapshot.lastAttemptStatus||sync.snapshot.status)!=='synced') blockers.push(`${label}：造物最近一次价格同步失败`);
    else if (!Number.isFinite(new Date(sync.synced_at).getTime()) || Date.now()-new Date(sync.synced_at).getTime()>3_600_000) blockers.push(`${label}：造物价格超过一小时未成功刷新`);
  }
  console.log(JSON.stringify({readyForProduction:blockers.length===0,blockers,agents:agents.length,enabledChannels:channels.filter(channel=>Number(channel.status)===1).map(channel=>({id:channel.id,name:channel.name})),note:"仅核对配置，不证明真实生成、定价结算或退款已通过付费验收。"},null,2));
  if (blockers.length) process.exitCode=2;
} catch {console.error("交付检查失败：无法读取共享 NewAPI 数据库");process.exitCode=1;}
finally {await client.end();}
