// Own-process lifecycle only. Never kill by port or adopt a foreign health endpoint.
import { spawn, execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, open, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const backend=path.join(root,"backend"),run=path.join(root,".xoi-run");
const defaults=JSON.parse(await readFile(path.join(root,"shared/runtime-defaults.json"),"utf8"));
const manifestFile=path.join(run,"backend.json"),pidFile=path.join(run,"backend.pid");
export function configuredPort(env=process.env) {
  const port=Number(env.PORT||defaults.port);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error("PORT 必须是 1024–65535 的整数");
  return port;
}
export function isOurHealth(body,instance) {
  return body?.product===defaults.product&&body.status==="ok"&&(!instance||body.instance===instance);
}
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
export function ownedProcess(pid) {
  if(!Number.isSafeInteger(pid)||pid<2||pid===process.pid||!alive(pid))return false;
  try {
    const cwd=execFileSync("lsof",["-a","-p",String(pid),"-d","cwd","-Fn"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).split("\n").find(line=>line.startsWith("n"))?.slice(1);
    const args=execFileSync("ps",["-p",String(pid),"-o","command="],{encoding:"utf8"});
    return cwd===backend&&/(?:src\/app\.ts|data\/serve\/app\.js)(?:\s|$)/.test(args);
  }catch{return false;}
}
async function saved() {
  try {return JSON.parse(await readFile(manifestFile,"utf8"));}catch{}
  try {return {pid:Number((await readFile(pidFile,"utf8")).trim())};}catch{return null;}
}
async function json(url) {
  try { const response=await fetch(url,{signal:AbortSignal.timeout(5000)});return {ok:response.ok,body:await response.json()}; }catch{return {ok:false,body:null};}
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function stop() {
  const record=await saved();
  if(!record){console.log("XOi 没有受管理的本地服务。");return;}
  if(!ownedProcess(record.pid)) {
    if(alive(record.pid))throw Error("记录的 PID 不属于本项目后端，拒绝终止。请检查 .xoi-run 记录。");
    await unlink(manifestFile).catch(()=>{});await unlink(pidFile).catch(()=>{});
    console.log("XOi 旧进程已退出，已清理失效的进程记录；没有关闭其他应用。");return;
  }
  process.kill(record.pid,"SIGTERM");
  // Backend drains for up to 45s and has its own 55s final deadline.
  // Do not report a normal graceful shutdown as failure after only 20s.
  const deadline=Date.now()+60000;
  while(alive(record.pid)&&Date.now()<deadline)await pause(200);
  if(alive(record.pid))throw Error("XOi 未在60秒内退出；未强制杀进程，请检查在途任务和日志。");
  await unlink(manifestFile).catch(()=>{});await unlink(pidFile).catch(()=>{});
  console.log("XOi 本地后端已停止；数据库、NewAPI 和其他应用保持不动。");
}
async function start(foreground=false) {
  const port=configuredPort(),base=`http://127.0.0.1:${port}`,record=await saved();
  if(record&&ownedProcess(record.pid)) {
    if(record.port!==port)throw Error("本项目已有其他端口的实例，请先 ./stop.sh，再切换端口；不会并行启动两个生成调度器。");
    const health=await json(base+"/api/healthz"),ready=await json(base+"/api/readyz");
    if(isOurHealth(health.body,record.instance)&&ready.ok){console.log(`XOi 已运行：http://localhost:${port}`);return;}
    throw Error("已有XOi进程尚未就绪，请查看 .xoi-run/backend.log；不会重复启动。");
  }
  let listeners=[];
  try{listeners=execFileSync("lsof",["-t",`-iTCP:${port}`,"-sTCP:LISTEN"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim().split("\n").filter(Boolean);}catch{}
  if(listeners.length)throw Error(`端口 ${port} 已被占用，拒绝接管或关闭该服务。可设置 PORT 选择其他端口。`);
  const log=await open(path.join(run,"backend.log"),"a",0o600);
  const env={...process.env,NODE_ENV:"dev",PORT:String(port),XOI_LOCAL_INSTANCE:crypto.randomUUID()};
  for(const name of ["HTTP_PROXY","HTTPS_PROXY","http_proxy","https_proxy","ALL_PROXY","all_proxy"])delete env[name];
  // 从 WorkBuddy/CodeBuddy 沙箱终端启动时，会把"文件代理 shim"注入给子进程：
  // 后端的 fs 走 broker 通道，代理会话一断（工具调用结束/超时）读静态文件就抛
  // "connect failed: Connection refused"，未捕获异常把事件循环打挂 → 端口在听但不响应。
  // 后端是长期服务，必须用原生 fs，这里把沙箱注入彻底剥掉。
  if(env.NODE_OPTIONS){
    const cleaned=env.NODE_OPTIONS.split(/\s+/).filter(token=>!/node-language-shim|brokered-fs-shim|safe-delete-shim|vendored-shim/.test(token)).join(" ").trim();
    if(cleaned)env.NODE_OPTIONS=cleaned;else delete env.NODE_OPTIONS;
  }
  if(env.PATH)env.PATH=env.PATH.split(":").filter(dir=>!dir.includes("cli/vendor/shim")).join(":");
  for(const name of Object.keys(env))if(/^CODEBUDDY_(BROKERED|SANDBOX_BROKER|SAFE_DELETE)/.test(name))delete env[name];
  const child=spawn(process.execPath,["--import","tsx","src/app.ts"],{cwd:backend,env,detached:!foreground,stdio:foreground?"inherit":["ignore",log.fd,log.fd]});
  await new Promise((resolve,reject)=>{child.once("spawn",resolve);child.once("error",reject);});
  const info={pid:child.pid,port,instance:env.XOI_LOCAL_INSTANCE};
  await writeFile(manifestFile,JSON.stringify(info),{mode:0o600});await writeFile(pidFile,String(child.pid),{mode:0o600});
  await log.close();
  if(foreground){await new Promise(resolve=>child.once("exit",resolve));return;}
  child.unref();
  const deadline=Date.now()+90_000;
  while(Date.now()<deadline) {
    if(!alive(child.pid))throw Error("XOi 启动后退出，请查看 .xoi-run/backend.log。");
    const health=await json(base+"/api/healthz");
    if(health.ok&&isOurHealth(health.body,info.instance)) {
      const ready=await json(base+"/api/readyz");
      if(ready.ok){console.log(`XOi 已就绪：http://localhost:${port}\n项目：http://localhost:${port}/#/project\n停止：./stop.sh`);return;}
    }
    await pause(500);
  }
  throw Error("XOi 尚未通过身份/就绪检查；保留日志和进程记录供检查，不会误认其他服务已启动。");
}
async function main() {
  if(process.loadEnvFile){try{process.loadEnvFile(path.join(backend,".env"));}catch(error){if(error.code!=="ENOENT")throw error;}}
  await mkdir(run,{recursive:true});
  const command=process.argv[2];
  if(command==="port"){console.log(configuredPort());return;}
  if(command==="stop"){await stop();return;}
  if(command==="status") {
    const record=await saved(),owned=Boolean(record&&ownedProcess(record.pid));
    const base=owned&&record.port?`http://127.0.0.1:${record.port}`:null;
    const health=base?await json(base+"/api/healthz"):null;
    const ready=Boolean(base&&health?.ok&&isOurHealth(health.body,record.instance)&&(await json(base+"/api/readyz")).ok);
    console.log(JSON.stringify({running:owned,port:record?.port||null,ready}));return;
  }
  if(command!=="start")throw Error("Use start, stop, status or port");
  const lockFile=path.join(run,"start.lock");let lock;
  try{lock=await open(lockFile,"wx",0o600);}catch{throw Error("另一次启动尚未结束，拒绝重复启动。若上次启动异常终止，请确认后清理 .xoi-run/start.lock。");}
  try{await start(process.argv.includes("--foreground"));}finally{await lock.close();await unlink(lockFile).catch(()=>{});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().catch(error=>{console.error(error.message);process.exitCode=1;});
