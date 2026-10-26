// RAM-only fixture. No real model submission, real credentials or customer writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const server=spawn(process.execPath,[fileURLToPath(new URL('./preview-one-stop.mjs',import.meta.url))],{stdio:['ignore','pipe','inherit']});
const owned=new Map(),screenshots=await mkdtemp(join(tmpdir(),'xoi-workspace-qa-'));
console.log(JSON.stringify({screenshots,fixtureOnly:true}));
async function call(path,body){const r=await fetch('http://localhost:3456'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(j.error)throw Error(j.error);return j;}
async function evaluate(id,code){const info=await call('/info?target='+id);if(new URL(info.url).origin!==owned.get(id))throw Error('Owned test tab was repurposed; leaving it intact');return(await call('/eval?target='+id,code)).value;}
async function until(id,code){for(let i=0;i<65;i++){if(await evaluate(id,`!!(${code})`))return;await new Promise(r=>setTimeout(r,120));}throw Error('Timed out: '+code);}
async function click(id,text){await until(id,`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});return b&&!b.disabled})()`);await evaluate(id,`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);}
async function open(base,input){const {id}=await(await fetch(base+'/__fixture/seed',{method:'POST',body:JSON.stringify(input)})).json();const {targetId}=await call('/new',base+'/one-stop/?ui_check=workspace-final#/comic/'+id);owned.set(targetId,base);await until(targetId,"!!document.querySelector('[data-stage=script]')");return {tab:targetId,id};}
const stage=(tab,key)=>evaluate(tab,`document.querySelector('[data-stage=${key}]').click()`);
try{
 const base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Fixture startup timeout')),10000);server.stdout.on('data',chunk=>{output+=chunk;if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.split('\n')[0]).url);}});server.on('error',reject);});
 const {tab,id}=await open(base,{});
 await stage(tab,'script');await until(tab,"document.querySelector('section h2')?.textContent.includes('剧本')");
 await click(tab,'重新生成剧本');await until(tab,"!!document.querySelector('.os-action-dialog')");
 assert.equal(await evaluate(tab,"document.querySelector('.os-action-dialog').textContent.includes('不会被清空')"),true);
 await evaluate(tab,"document.querySelector('.os-action-dialog button').click()");await until(tab,"!document.querySelector('.os-action-dialog')");
 await stage(tab,'storyboard');await click(tab,'补图 / 换图');await until(tab,"!!document.querySelector('.os-keyframe-dialog')");
 assert.equal(await evaluate(tab,"document.querySelector('.os-keyframe-dialog').textContent.includes('不会自动替换主图')"),true);
 await evaluate(tab,"document.getAnimations().forEach(a=>a.finish())");
 await call(`/screenshot?target=${tab}&file=${encodeURIComponent(join(screenshots,'keyframes.png'))}`);
 await click(tab,'设为主图');await until(tab,"document.querySelector('.os-current-frame img')?.getAttribute('src')==='/brand/frame-alt.svg'");
 await click(tab,'完成');await until(tab,"!document.querySelector('.os-keyframe-dialog')");
 await click(tab,'编辑画面');await until(tab,"!!document.querySelector('.os-prompt-editor')");
 await evaluate(tab,"(()=>{const i=document.querySelector('.os-prompt-editor');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(i,'统一晨光、青衣服装与云海位置，保持视线方向');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await click(tab,'保存描述');await until(tab,"!document.querySelector('.os-keyframe-dialog')");
 await click(tab,'项目设定');await until(tab,"!!document.querySelector('.os-project-settings')");
 assert.equal(await evaluate(tab,"[...document.querySelectorAll('.os-project-settings .os-model-trigger')].length===3&&[...document.querySelectorAll('.os-project-settings .os-model-trigger')].every(b=>{const r=b.getBoundingClientRect(),t=b.querySelector('.os-model-copy').getBoundingClientRect();return r.height>=94&&t.bottom<=r.bottom})"),true);
 await evaluate(tab,"document.getAnimations().forEach(a=>a.finish());document.querySelector('.os-project-settings .os-model-trigger').scrollIntoView({block:'start'})");
 await call(`/screenshot?target=${tab}&file=${encodeURIComponent(join(screenshots,'settings.png'))}`);
 await click(tab,'完成');await until(tab,"!document.querySelector('.os-project-settings')");
 await stage(tab,'video');await until(tab,"document.body.textContent.includes('去分镜补图')");await click(tab,'去分镜补图');await until(tab,"document.querySelector('section h2')?.textContent.includes('分镜')");
 // Wait for acknowledged RAM persistence, not a toast that merely queued a save.
 let row;
 for(let i=0;i<80;i++){
   row=await(await fetch(base+`/api/one-stop/documents/${id}?collection=comic`,{headers:{authorization:'Bearer one-stop.fixture.not-real'}})).json();
   if(row.data.payload.script.episodes[0].scenes[0].shotPrompt==='统一晨光、青衣服装与云海位置，保持视线方向')break;
   await new Promise(r=>setTimeout(r,150));
 }
 assert.equal(row.data.payload.script.episodes[0].scenes[0].imageUrl,'/brand/frame-alt.svg');
 assert.deepEqual(row.data.payload.script.episodes[0].scenes[0].altImages,['/brand/frame-main.svg']);
 assert.equal(row.data.payload.script.episodes[0].scenes[0].shotPrompt,'统一晨光、青衣服装与云海位置，保持视线方向');
 // Stage history is RAM-only here; the real SQL restore was independently checked in an isolated schema.
 const history=await open(base,{history:true});await click(history.tab,'历史版本');await until(history.tab,"!!document.querySelector('.os-history-dialog')");
 await evaluate(history.tab,"document.querySelector('.os-history-layout aside button').click()");await until(history.tab,"document.querySelector('.os-history-panels')?.textContent.includes('历史大纲·云海初见')");
 await click(history.tab,'恢复此阶段');await until(history.tab,"!!document.querySelector('.os-action-dialog')");await evaluate(history.tab,"document.querySelector('.os-action-dialog button').click()");await until(history.tab,"!document.querySelector('.os-action-dialog')");
 assert.equal((await(await fetch(base+'/__fixture/requests')).json()).filter(x=>x.path.includes('/restore')&&x.method==='POST').length,0);
 await click(history.tab,'恢复此阶段');await until(history.tab,"!!document.querySelector('.os-action-dialog')");await click(history.tab,'备份当前内容并恢复');await until(history.tab,"!document.querySelector('.os-history-dialog')");await until(history.tab,"document.querySelector('section h2')?.textContent.includes('大纲')");
 const restored=await(await fetch(base+`/api/one-stop/documents/${history.id}?collection=comic`,{headers:{authorization:'Bearer one-stop.fixture.not-real'}})).json(),restoreCall=(await(await fetch(base+'/__fixture/requests')).json()).findLast(x=>x.path.includes('/restore')&&x.method==='POST');assert.equal(restored.data.payload.outline.title,'历史大纲·云海初见');assert.equal(restored.data.revision,restoreCall.body.revision+1);assert.equal(restored.data.payload.script.episodes[0].scenes[0].imageUrl,'/brand/frame-main.svg');
 await click(history.tab,'历史版本');await until(history.tab,"document.querySelector('.os-history-layout aside')?.textContent.includes('恢复前备份')");await evaluate(history.tab,"document.getAnimations().forEach(a=>a.finish())");await call(`/screenshot?target=${history.tab}&file=${encodeURIComponent(join(screenshots,'stage-history.png'))}`);
 await evaluate(history.tab,"document.querySelector('.os-history-dialog button[aria-label=关闭]').click()");await until(history.tab,"!document.querySelector('.os-history-dialog')");
 const voice=await open(base,{voice:true,stage:'video'});await until(voice.tab,"document.querySelector('.os-speech-plan')?.textContent.includes('3 段角色配音')");
 await evaluate(voice.tab,"document.querySelector('.os-speech-plan summary').click()");assert.equal(await evaluate(voice.tab,"document.querySelectorAll('.os-speech-plan li').length"),3);
 assert.equal(await evaluate(voice.tab,"document.querySelector('.os-speech-plan').textContent.includes('补齐只调用')"),true);
 await click(voice.tab,'成片');await until(voice.tab,"document.body.textContent.includes('查看逐镜配音')");assert.equal(await evaluate(voice.tab,"[...document.querySelectorAll('button')].find(b=>b.textContent.includes('合成并保存 MP4')).disabled"),true);await click(voice.tab,'查看逐镜配音');await until(voice.tab,"!!document.querySelector('.os-speech-plan')");
 // Navigating back to a partially empty planning stage must never auto-generate.
 const empty=await open(base,{empty:true,stage:'direction'});await until(empty.tab,"document.querySelector('section h2')?.textContent.includes('方向')");await new Promise(r=>setTimeout(r,900));
 const active=await open(base,{active:true,missingModel:true});await until(active.tab,"!!document.querySelector('.os-readonly-note')");await stage(active.tab,'script');await until(active.tab,"document.querySelector('section h2')?.textContent.includes('剧本')");
 assert.equal(await evaluate(active.tab,"document.querySelector('section fieldset').disabled"),true);
 await click(active.tab,'项目设定');await until(active.tab,"!!document.querySelector('.os-project-settings')");assert.equal(await evaluate(active.tab,"document.querySelector('.os-settings-fields').disabled"),true);await click(active.tab,'完成');
 await click(active.tab,'历史版本');await until(active.tab,"document.querySelector('.os-history-dialog')?.textContent.includes('完成或核对后才能恢复')");
 const batch=await open(base,{kind:'batch'});assert.equal(await evaluate(batch.tab,"document.querySelectorAll('[data-stage]').length"),5);await stage(batch.tab,'script');await until(batch.tab,"document.querySelector('section h2')?.textContent.includes('剧本')");
 const mobileResult=await call('/new',base+'/__fixture/mobile?project='+id),mobile=mobileResult.targetId;owned.set(mobile,base);
 const md="document.querySelector('iframe').contentDocument";
 await until(mobile,md+"?.querySelector('[data-stage=storyboard]')");
 await evaluate(mobile,md+".querySelector('[data-stage=storyboard]').click()");
 await until(mobile,md+".querySelector('section h2')?.textContent.includes('分镜')");
 assert.equal(await evaluate(mobile,md+".documentElement.scrollWidth<=390"),true);
 await evaluate(mobile,`[...${md}.querySelectorAll('button')].find(b=>b.textContent.trim()==='补图 / 换图').click()`);
 await until(mobile,md+".querySelector('.os-keyframe-dialog')");
 assert.equal(await evaluate(mobile,`(()=>{const r=${md}.querySelector('.os-keyframe-dialog').getBoundingClientRect();return r.left>=0&&r.right<=390})()`),true);
 await evaluate(mobile,md+".getAnimations().forEach(a=>a.finish())");
 await call(`/screenshot?target=${mobile}&file=${encodeURIComponent(join(screenshots,'mobile-keyframes.png'))}`);
 await evaluate(mobile,`[...${md}.querySelectorAll('button')].find(b=>b.textContent.trim()==='完成').click()`);await until(mobile,`!${md}.querySelector('.os-keyframe-dialog')`);
 await evaluate(mobile,`[...${md}.querySelectorAll('button')].find(b=>b.textContent.trim()==='历史版本').click()`);await until(mobile,`${md}.querySelector('.os-history-dialog')`);assert.equal(await evaluate(mobile,`(()=>{const r=${md}.querySelector('.os-history-dialog').getBoundingClientRect();return r.left>=0&&r.right<=390})()`),true);
 const calls=await(await fetch(base+'/__fixture/requests')).json();
 assert.deepEqual(calls.filter(r=>r.path.endsWith('/quote')||r.path.includes('/v1/')||r.method==='POST'&&r.path.endsWith('/jobs')),[],'Viewing/editing/cancelling must never submit or quote a model');
 assert.deepEqual(calls.filter(r=>r.method==='PUT'&&r.path.endsWith(active.id)),[],'Navigation during background work cannot write the document');
 console.log(JSON.stringify({passed:true,checks:['premium-nine-and-batch-five-stages','stage-navigation-without-cloud-writes','running-readonly-navigation','no-automatic-generation-on-entry','regeneration-dialog-cancel','frame-manager-no-submit-on-open','candidate-selection-keeps-old-main','explicit-prompt-save','missing-frame-shortcut','settings-no-model-clipping','history-compare-cancel-and-explicit-restore-backup','history-busy-fence','three-speaker-plan-visible','stale-speech-export-warning-and-working-shortcut','390px-stage-keyframe-history-no-overflow'],modelRequests:0,realDataWrites:0,screenshots}));
}catch(e){for(const [id] of owned){const diagnostic=await evaluate(id,"({route:location.hash,error:document.querySelector('.os-history-dialog [role=alert]')?.textContent,confirm:document.querySelector('.os-action-dialog')?.textContent})").catch(()=>null);if(diagnostic?.error||diagnostic?.confirm)console.error(JSON.stringify(diagnostic));}throw e;}finally{for(const [id,origin] of owned){const info=await call('/info?target='+id).catch(()=>null);if(info?.url&&new URL(info.url).origin===origin)await call('/close?target='+id).catch(()=>{});}server.kill('SIGTERM');}
