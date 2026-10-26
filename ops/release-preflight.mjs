// Read-only release gates. No login, model generation, payment, sync or business writes.
import { access, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export async function inspectLayout(appRoot, imageLayout=false) {
  const checks=[];
  const program=imageLayout?path.join(appRoot,"release"):path.join(appRoot,"backend/data");
  const data=imageLayout?path.join(appRoot,"assets-seed"):path.join(appRoot,"backend/data");
  for(const file of ["serve/app.js","web/index.html","web/console/index.html","web/atelier-canvas/index.html","web/one-stop/index.html","fonts/Comismsh.ttf"]) {
    let ok=false;try{ok=(await stat(path.join(program,file))).size>0;}catch{}
    checks.push({name:`程序资源 ${file}`,ok});
  }
  let skill=false;try{skill=(await stat(path.join(data,"skills/script_agent_decision.md"))).size>0;}catch{}
  checks.push({name:"剧本技能资源",ok:skill});
  for(const app of ["", "console/", "atelier-canvas/", "one-stop/"]) {
    let ok=false;
    try {
      const index=await readFile(path.join(program,"web",app,"index.html"),"utf8");
      const assets=[...index.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(match=>match[1]).filter(url=>!/^https?:|^data:/.test(url));
      if(!assets.length)throw Error("No bundle references");
      for(const asset of assets) {
        const relative=asset.startsWith("/")?asset.slice(1):path.posix.join(app,asset);
        const file=path.resolve(program,"web",relative);
        const boundary=path.resolve(program,"web")+path.sep;
        if(!file.startsWith(boundary))throw Error("Escaping bundle reference");
        await access(file);
      }
      ok=true;
    }catch{}
    checks.push({name:`入口依赖 ${app||"主站"}`,ok});
  }
  return checks;
}
export async function inspectService(base,expectedRelease) {
  const url=new URL(base);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error("提供不含凭据或参数的 HTTP(S) 站点地址");
  const checks=[];
  const read=async pathname=>{
    try{const response=await fetch(new URL(pathname,url),{signal:AbortSignal.timeout(10000),redirect:"error"});return {ok:response.ok,body:await response.json()};}
    catch{return {ok:false,body:null};}
  };
  const health=await read("/api/healthz");
  const ours=health.ok&&health.body?.product==="XOi"&&health.body?.status==="ok";
  checks.push({name:"服务身份与存活",ok:ours});
  // Do not continue probing a service that could belong to another app.
  if(!ours)return checks;
  const version=await read("/api/version");
  checks.push({name:"发布版本",ok:version.ok&&version.body?.product==="XOi"&&typeof version.body?.release==="string"&&(!expectedRelease||version.body.release===expectedRelease)});
  const ready=await read("/api/readyz");checks.push({name:"依赖与关键模块就绪",ok:ready.ok&&ready.body?.status==="ready"});
  for(const pathname of ["/","/console/login","/atelier-canvas/index.html","/one-stop/"]) {
    let ok=false;
    try{const response=await fetch(new URL(pathname,url),{signal:AbortSignal.timeout(10000),redirect:"error"});ok=response.ok&&response.headers.get("content-type")?.includes("text/html")&&(await response.text()).includes("<html");}catch{}
    checks.push({name:`页面 ${pathname}`,ok:Boolean(ok)});
  }
  return checks;
}
async function main() {
  const args=process.argv.slice(2);
  const value=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
  const layout=value("--layout");
  const checks=await inspectLayout(layout?path.resolve(layout):root,Boolean(layout));
  const base=value("--base");if(base)checks.push(...await inspectService(base,value("--expected-release")));
  const passed=checks.every(check=>check.ok);
  console.log(JSON.stringify({passed,readOnly:true,modelRequests:0,checks},null,2));
  process.exitCode=passed?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().catch(()=>{console.error("发布预检查失败；请检查参数、版本目录与站点可达性。");process.exitCode=1;});
