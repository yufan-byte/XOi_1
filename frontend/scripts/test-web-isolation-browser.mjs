/** Local file and mocked transport only; uses a disposable Chrome profile, never the user's session. */
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const store=(await readFile(new URL('../monoform/xoi/scene-store.js',import.meta.url),'utf8')).replace(/^import .*;\s*$/m,'').replace('export async function startSceneStore','async function startSceneStore');
const script=`const projectKey=()=> 'monoform-project-director3d-u1-test';\n${store}\n
(async()=>{
  const calls=[];let cloud=null;
  localStorage.clear();localStorage.setItem('xoi_session','1:test');
  window.fetch=async(path,init)=>{if(!String(path).startsWith('/api/director-scenes/'))throw Error('Unexpected network call');calls.push({method:init.method,expected:init.headers['X-Xoi-Expected-User'],authorization:init.headers.Authorization});if(init.method==='PUT'){const body=JSON.parse(init.body);cloud={revision:body.revision+1,payload:body.payload};return new Response(JSON.stringify({data:cloud}));}return cloud?new Response(JSON.stringify({data:cloud})):new Response('{}',{status:404});};
  const api=await startSceneStore({sceneId:'director3d-u1-test',userId:1,token:'1:test'});
  const p={shots:[{id:'s1'}],activeShotId:'s1',objects:[],camera:{position:[0,1,5]}};
  localStorage.setItem(projectKey(),JSON.stringify(p));
  const changed=api.status==='dirty';
  await api.checkpoint();
  const before=localStorage.getItem(projectKey());
  localStorage.setItem('xoi_session','2:test');let rejected=false;
  try{localStorage.setItem(projectKey(),JSON.stringify({...p,secret:'late'}));}catch{rejected=true;}
  const retained=localStorage.getItem(projectKey())===before;
  api.dispose();
  const passed=changed&&api.revision===1&&rejected&&retained&&calls.some(c=>c.method==='PUT')&&calls.every(c=>c.expected==='1'&&!c.authorization);
  document.body.textContent=JSON.stringify({passed,changed,revision:api.revision,rejected,retained,calls,modelRequests:0});
})().catch(e=>document.body.textContent=JSON.stringify({passed:false,error:e.message}));`;
const dir=await mkdtemp(join(tmpdir(),'xoi-web-isolation-'));
try{
  const file=join(dir,'test.html');await writeFile(file,`<html><body>pending</body><script>${script}</script></html>`);
  const output=execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--disable-background-networking','--disable-sync','--disable-extensions','--no-first-run','--user-data-dir='+join(dir,'profile'),'--virtual-time-budget=8000','--dump-dom','file://'+file],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});
  const match=output.match(/<body>(\{[^<]+\})<\/body>/);assert.ok(match,output.slice(0,400));
  const result=JSON.parse(match[1]);console.log(JSON.stringify(result));assert.equal(result.passed,true);
}finally{await rm(dir,{recursive:true,force:true});}
