// Real browser playback of locally encoded colours/test tones only. Never calls models.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'xoi-player-fixture-')),exec=promisify(execFile);let server,tab,base;
async function call(path,body){const r=await fetch('http://localhost:3456'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(15000)});const result=await r.json();if(result.error)throw Error(result.error);return result;}
async function evaluate(code){const info=await call('/info?target='+tab);if(new URL(info.url).origin!==base||!info.url.includes('ui_check=player-final'))throw Error('Owned tab was repurposed; leaving it intact');return (await call('/eval?target='+tab,code)).value;}
async function until(code){for(let i=0;i<80;i++){if(await evaluate('!!('+code+')'))return;await new Promise(r=>setTimeout(r,100));}throw Error('Playback assertion timed out: '+code);}
async function showOwnedTestTab(){
 await evaluate('location.href'); // Verify the created tab is still ours before activation.
 const discovery=await import(pathToFileURL(join(process.env.CODEX_HOME||join(homedir(),'.codex'),'skills/web-access/scripts/browser-discovery.mjs')).href),selected=await discovery.selectBrowser('chrome');
 if(selected.kind!=='ok')throw Error('Current Chrome CDP unavailable');
 const ws=new WebSocket(`ws://127.0.0.1:${selected.browser.port}${selected.browser.wsPath||'/devtools/browser'}`);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(Error('Browser activation connection timeout'));},5000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',e=>{clearTimeout(timer);reject(e);},{once:true});});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Test-tab activation timeout')),5000);ws.addEventListener('message',event=>{const msg=JSON.parse(String(event.data));if(msg.id===1){clearTimeout(timer);msg.error?reject(Error(msg.error.message)):resolve();}});ws.send(JSON.stringify({id:1,method:'Target.activateTarget',params:{targetId:tab}}));});}finally{ws.close();}
}
try{
 await exec('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=navy:s=320x180:r=24:d=1.2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',join(dir,'video.mp4')],{timeout:15000});
 await exec('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:duration=2.4',join(dir,'voice.mp3')],{timeout:15000});
 server=spawn(process.execPath,[fileURLToPath(new URL('./preview-one-stop.mjs',import.meta.url))],{env:{...process.env,ONE_STOP_FIXTURE_MEDIA_DIR:dir},stdio:['ignore','pipe','inherit']});
 base=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('Fixture startup timeout')),10000);server.stdout.on('data',c=>{out+=c;if(out.includes('\n')){clearTimeout(timer);resolve(JSON.parse(out.split('\n')[0]).url);}});server.once('error',reject);});
 const {id}=await(await fetch(base+'/__fixture/seed',{method:'POST',body:JSON.stringify({voice:true,playback:true,stage:'video'})})).json();
 tab=(await call('/new',base+'/one-stop/?ui_check=player-final#/comic/'+id)).targetId;
 await showOwnedTestTab();
 await until("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='成片')");await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='成片').click()");
 const v="document.querySelector('video[controls]')",a="document.querySelector('audio:not([controls])')";
 await until(`${v}&&${a}`);
 await evaluate(`window.__mediaErrors=[];[${v},${a}].forEach(x=>['loadstart','emptied','abort','error','loadedmetadata','play','pause'].forEach(type=>x.addEventListener(type,()=>window.__mediaErrors.push({type,time:x.currentTime,ready:x.readyState,tag:x.tagName}))));`);
 assert.equal(await evaluate(`${v}.controls&&!!document.querySelector('button[aria-label=全屏预览]')`),true);
 // No audible test tone on the user's computer.
 await evaluate("document.querySelector('button[aria-label=静音台词]').click()");
 await evaluate("document.querySelector('button[aria-label=播放]').scrollIntoView({block:'center'})");await call('/clickAt?target='+tab,'button[aria-label=播放]');await until(`${v}.videoWidth===320&&${a}.duration>2&&${v}.currentTime>.15&&!${a}.paused`);
 await evaluate("document.querySelector('button[aria-label=暂停]').click()");await until(`${v}.paused&&${a}.paused`);
 await evaluate(`${v}.currentTime=.5`);await until(`Math.abs(${a}.currentTime-.5)<.1`);
 await evaluate(`${v}.playbackRate=2`);await until(`${a}.playbackRate===2`);
 await evaluate("document.querySelector('button[aria-label=播放]').click()");await until(`${v}.ended&&!${a}.ended`);
 assert.equal(await evaluate("document.body.textContent.includes('1 / 2')"),true,'Longer speech must finish before advancing');
 await until("document.body.textContent.includes('2 / 2')");
 assert.equal(await evaluate("document.querySelectorAll('video[preload=none]').length"),2);
 const requests=await(await fetch(base+'/__fixture/requests')).json();assert.equal(requests.some(x=>x.path.endsWith('/quote')||x.method==='POST'&&x.path.endsWith('/jobs')),false);
 console.log(JSON.stringify({passed:true,checks:['native-seek-and-fullscreen-entry','separate-voice-play-pause-seek-rate-sync','long-speech-holds-last-frame','same-url-next-item-restarts','thumbnails-no-eager-download'],modelRequests:0,realDataWrites:0}));
}catch(e){if(tab)console.error(JSON.stringify(await evaluate("({events:window.__mediaErrors,visibility:document.visibilityState,media:[...document.querySelectorAll('video,audio')].map(v=>({src:v.getAttribute('src'),width:v.videoWidth,duration:v.duration,ready:v.readyState,error:v.error?.message,paused:v.paused})),text:document.body.textContent.slice(-1800)})").catch(()=>null)));throw e;}finally{if(tab){const info=await call('/info?target='+tab).catch(()=>null);if(info?.url&&new URL(info.url).origin===base&&info.url.includes('ui_check=player-final'))await call('/close?target='+tab).catch(()=>{});}server?.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
