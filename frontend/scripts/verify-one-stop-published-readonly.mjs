// Inspect the published local app using the existing browser login. Never submit mutations.
import assert from 'node:assert/strict';
const base='http://localhost:12121',marker='ui_check=one-stop-release-20261024';let tab;
async function call(path,body){const r=await fetch('http://localhost:3456'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(20000)});const j=await r.json();if(j.error)throw Error(j.error);return j;}
async function evaluate(code){const info=await call('/info?target='+tab);if(new URL(info.url).origin!==base||!info.url.includes(marker))throw Error('Owned verification tab was repurposed; leaving intact');return(await call('/eval?target='+tab,code)).value;}
async function until(code){for(let n=0;n<70;n++){if(await evaluate('!!('+code+')'))return;await new Promise(r=>setTimeout(r,120));}throw Error('Published-page assertion timed out: '+code);}
try{
 const html=await(await fetch(base+'/one-stop/',{signal:AbortSignal.timeout(10000)})).text();
 const assets=[...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css|png))"/g)].map(m=>m[1]);
 for(const path of [...assets,'/one-stop/brand/hero-dawn-v2.png','/console/fonts/lexend-latin-wght-normal.woff2','/console/fonts/archivo-latin-wght-normal.woff2'])assert.equal((await fetch(base+path,{signal:AbortSignal.timeout(10000)})).status,200,path);
 tab=(await call('/new',base+'/one-stop/?'+marker+'#/comic')).targetId;
 await evaluate(`(()=>{const original=window.fetch.bind(window);window.__blockedWrites=[];window.fetch=(input,init={})=>{const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(!['GET','HEAD'].includes(method)){window.__blockedWrites.push(method);return Promise.reject(Error('Read-only release verification blocks writes'));}return original(input,init);};})()`);
 const result=await evaluate(`(async()=>{const headers={Authorization:localStorage.getItem('token')||''};const r=await fetch('/api/one-stop/documents?collection=comic&page=1&pageSize=50',{headers});const b=await r.json();if(!r.ok)return{authenticated:false,status:r.status};const p=b.data.items.find(x=>x.payload.kind==='premium')||b.data.items[0];if(!p)return{authenticated:true,count:0};const [h,c,j]=await Promise.all([fetch('/api/one-stop/documents/'+p.id+'/history',{headers}),fetch('/api/one-stop/generation/capabilities',{headers}),fetch('/api/one-stop/generation/jobs?projectId='+p.id,{headers})]);const [hb,cb,jb]=await Promise.all([h.json(),c.json(),j.json()]);return {authenticated:true,count:b.data.items.length,id:p.id,historyStatus:h.status,historyCount:hb.data?.items?.length,serverComposition:cb.data?.serverComposition,locked:jb.data?.some(x=>['queued','running','unknown'].includes(x.status))};})()`);
 if(!result.authenticated){console.log(JSON.stringify({publicAssets:true,authenticated:false,status:result.status,modelRequests:0,realDataWrites:0}));}
 else{
  assert.equal(result.historyStatus,200);assert.equal(result.serverComposition,true);
  await evaluate('location.hash='+JSON.stringify('#/comic/'+result.id));await until("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='历史版本')");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='历史版本').click()");await until("!!document.querySelector('.os-history-dialog')");
  if(result.historyCount){await until("document.querySelector('.os-history-layout aside button')");await evaluate("document.querySelector('.os-history-layout aside button').click()");await until("!!document.querySelector('.os-history-panels')");if(result.locked)assert.equal(await evaluate("[...document.querySelectorAll('.os-history-dialog button')].find(b=>b.textContent.includes('恢复此阶段')).disabled"),true);}
  await evaluate("document.querySelector('.os-history-dialog button[aria-label=关闭]').click()");await until("!document.querySelector('.os-history-dialog')");
  await evaluate("document.querySelector('[data-stage=script]').click()");await until("document.querySelector('section h2')?.textContent.includes('剧本')");
  console.log(JSON.stringify({publicAssets:true,authenticated:true,existingProjects:result.count,historyEndpoint:200,historyVersions:result.historyCount,historyDialog:true,activeTaskRecoveryLocked:result.locked,scriptReview:true,blockedWrites:await evaluate('window.__blockedWrites.length'),modelRequests:0,realDataWrites:0}));
 }
}finally{if(tab){const info=await call('/info?target='+tab).catch(()=>null);if(info?.url&&new URL(info.url).origin===base&&info.url.includes(marker))await call('/close?target='+tab).catch(()=>{});}}
