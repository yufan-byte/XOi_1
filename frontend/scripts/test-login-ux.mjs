// Built console + fake local auth transport. No real accounts, login, generation or payment.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=path.resolve("public/console");let calls=0,pending;
const waitPending=async()=>{for(let i=0;i<300&&!pending;i++)await new Promise(r=>setTimeout(r,10));assert.ok(pending,"fixture login request was not received");};
const mime={".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png",".woff2":"font/woff2"};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,"http://fixture.invalid");
 if(url.pathname==="/api/login/login"){
  calls++;for await(const _ of req){};pending=res;return;
 }
 if(url.pathname.startsWith("/api/")){res.setHeader("content-type","application/json");return res.end(JSON.stringify({success:true,data:{}}));}
 if(url.pathname==="/"){res.setHeader("content-type","text/html");return res.end("<h1>Fixture application entered</h1>");}
 const file=path.resolve(root,"."+url.pathname.replace(/^\/console/,""));
 if(!file.startsWith(root+path.sep)){res.statusCode=404;return res.end();}
 if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader("content-type",mime[path.extname(file)]||"application/octet-stream");return res.end(fs.readFileSync(file));}
 if(path.extname(file)){res.statusCode=404;return res.end();}
 res.setHeader("content-type","text/html; charset=utf-8");res.end(fs.readFileSync(path.join(root,"index.html")));
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});let sceneLoads=0;
 page.on("request",r=>{if(r.url().includes("orbit-scene-"))sceneLoads++;});
 await page.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.goto(base+"/console/login?next="+encodeURIComponent("/#/script?projectId=9")+"&ref=fixture");
 const dialog=page.getByRole("dialog");await dialog.waitFor();
 assert.equal(new URL(page.url()).searchParams.has("next"),false);
 assert.equal(new URL(page.url()).searchParams.get("ref"),"fixture");
 await page.reload();await dialog.waitFor(); // return destination survives refresh
 await dialog.locator('input[autocomplete="username"]').fill("fixture");await dialog.locator('input[autocomplete="current-password"]').fill("fixture-password");
 const checks=dialog.locator('input[type="checkbox"]');for(let i=0;i<3;i++)await checks.nth(i).check();
 await dialog.locator("form").evaluate(form=>{form.addEventListener("submit",()=>window.submitStart=performance.now(),{once:true,capture:true});const observer=new MutationObserver(()=>{if(window.submitStart&&form.querySelector('button[aria-busy="true"]')){window.busyFeedback=performance.now()-window.submitStart;observer.disconnect();}});observer.observe(form,{attributes:true,childList:true,subtree:true});});
 const start=performance.now();await dialog.getByRole("button",{name:"登录",exact:true}).click();
 const busy=dialog.getByRole("button",{name:"正在验证登录…",exact:true});await busy.waitFor();const feedbackMs=Math.round(performance.now()-start);assert.equal(await busy.isDisabled(),true);
 const domFeedbackMs=await page.evaluate(()=>Math.round(window.busyFeedback));assert.ok(Number.isFinite(domFeedbackMs));
 await dialog.locator("form").evaluate(form=>{for(let i=0;i<3;i++)form.requestSubmit();});await waitPending();assert.equal(calls,1);
 pending.writeHead(409,{"content-type":"application/json"});pending.end(JSON.stringify({message:"登录会话数量已达上限，请联系管理员清理遗留会话",code:400}));pending=undefined;
 await dialog.getByRole("alert").waitFor();assert.match(await dialog.getByRole("alert").innerText(),/上限/);assert.doesNotMatch(await dialog.innerText(),/Conflict/);
 await dialog.getByRole("button",{name:"登录",exact:true}).click();await busy.waitFor();
 await waitPending();assert.equal(calls,2);pending.writeHead(200,{"content-type":"application/json"});pending.end(JSON.stringify({code:200,data:{token:"fixture-only",id:777,name:"fixture",role:"user"}}));pending=undefined;
 await page.waitForURL(base+"/#/script?projectId=9");assert.equal(await page.evaluate(()=>localStorage.getItem("token")),"Bearer fixture-only");
 assert.equal(await page.evaluate(()=>sessionStorage.getItem("xoi.login-return.v1")),null);
 assert.equal(sceneLoads,0);
 const expired=await browser.newPage();await expired.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await expired.addInitScript(()=>localStorage.setItem("token","Bearer eyJhbGciOiJIUzI1NiJ9."+btoa(JSON.stringify({id:777,exp:1}))+".fixture"));
 await expired.goto(base+"/console/login?next="+encodeURIComponent("//evil.example"));
 await expired.getByRole("dialog").waitFor();assert.equal(new URL(expired.url()).pathname,"/console/login");
 await expired.close();
 const blocked=await browser.newPage();await blocked.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException("blocked","SecurityError")}});
 await blocked.goto(base+"/console/login?next="+encodeURIComponent("/team"));await blocked.getByRole("dialog").waitFor();
 assert.equal(new URL(blocked.url()).searchParams.get("next"),"/team");
 const blockedDialog=blocked.getByRole("dialog");await blockedDialog.locator('input[autocomplete="username"]').fill("fixture");await blockedDialog.locator('input[autocomplete="current-password"]').fill("fixture-password");
 const blockedChecks=blockedDialog.locator('input[type="checkbox"]');for(let i=0;i<3;i++)await blockedChecks.nth(i).check();
 await blockedDialog.getByRole("button",{name:"登录",exact:true}).click();await waitPending();assert.equal(calls,3);
 pending.writeHead(200,{"content-type":"application/json"});pending.end(JSON.stringify({code:200,data:{token:"fixture-only",id:777,name:"fixture",role:"user"}}));pending=undefined;
 await blockedDialog.getByRole("alert").waitFor();assert.match(await blockedDialog.getByRole("alert").innerText(),/无法保存登录状态/);assert.equal(new URL(blocked.url()).pathname,"/console/login");await blocked.close();
 const authed=await browser.newPage();await authed.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await authed.addInitScript(()=>localStorage.setItem("token","Bearer eyJhbGciOiJIUzI1NiJ9."+btoa(JSON.stringify({id:777,exp:Math.floor(Date.now()/1000)+300}))+".fixture"));
 await authed.goto(base+"/console/login?next="+encodeURIComponent("/#/assets"));await authed.waitForURL(base+"/#/assets");await authed.close();
 console.log(JSON.stringify({passed:true,submitToBusyDomMs:domFeedbackMs,clickAndAutomationWaitMs:feedbackMs,doubleSubmitBlocked:true,clearSessionLimitError:true,successNavigates:true,cleanLoginAddress:true,returnSurvivesReload:true,returnConsumed:true,expiredTokenDoesNotLoop:true,blockedStorageDoesNotCrash:true,storageFailureDoesNotPretendSuccess:true,existingSessionRespectsTarget:true,directAuthAvoids3DBundle:true,realLoginRequests:0,paidRequests:0}));
}finally{pending?.end();await browser.close();await new Promise(r=>server.close(r));}
