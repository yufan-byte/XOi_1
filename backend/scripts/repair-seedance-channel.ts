/** Preserve keys/quotas/models; repair only local dedicated Seedance channel binding. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import crypto from 'node:crypto';
const db=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL,connectionTimeoutMillis:5000});
async function main(){
 assert.ok(process.argv.includes('--apply-local-routing-fix'));
 const base=(process.env.NEWAPI_BASE_URL||'http://127.0.0.1:3000').replace(/\/v1\/?$/,'').replace(/\/$/,'');assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
 await db.connect();const before=(await db.query('SELECT * FROM channels WHERE id=5')).rows[0];assert.equal(before.name,'zaowu-xoi');assert.equal(before.base_url,'https://zwyq.ccdan.live');assert.ok([1,61].includes(Number(before.type)));
 const digest=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');const keyHash=digest(before.key);
 const abilityRows=(await db.query('SELECT "group",model,enabled FROM abilities WHERE channel_id=5 ORDER BY "group",model')).rows;
 const groups=[...new Set(abilityRows.map(r=>r.group))].sort();assert.deepEqual(groups,['admin','default','xoi']);assert.ok(abilityRows.every(r=>r.enabled));
 async function api(path:string,method='GET',body?:unknown){const r=await fetch(base+'/api/channel'+path,{method,headers:{authorization:'Bearer '+process.env.NEWAPI_ADMIN_TOKEN,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});const j=await r.json() as any;assert.equal(r.status,200);assert.notEqual(j.success,false,j.message);return j.data;}
 const current=await api('/5');const settings=JSON.parse(current.setting||'{}');
 await api('/','PUT',{id:5,type:61,name:current.name,base_url:current.base_url,models:current.models,group:groups.join(','),weight:current.weight,priority:current.priority,auto_ban:current.auto_ban,model_mapping:current.model_mapping,status_code_mapping:current.status_code_mapping,param_override:current.param_override,header_override:current.header_override,settings:current.settings,setting:JSON.stringify({...settings,task_plugin_key:'zaowu-video'})});
 const after=(await db.query('SELECT * FROM channels WHERE id=5')).rows[0];assert.equal(Number(after.type),61);assert.equal(digest(after.key),keyHash);assert.equal(after.models,before.models);assert.equal(after.base_url,before.base_url);assert.equal(after.status,before.status);
 assert.equal(JSON.parse(after.setting).task_plugin_key,'zaowu-video');
 const actual=(await db.query('SELECT "group",model,enabled FROM abilities WHERE channel_id=5 ORDER BY "group",model')).rows;assert.deepEqual(actual,abilityRows,'Existing access scope must be preserved exactly');
 console.log(JSON.stringify({passed:true,channelId:5,type:61,plugin:'zaowu-video',keyPreserved:true,modelListPreserved:true,existingAccessPreserved:true,canonicalGroups:groups,modelRequests:0,quotaChanges:0}));
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.end());
