// Synthetic catalog / RAM documents / local media only; no proxy to real model APIs.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const server=spawn(process.execPath,[fileURLToPath(new URL('./preview-one-stop.mjs',import.meta.url))],{stdio:['ignore','pipe','inherit']}),tabs=[];
const shots=await mkdtemp(join(tmpdir(),'xoi-one-stop-design-')),ownedOrigins=new Map();
async function call(path,body){const response=await fetch('http://localhost:3456'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(path==='/new'?45000:20000)});const result=await response.json();if(result.error)throw Error(result.error);return result;}
const evaluate=async(tab,code)=>{const info=await call('/info?target='+tab);if(new URL(info.url).origin!==ownedOrigins.get(tab))throw Error('验收标签页已被其他操作使用，停止操作并保留该页');return (await call('/eval?target='+tab,code)).value;};
async function until(tab,code){for(let n=0;n<65;n++){if(await evaluate(tab,code))return;await new Promise(r=>setTimeout(r,150));}throw Error('UI assertion timed out: '+code);}
async function open(url){const result=await call('/new',url);tabs.push(result.targetId);ownedOrigins.set(result.targetId,new URL(url).origin);return result.targetId;}
async function select(tab,category,model){await until(tab,"!document.querySelector('.os-model-dialog[data-state=open]')");await evaluate(tab,`document.querySelector('button[aria-label="选择${category}模型"]').click()`);await until(tab,`document.querySelector('.os-model-dialog[data-state=open] h2')?.textContent.includes(${JSON.stringify(category)})`);await evaluate(tab,"[...document.querySelectorAll('.os-model-dialog[data-state=open] .os-model-tabs button')].find(b=>b.textContent.includes('全部模型')).click()");await until(tab,"document.querySelectorAll('.os-model-dialog[data-state=open] .os-model-option').length>1");if(model){await until(tab,`[...document.querySelectorAll('.os-model-dialog[data-state=open] .os-model-option')].some(b=>b.textContent.includes(${JSON.stringify(model)}))`);await evaluate(tab,`[...document.querySelectorAll('.os-model-dialog[data-state=open] .os-model-option')].find(b=>b.textContent.includes(${JSON.stringify(model)})).click()`);await until(tab,"!document.querySelector('.os-model-dialog[data-state=open]')");}}
try{
 const base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('fixture timeout')),10000);server.stdout.on('data',chunk=>{output+=chunk;if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.split('\n')[0]).url);}});server.on('error',reject);});
 const tab=await open(base+'/one-stop/#/comic');await until(tab,"!!document.querySelector('.cs-advanced-toggle')");
 assert.equal(await evaluate(tab,"document.querySelector('.cs-model-strip')===null && document.querySelector('.cs-advanced-toggle').getAttribute('aria-expanded')==='false'"),true);
 // Current approved textured-paper home uses #eeece7 beneath the artwork.
 assert.equal(await evaluate(tab,"getComputedStyle(document.querySelector('[data-comic-ui]')).backgroundColor"),'rgb(238, 236, 231)');
 await evaluate(tab,"document.querySelector('.cs-advanced-toggle').click()");
 await until(tab,"document.querySelector('.cs-model-strip')?.textContent.includes('免费文案测试')");
 assert.equal(await evaluate(tab,"document.querySelectorAll('.cs-model-strip .os-model-trigger').length"),3);
 assert.equal(await evaluate(tab,"[...document.querySelectorAll('.cs-mode video')].every(v=>!v.hasAttribute('src'))"),true);
 assert.equal(await evaluate(tab,"document.querySelector('button[aria-label=\"创建项目\"]').disabled"),true);
 assert.equal(await evaluate(tab,"parseFloat(getComputedStyle(document.querySelector('.cs-heading h1')).fontSize)<=44"),true);
 await select(tab,'图片');
 assert.equal(await evaluate(tab,"document.querySelector('.os-model-dialog[data-state=open] .os-model-options').textContent.includes('不可用型号')"),false);
 assert.equal(await evaluate(tab,"[...document.querySelectorAll('.os-model-dialog[data-state=open] .os-model-option')].find(b=>b.textContent.includes('图片精细测试')).textContent.includes('3.9 积分')"),true);
 assert.equal(await evaluate(tab,"[...document.querySelectorAll('.os-model-dialog[data-state=open] .os-model-option')].find(b=>b.textContent.includes('报价未就绪测试')).textContent.includes('暂无预估')"),true);
 await call(`/screenshot?target=${tab}&file=${encodeURIComponent(join(shots,'model-picker.png'))}`);
 await evaluate(tab,"[...document.querySelectorAll('.os-model-dialog[data-state=open] .os-model-option')].find(b=>b.textContent.includes('图片精细测试')).click()");
 await select(tab,'文案','另一文案模型');await select(tab,'视频','按秒视频测试');
 assert.equal(await evaluate(tab,"document.querySelector('.cs-model-strip').textContent.includes('图片精细测试')&&document.querySelector('.cs-model-strip').textContent.includes('另一文案模型')&&document.querySelector('.cs-model-strip').textContent.includes('按秒视频测试')"),true);
 const embed=await open(base+'/__fixture/embedded');await until(embed,"!!document.querySelector('iframe')?.contentDocument?.querySelector('.cs-advanced-toggle')");
 await until(embed,"[...document.querySelector('iframe').contentDocument.querySelectorAll('.cs-mode-bg img')].length===2&&[...document.querySelector('iframe').contentDocument.querySelectorAll('.cs-mode-bg img')].every(i=>i.complete&&i.naturalWidth>0)");
 await call(`/screenshot?target=${embed}&file=${encodeURIComponent(join(shots,'home.png'))}`);
 // Background-tab fixture: synthesize visibility for the hover handler only.
 await evaluate(embed,"(()=>{const w=document.querySelector('iframe').contentWindow,d=w.document;Object.defineProperty(d,'hidden',{configurable:true,get:()=>false});d.querySelector('.cs-mode').dispatchEvent(new w.MouseEvent('mouseover',{bubbles:true}));})()");
 await until(embed,"!!document.querySelector('iframe').contentDocument.querySelector('.cs-mode video').getAttribute('src')");
 await evaluate(embed,"(()=>{const w=document.querySelector('iframe').contentWindow;w.document.querySelector('.cs-mode').dispatchEvent(new w.MouseEvent('mouseout',{bubbles:true,relatedTarget:w.document.body}));})()");
 assert.equal(await evaluate(embed,"document.querySelector('iframe').contentDocument.querySelector('.cs-mode video').paused"),true);
 const mobile=await open(base+'/__fixture/mobile');await until(mobile,"!!document.querySelector('iframe')?.contentDocument?.querySelector('.cs-advanced-toggle')");
 assert.equal(await evaluate(mobile,"document.querySelector('iframe').contentDocument.documentElement.scrollWidth<=390"),true);
 await call(`/screenshot?target=${mobile}&file=${encodeURIComponent(join(shots,'mobile.png'))}`);
 await evaluate(mobile,"document.querySelector('iframe').contentDocument.querySelector('.cs-advanced-toggle').click()");
 await until(mobile,"!!document.querySelector('iframe').contentDocument.querySelector('.cs-model-strip')");
 assert.equal(await evaluate(mobile,"document.querySelector('iframe').contentDocument.documentElement.scrollWidth<=390"),true);
 await evaluate(tab,"document.querySelector('button[aria-label=\"每集时长\"]').click()");
 await until(tab,"[...document.querySelectorAll('[role=option]')].some(o=>o.textContent.includes('2 分钟'))");
 await evaluate(tab,"[...document.querySelectorAll('[role=option]')].find(o=>o.textContent.includes('2 分钟')).click()");
 await evaluate(tab,"document.querySelector('.cs-advanced-toggle').click()");
 assert.equal(await evaluate(tab,"document.querySelector('.cs-model-strip')===null"),true);
 await evaluate(tab,"document.querySelector('.cs-advanced-toggle').click()");
 await until(tab,"document.querySelector('.cs-model-strip')?.textContent.includes('图片精细测试')");
 await evaluate(tab,"(()=>{const i=document.querySelector('textarea[aria-label=\"项目描述\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(i,'模型配置保存验收');i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('button[aria-label=\"批量剧\"]').click();})()");
 await until(tab,"!document.querySelector('button[aria-label=\"创建项目\"]').disabled");await evaluate(tab,"document.querySelector('button[aria-label=\"创建项目\"]').click()");
 await until(tab,"/^#\\/comic\\/[A-Za-z0-9_-]+$/.test(location.hash)");const id=(await evaluate(tab,"location.hash")).split('/').pop();
 const row=await (await fetch(base+'/api/one-stop/documents/'+id+'?collection=comic',{headers:{authorization:'Bearer one-stop.fixture.not-real'}})).json();
 assert.equal(row.data.payload.kind,'batch');assert.equal(row.data.payload.models.chat,'fixture-text-alt');assert.equal(row.data.payload.models.image,'fixture-image-alt');assert.equal(row.data.payload.models.video,'fixture-video-second');assert.equal(row.data.payload.schedule,'渐进式');
 assert.equal(row.data.payload.episodeSeconds,120);assert.equal(row.data.payload.episodeCount,3);
 const calls=await (await fetch(base+'/__fixture/requests')).json();assert.equal(calls.some(r=>/\/v1\/|billing\/authorize|\/pay|generations|completions/.test(r.path)),false);
 console.log(JSON.stringify({passed:true,fixtureOnly:true,checks:['advanced-closed-by-default','neutral-paper-palette','three-advanced-model-roles','price-conversion','unknown-price-not-free','unavailable-filtered','selection-survives-collapse','duration-and-models-persisted-for-batch','clear-create-action','hover-load-and-leave-pause-synthetic','mobile-390-no-overflow-collapsed-and-expanded'],modelRequests:0,realDataWrites:0,screenshots:shots}));
}finally{for(const tab of tabs){const info=await call('/info?target='+tab).catch(()=>null);if(info?.url&&new URL(info.url).origin===ownedOrigins.get(tab))await call('/close?target='+tab).catch(()=>{});}server.kill('SIGTERM');}
