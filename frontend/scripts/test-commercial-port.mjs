// Browser smoke on the local XOi port. No login submission or model generation.
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
const defaults=JSON.parse(await readFile(new URL("../../shared/runtime-defaults.json",import.meta.url),"utf8"));
const base=process.env.XOI_BASE_URL||`http://localhost:${defaults.port}`;
const proxy=process.env.CDP_PROXY||"http://localhost:3456";
const output=await mkdtemp(join(tmpdir(),"xoi-commercial-port-"));
let tab;
async function call(path,body) {
  const response=await fetch(proxy+path,{method:body===undefined?"GET":"POST",...(body===undefined?{}:{body}),signal:AbortSignal.timeout(20000)});
  const value=await response.json();if(value.error||value.exceptionDetails)throw Error("Browser verification failed");return value;
}
const evaluate=async code=>(await call(`/eval?target=${tab}`,code)).value;
try {
  const health=await (await fetch(base+"/api/healthz")).json();assert.equal(health.product,"XOi");
  ({targetId:tab}=await call("/new",base+"/console/login"));assert.ok(tab);
  let ready=false;
  for(let n=0;n<100;n++) {
    ready=await evaluate("!!document.querySelector('input[type=password]') || !!document.querySelector('.menu .logoBox')");
    if(ready)break;await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert.equal(ready,true,"login form or authenticated workbench should render");
  const info=await evaluate(`(async()=>{const entries=performance.getEntriesByType('resource');const old=entries.filter(e=>{try{const u=new URL(e.name);return ['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&['10588','10688'].includes(u.port);}catch{return false;}});const status=await(await fetch('/api/readyz')).json();const announcements=await(await fetch('/announcements.json')).json();return {port:location.port,oldPortRequests:old.length,ready:status.status,announcements:Array.isArray(announcements.data),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
  assert.equal(info.port,String(defaults.port));assert.equal(info.oldPortRequests,0);assert.equal(info.ready,"ready");assert.equal(info.announcements,true);assert.equal(info.overflow,false);
  await call(`/screenshot?target=${tab}&file=${encodeURIComponent(join(output,"login.png"))}`);
  console.log(JSON.stringify({passed:true,...info,loginSubmitted:false,modelRequests:0,screenshots:output}));
}finally{if(tab)await call(`/close?target=${tab}`);}
