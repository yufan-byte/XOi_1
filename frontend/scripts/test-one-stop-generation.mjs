// Synthetic identity/RAM tasks only. Never imports production credentials or proxies model requests.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const server=spawn(process.execPath,[fileURLToPath(new URL('./preview-one-stop.mjs',import.meta.url))],{stdio:['ignore','pipe','inherit']}),tabs=[],origins=new Map(),shots=await mkdtemp(join(tmpdir(),'xoi-generation-ui-'));
async function call(path,body){const r=await fetch('http://localhost:3456'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(path==='/new'?45000:20000)});const v=await r.json();if(v.error)throw Error(v.error);return v;}
async function evaluate(id,code){const info=await call('/info?target='+id);if(!info.url||new URL(info.url).origin!==origins.get(id))throw Error('验收标签页已关闭或变化，保留并停止');return (await call('/eval?target='+id,code)).value;}
async function until(id,code){for(let n=0;n<100;n++){if(await evaluate(id,code))return;await new Promise(r=>setTimeout(r,150));}throw Error('UI timeout: '+code);}
async function open(url){const id=(await call('/new',url)).targetId;tabs.push(id);origins.set(id,new URL(url).origin);return id;}
const click=(id,text)=>evaluate(id,`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('button missing');b.click()})()`);
let base;
try{
 base=await new Promise((resolve,reject)=>{let out='';server.stdout.on('data',c=>{out+=c;if(out.includes('\n'))resolve(JSON.parse(out.split('\n')[0]).url);});server.on('error',reject);});
 const tab=await open(base+'/one-stop/#/comic');await until(tab,"!!document.querySelector('.cs-advanced-toggle')");
 await click(tab,'从模板开始');await until(tab,"!!document.querySelector('[role=dialog][data-state=open]')");
 await evaluate(tab,"document.querySelector('[role=dialog][data-state=open] button:not([aria-label])');[...document.querySelectorAll('[role=dialog][data-state=open] button')].find(b=>b.textContent.trim()==='使用此模板').click()");
 await until(tab,"!!document.querySelector('.os-generation-panel')");await click(tab,'确认，进入 02 意图');await until(tab,"document.querySelector('h2')?.textContent.includes('意图')");
 await click(tab,'AI 分析意图');await until(tab,"!!document.querySelector('[role=dialog][data-state=open]')?.textContent.includes('确认并开始')");
 assert.equal(await evaluate(tab,"document.querySelector('input[aria-label=本轮预算硬上限]')===null"),true);
 let logs=await(await fetch(base+'/__fixture/requests')).json();assert.equal(logs.filter(r=>r.method==='POST'&&r.path==='/api/one-stop/generation/jobs').length,0);
 await call('/screenshot?target='+tab+'&file='+encodeURIComponent(join(shots,'free-confirmation.png')));
 await click(tab,'取消');await until(tab,"!document.querySelector('[role=dialog][data-state=open]')");
 await click(tab,'AI 分析意图');await until(tab,"!!document.querySelector('[role=dialog][data-state=open]')");await click(tab,'确认并开始');
 await until(tab,"document.body.textContent.includes('本轮已完成')&&[...document.querySelectorAll('input')].some(i=>i.value==='跨设备模拟受众')");
 logs=await(await fetch(base+'/__fixture/requests')).json();const posted=logs.filter(r=>r.method==='POST'&&r.path==='/api/one-stop/generation/jobs');assert.equal(posted.length,1);assert.equal(posted[0].body.points,.001);
 const hash=await evaluate(tab,'location.hash'),restored=await open(base+'/one-stop/'+hash);await until(restored,"document.body.textContent.includes('本轮已完成')&&[...document.querySelectorAll('input')].some(i=>i.value==='跨设备模拟受众')");
 await call('/screenshot?target='+restored+'&file='+encodeURIComponent(join(shots,'restored-task.png')));
 // The paid and ambiguous branches also stay inside the RAM fixture; no provider is reachable.
 const projectId=hash.split('/').pop(),headers={authorization:'Bearer one-stop.fixture.not-real','content-type':'application/json'};
 const row=(await(await fetch(base+'/api/one-stop/documents/'+projectId+'?collection=comic',{headers})).json()).data;
 const changed=await fetch(base+'/api/one-stop/documents/'+projectId,{method:'PUT',headers,body:JSON.stringify({collection:'comic',revision:row.revision,title:'fixture',payload:{...row.payload,fixtureUnknown:true,models:{...row.payload.models,chat:'fixture-text-alt'}}})});assert.equal(changed.status,200);
 const paid=await open(base+'/one-stop/?fixtureUnknown=1'+hash);await until(paid,"!!document.querySelector('.os-generation-panel')&&!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='重新分析')");
 await evaluate(paid,"window.confirm=()=>true");
 await click(paid,'重新分析');await until(paid,"!!document.querySelector('input[aria-label=本轮预算硬上限]')");
 assert.equal(await evaluate(paid,"document.querySelector('input[aria-label=本轮预算硬上限]').value"),'10');
 assert.equal(await evaluate(paid,"document.querySelector('[role=dialog][data-state=open]').textContent.includes('1.2')"),true);
 await call('/screenshot?target='+paid+'&file='+encodeURIComponent(join(shots,'paid-confirmation.png')));
 await click(paid,'取消');await until(paid,"!document.querySelector('[role=dialog][data-state=open]')");
 logs=await(await fetch(base+'/__fixture/requests')).json();assert.equal(logs.filter(r=>r.method==='POST'&&r.path==='/api/one-stop/generation/jobs').length,1);
 await click(paid,'重新分析');await until(paid,"!!document.querySelector('input[aria-label=本轮预算硬上限]')");await click(paid,'确认并开始');
 await new Promise(r=>setTimeout(r,700));await click(paid,'刷新任务');
 try {await until(paid,"document.body.textContent.includes('结果待核对')");}catch(e){console.error(JSON.stringify({fixtureDebug:await evaluate(paid,"document.body.innerText.slice(-2600)"),requests:(await(await fetch(base+'/__fixture/requests')).json()).slice(-12)}));throw e;}
 assert.equal(await evaluate(paid,"[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='后台连续制作').disabled"),true);
 await click(paid,'刷新任务');
 logs=await(await fetch(base+'/__fixture/requests')).json();assert.equal(logs.filter(r=>r.method==='POST'&&r.path==='/api/one-stop/generation/jobs').length,2);
 await evaluate(paid,"window.confirm=()=>true");await click(paid,'已核对，结束本轮');await until(paid,"!document.body.textContent.includes('已核对，结束本轮')");
 logs=await(await fetch(base+'/__fixture/requests')).json();assert.equal(logs.filter(r=>r.method==='POST'&&r.path.endsWith('/acknowledge')).length,1);
 assert.equal(logs.some(r=>/\/v1\/|\/pay|completions|images\/generations/.test(r.path)),false);
 console.log(JSON.stringify({passed:true,fixtureOnly:true,checks:['quote-before-submit','cancel-no-model-submission','free-no-budget-input','one-submit-only','server-result-applied','task-restored-on-new-page','paid-budget-visible','paid-cancel-no-submit','unknown-locks-no-replay','explicit-acknowledgement'],paidRequests:0,realProjectWrites:0,screenshots:shots}));
}finally{for(const id of tabs){const info=await call('/info?target='+id).catch(()=>null);if(info?.url&&new URL(info.url).origin===origins.get(id))await call('/close?target='+id).catch(()=>{});}server.kill('SIGTERM');}
