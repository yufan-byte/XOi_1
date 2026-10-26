/** Local-only, narrow routing repair. Preserve every existing hook and old version. No model generation. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import pg from 'pg';
const added=['seedance2.0-line1-xoi','seedance2.0-line1-fast-xoi','seedance2.5-line1-xoi'];
const db=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL,connectionTimeoutMillis:5000});
async function main(){
 assert.ok(process.argv.includes('--apply-local-routing-fix'));
 const base=(process.env.NEWAPI_BASE_URL||'http://127.0.0.1:3000').replace(/\/v1\/?$/,'').replace(/\/$/,'');assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
 await db.connect();const old=(await db.query("SELECT version,source FROM task_plugins WHERE key='zaowu-video' AND active=true AND enabled=true")).rows[0];assert.ok(old);
 async function api(path:string,method='GET',body?:unknown){const r=await fetch(base+'/api/plugin/task'+path,{method,headers:{authorization:'Bearer '+process.env.NEWAPI_ADMIN_TOKEN,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});const j=await r.json() as any;assert.equal(r.status,200);assert.notEqual(j.success,false,j.message);return j.data;}
 if(old.version==='1.0.3'){const live=await api('');assert.ok(live.find((p:any)=>p.meta.key==='zaowu-video').meta.models.includes(added[1]));console.log(JSON.stringify({alreadyApplied:true,modelRequests:0}));return;}
 assert.equal(old.version,'1.0.2','Refuse to overwrite a concurrent/newer plugin version');
 const source=old.source as string,match=/models:\s*(\[[^\n]*\])/.exec(source);assert.ok(match);const models=JSON.parse(match[1]);assert.ok(added.every(m=>!models.includes(m)));
 const updated=source.replace(match[0],'models: '+JSON.stringify([...models,...added])).replace('version: "1.0.2"','version: "1.0.3"');
 assert.equal(updated.replace('models: '+JSON.stringify([...models,...added]),match[0]).replace('version: "1.0.3"','version: "1.0.2"'),source,'Only model names and version may change');
 const sandbox:any={};vm.createContext(sandbox);vm.runInContext(updated.replace(/export /g,'')+'\nthis.checkMeta=meta;this.checkBuild=buildSubmitRequest;',sandbox,{timeout:1000});assert.deepEqual(Array.from(sandbox.checkMeta.models),[...models,...added]);
 const req={model:added[1],prompt:'offline contract only',seconds:5,resolution:'480p',aspect_ratio:'16:9'};
 const ctx={requestBody:req,upstreamModel:added[1],action:'text_to_video',baseUrl:'https://upstream.example.test',apiKey:'offline-placeholder'};
 const result=sandbox.checkBuild(ctx);assert.equal(result.body.seconds,5);assert.equal(result.body.mode,undefined);assert.equal(result.body.model,added[1]);
 const dry=await api('/zaowu-video/dryrun','POST',{hook:'buildSubmitRequest',args:[ctx]});assert.equal(dry.body.seconds,5);assert.equal(dry.body.mode,undefined);
 await api('','POST',{source:updated,enabled:true,remark:'1.0.3: 仅补登记三条 Seedance -xoi 专线；保留全部旧逻辑及1.0.2，修复专线误走内建视频解析。',sourceSha256:crypto.createHash('sha256').update(updated).digest('hex')});
 const incumbent=(await db.query("SELECT version FROM task_plugins WHERE key='zaowu-video' AND active=true")).rows[0];assert.equal(incumbent.version,old.version,'Concurrent activation detected; do not overwrite');
 await api('/zaowu-video/activate','POST',{version:'1.0.3'});
 const live=(await api('')).find((p:any)=>p.meta.key==='zaowu-video');assert.equal(live.runtime_status,'registered');assert.equal(live.meta.version,'1.0.3');assert.deepEqual(live.meta.models,[...models,...added]);
 const runtime=await api('/runtime/status');assert.equal(runtime.last_rebuild.status,'success');assert.equal(runtime.last_rebuild.plugin_error_count,0);
 console.log(JSON.stringify({passed:true,version:'1.0.3',previousVersionRetained:old.version,onlyAddedModels:added,existingModelsPreserved:models.length,offlineContract:true,gatewayDryRun:true,runtimeRegistered:true,modelRequests:0,quotaChanges:0,priceChanges:0}));
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.end());
