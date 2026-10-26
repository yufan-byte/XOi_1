// Synthetic one-stop task: generation starts without a cost dialog; never reaches an upstream.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fixture=spawn(process.execPath,[fileURLToPath(new URL('./preview-one-stop.mjs',import.meta.url))],{env:{...process.env,ONE_STOP_FIXTURE_AUTOMATIC:'1'},stdio:['ignore','pipe','inherit']});let tab,base;
async function call(path,body){const r=await fetch('http://localhost:3456'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(30000)});const v=await r.json();if(v.error)throw Error(v.error);return v;}
async function owned(){const info=await call('/info?target='+tab);return !!info.url&&new URL(info.url).origin===base;}
async function evaluate(code){assert.ok(await owned());return(await call('/eval?target='+tab,code)).value;}
async function until(code){for(let n=0;n<100;n++){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,200));}throw Error('UI timeout '+code);}
const click=text=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
try{
 base=await new Promise((resolve,reject)=>{let out='';fixture.stdout.on('data',c=>{out+=c;if(out.includes('\n'))resolve(JSON.parse(out.split('\n')[0]).url);});fixture.on('error',reject);});
 tab=(await call('/new',base+'/one-stop/#/comic')).targetId;await until("!!document.querySelector('.cs-advanced-toggle')");await click('从模板开始');await until("!!document.querySelector('[role=dialog][data-state=open]')");
 await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='使用此模板').click()");await until("!!document.querySelector('.os-generation-panel')");await click('确认，进入 02 意图');await until("document.querySelector('h2')?.textContent.includes('意图')");await click('AI 分析意图');
 await until("document.body.textContent.includes('本轮已完成')");assert.equal(await evaluate("document.querySelector('[role=dialog][data-state=open]')===null"),true);
 const requests=await(await fetch(base+'/__fixture/requests')).json(),jobs=requests.filter(r=>r.method==='POST'&&r.path==='/api/one-stop/generation/jobs');assert.equal(jobs.length,1);assert.equal(jobs[0].body.automatic,true);assert.equal(jobs[0].body.points,.001);
 console.log(JSON.stringify({passed:true,fixtureOnly:true,automaticStart:true,noCostDialog:true,oneJobOnly:true,paidRequests:0,realProjectWrites:0}));
}finally{if(tab&&await owned().catch(()=>false))await call('/close?target='+tab).catch(()=>{});fixture.kill('SIGTERM');}
