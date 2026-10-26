// Render the actual LoadingContent function with fake transport. No accounts or AI calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {build} from "esbuild";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright");
const source=fs.readFileSync("atelier/upstream/src/app/(user)/canvas/components/canvas-node.tsx","utf8");
const component=source.slice(source.indexOf("function LoadingContent("),source.indexOf("function ErrorContent("));
const errorComponent=source.slice(source.indexOf("function ErrorContent("),source.indexOf("function UnknownNodeContent("));
const imageSource=fs.readFileSync("atelier/upstream/src/services/api/image.ts","utf8");
const imageRequest=imageSource.slice(imageSource.indexOf("async function createCanvasImageTaskRequest("),imageSource.indexOf("export async function requestImageQuestion("));
assert.ok(component.includes("取消等待"));
const prelude=`${errorComponent}const RefreshCw=()=>null;window.renderError=()=>root.render(<ErrorContent node={{metadata:{taskStage:"unknown",errorDetails:"任务结果待核实，请勿重复生成"}}} theme={canvasThemes.light} onRetry={()=>{throw new Error("must not retry")}}/>);const assertImageReferencesSupported=()=>{},channelIdForActiveModel=()=>'',aiHeaders=()=>({}),isGeminiConfig=()=>false,isAgnesImageModel=()=>false,isGrok2APIImageConfig=()=>false,isZhipuImageModel=()=>false,usesAccountProxy=()=>true;const publicHttpUrl=url=>/^https?:/.test(url)?url:'',imageToDataUrl=async()=> 'data:image/png;base64,fixture',withSystemPrompt=(_c,p)=>p,withPromptGuard=(_c,p)=>p,applyImageGenerationParams=(b,c,p)=>Object.assign(b,{n:1,size:p.size});${imageRequest}window.imageRequest=async()=>{const r=await createCanvasImageTaskRequest({model:'fixture',channelMode:'remote'},'test',[{url:'https://fixture.invalid/a.png'},{url:'/oss/local.png'}],{n:1,size:'1024x1024'},{clientTaskId:'stable-id'});return{json:JSON.parse(r.body),form:r.body instanceof FormData};};`;
const js=await build({stdin:{contents:`import React,{useState,useEffect,useRef} from 'react';import{createRoot}from'react-dom/client';import{CanvasNodeType}from'./atelier/upstream/src/app/(user)/canvas/types';import{canvasThemes}from'./atelier/upstream/src/lib/canvas-theme';const useUserStore={getState:()=>({token:'fixture'})};const selectionBlue='#2f80ff';const formatDuration=ms=>Math.round(ms/1000)+'秒';${component}${prelude} const root=createRoot(document.getElementById('root'));window.render=(stage,type='image')=>root.render(<LoadingContent key={stage+type} node={{id:'fixture',type:CanvasNodeType[type==='video'?'Video':type==='audio'?'Audio':'Image'],metadata:{status:'loading',taskStage:stage,imageTaskId:'fixture-image',videoTaskId:'fixture-video',audioTaskId:'fixture-audio',progress:0}}} theme={canvasThemes.light}/>);window.render('queued');window.ready=true;`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",format:"esm",nodePaths:[path.resolve("atelier/node_modules")]});
let calls=[],conflict=false;
const server=http.createServer((req,res)=>{
 if(req.url==="/fixture.js"){res.setHeader("content-type","text/javascript");return res.end(js.outputFiles[0].text);}
 if(req.method==="POST"){
  calls.push({url:req.url,authorization:req.headers.authorization});
  res.setHeader("content-type","application/json");res.statusCode=conflict?409:200;
  return setTimeout(()=>res.end(JSON.stringify(conflict?{message:"任务已提交上游，请查询原任务"}:{data:{status:"cancelled"}})),120);
 }
 res.setHeader("content-type","text/html; charset=utf-8");res.end('<div id="root" style="width:320px;height:240px"></div><script type="module" src="/fixture.js"></script>');
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.goto(base);await page.waitForFunction(()=>window.ready);
 for(const kind of ["image","video","audio"]){
  await page.evaluate(kind=>window.render("queued",kind),kind);
  await page.getByText("等待执行",{exact:true}).waitFor();
  const button=page.getByRole("button",{name:"取消等待"});await button.click();
  await page.getByText("已取消",{exact:true}).first().waitFor();
  assert.equal(calls.at(-1).url,`/api/workspace/generation-tasks/${kind}/fixture-${kind}/cancel`);
  assert.equal(calls.at(-1).authorization,"Bearer fixture");
 }
 conflict=true;await page.evaluate(()=>window.render("running"));await page.getByText("正在生成",{exact:true}).waitFor();
 assert.equal(await page.getByRole("button").count(),0);
 assert.doesNotMatch(await page.locator("#root").innerText(),/\d+%/);
 await page.evaluate(()=>window.render("queued"));await page.getByRole("button",{name:"取消等待"}).click();
 await page.getByRole("alert").waitFor();assert.match(await page.getByRole("alert").innerText(),/已提交上游/);
 assert.equal(calls.length,4);
 const image=await page.evaluate(()=>window.imageRequest());assert.equal(image.form,false);assert.equal(image.json.clientTaskId,"stable-id");assert.deepEqual(image.json.request.images,["https://fixture.invalid/a.png","data:image/png;base64,fixture"]);
 await page.evaluate(()=>window.renderError());await page.getByText("任务结果待核实，请勿重复生成",{exact:true}).waitFor();assert.equal(await page.getByRole("button").count(),0);
 console.log(JSON.stringify({passed:true,queuedLabels:true,imageVideoAudioCancel:true,cancelRaceExplained:true,runningNotFakePercent:true,referenceImagesJsonEnvelope:true,paidRequests:0}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
