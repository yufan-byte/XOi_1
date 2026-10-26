import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
const fixture=spawn(process.execPath,[fileURLToPath(new URL("./preview-one-stop.mjs",import.meta.url))],{stdio:["ignore","pipe","inherit"]}),tabs=[];
const shots=await mkdtemp(join(tmpdir(),"xoi-one-stop-")),ownedOrigins=new Map();
async function cmd(path,body){const r=await fetch("http://localhost:3456"+path,{method:body===undefined?"GET":"POST",...(body===undefined?{}:{body}),signal:AbortSignal.timeout(20000)});const j=await r.json();if(j.error)throw Error(j.error);return j;}
const evaluate=async(t,code)=>{const info=await cmd(`/info?target=${t}`);if(new URL(info.url).origin!==ownedOrigins.get(t))throw Error('验收页被其他操作使用，保留该页并停止');return(await cmd(`/eval?target=${t}`,code)).value;};
async function until(t,code){for(let i=0;i<90;i++){if(await evaluate(t,code))return;await new Promise(r=>setTimeout(r,150));}throw Error("UI assertion timed out: "+code);}
async function open(url){const r=await cmd("/new",url);tabs.push(r.targetId);ownedOrigins.set(r.targetId,new URL(url).origin);return r.targetId;}
const click=(t,text)=>evaluate(t,`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('button not found');b.click()})()`);
try{
 const base=await new Promise((resolve,reject)=>{let s="";const timer=setTimeout(()=>reject(Error("fixture timeout")),10000);fixture.stdout.on("data",c=>{s+=c;if(s.includes("\n")){clearTimeout(timer);resolve(JSON.parse(s.split("\n")[0]).url);}});fixture.on("error",reject);});
 const tab=await open(base+"/one-stop/#/comic");await until(tab,"!!document.querySelector('[data-comic-ui]')");
 assert.equal(await evaluate(tab,"document.body.textContent.includes('让想象，有下一幕')"),true);
 assert.equal(await evaluate(tab,"document.querySelectorAll('.one-stop-shell').length"),1);
 const desktop=await open(base+"/__fixture/desktop");await until(desktop,"!!document.querySelector('iframe')?.contentDocument?.querySelector('[data-comic-ui]')");
 await evaluate(desktop,"document.querySelector('iframe').contentDocument.querySelector('.cs-mode-bg img').scrollIntoView({block:'center'})");
 await until(desktop,"[...document.querySelector('iframe').contentDocument.querySelectorAll('.cs-mode-bg img')].every(i=>i.complete&&i.naturalWidth>0)");
 await evaluate(desktop,"document.querySelector('iframe').contentWindow.scrollTo(0,0);window.scrollTo(0,0)");
 await cmd(`/screenshot?target=${desktop}&file=${encodeURIComponent(join(shots,"home.png"))}`);
 await click(tab,"从模板开始");await until(tab,"!!document.querySelector('[role=dialog]')");
 await evaluate(tab,"[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='使用此模板').click()");
 await until(tab,"/\\/comic\\/[^/]+$/.test(location.hash)&&!!document.querySelector('.one-stop-shell')&&!document.querySelector('[data-comic-ui]')");
 const hash=await evaluate(tab,"location.hash");assert.ok(hash.includes("/comic/"));
 await cmd(`/screenshot?target=${tab}&file=${encodeURIComponent(join(shots,"workspace.png"))}`);
 await evaluate(tab,"[...document.querySelectorAll('button')].find(b=>/确认，进入/.test(b.textContent))?.click()");
 await until(tab,"document.querySelector('h2')?.textContent.includes('意图')");
 await until(tab,"!document.querySelector('.one-stop-top')?.textContent.includes('正在保存')");
 const reopen=await open(base+"/one-stop/"+hash);await until(reopen,"document.querySelector('h2')?.textContent.includes('意图')");
 await click(reopen,"AI 分析意图");await until(reopen,"!!document.querySelector('[role=dialog][data-state=open]')?.textContent.includes('确认并开始')");
 await click(reopen,"取消");await until(reopen,"!document.querySelector('[role=dialog][data-state=open]')");
 await evaluate(reopen,"(()=>{const i=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('目标受众')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'跨设备手动验收');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await until(reopen,"!document.querySelector('.one-stop-top')?.textContent.includes('正在保存')");
 const edited=await open(base+"/one-stop/"+hash);await until(edited,"[...document.querySelectorAll('input')].some(i=>i.value==='跨设备手动验收')");
 const mobile=await open(base+"/__fixture/mobile");await until(mobile,"!!document.querySelector('iframe')?.contentDocument?.querySelector('[data-comic-ui]')");
 assert.equal(await evaluate(mobile,"document.querySelector('iframe').contentDocument.documentElement.scrollWidth<=390"),true);
 await cmd(`/screenshot?target=${mobile}&file=${encodeURIComponent(join(shots,"mobile.png"))}`);
 const embed=await open(base+"/__fixture/embedded");await until(embed,"!!document.querySelector('iframe')?.contentDocument?.querySelector('.one-stop-embedded')");
 assert.equal(await evaluate(embed,"getComputedStyle(document.querySelector('iframe').contentDocument.querySelector('.one-stop-nav')).display==='none'"),true);
 await cmd(`/screenshot?target=${embed}&file=${encodeURIComponent(join(shots,"embedded.png"))}`);
 const failed=await open(base+"/one-stop/?fixtureSaveFailure=1#/comic");await until(failed,"!!document.querySelector('[data-comic-ui]')");await click(failed,"从模板开始");
 await evaluate(failed,"[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='使用此模板').click()");
 await until(failed,"!!document.querySelector('.one-stop-save-error')");assert.equal(await evaluate(failed,"location.hash"),"#/comic");
 const calls=await (await fetch(base+"/__fixture/requests")).json();
 assert.equal(calls.some(r=>/\/v1\/|billing\/authorize|\/pay|generations|completions/.test(r.path)),false);
 assert.ok(calls.some(r=>r.method==="PUT"&&r.path.startsWith("/api/one-stop/documents/")));
 console.log(JSON.stringify({passed:true,fixtureOnly:true,scenarios:["original-home","template-create","ack-before-navigation","stage-save","reopen-from-server","mobile-390","failed-save-stays-local"],modelRequests:0,realDataMutations:0,screenshots:shots}));
}finally{for(const tab of tabs){const info=await cmd(`/info?target=${tab}`).catch(()=>null);if(info?.url&&new URL(info.url).origin===ownedOrigins.get(tab))await cmd(`/close?target=${tab}`).catch(()=>{});}fixture.kill("SIGTERM");}
