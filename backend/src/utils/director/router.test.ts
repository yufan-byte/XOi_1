import {test} from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {createDirectorRouter} from "./router";
import {AssistantError} from "../aiAssistant/videoAnalysis";
import {billingReceiptStatus} from "../billingReceiptState";
const scene={projectId:"director3d-u1-fixture",activeShotId:"shot-1",name:"测试",fps:24,durationSeconds:5,aspectRatio:"16:9",camera:{position:[0,2,6],rotation:[0,0,0],focalLength:35},objects:[],cameraKeyframes:[],shotNames:["镜头"],lighting:{}};
function fixture(task:"plan"|"compose",overrides:Record<string,any>={}){
  let calls=0,configs=0,finishes=0;
  const router=createDirectorRouter({getConfig:async()=>{configs++;return {model:"fixture",baseUrl:"http://fixture.invalid/v1",apiKey:"fixture"};},getSkills:async()=>[],plan:async()=>{calls++;return {} as any;},compose:async()=>{calls++;return {} as any;},fetcher:async()=>{throw new Error("真实模型请求禁止");},finishBudget:async()=>{finishes++;},...overrides});
  const handler=(router as any).stack.find((layer:any)=>layer.route?.path===`/${task}`).route.stack[0].handle;
  const req:any={user:{id:1},body:task==="plan"?{scene,intent:"一个推进镜头",skillId:"seedance-shot-design",shotCount:1}:{scene,intent:"搭一张桌子",task:"build"}};
  const res:any=Object.assign(new EventEmitter(),{destroyed:false,writableEnded:false,body:undefined as any,statusCode:200,status(code:number){this.statusCode=code;return this;},json(body:any){this.body=body;this.writableEnded=true;return this;}});
  return {req,res,run:()=>handler(req,res),counts:()=>({calls,configs,finishes})};
}
test("one-shot authorization closes after either director task succeeds",async()=>{
  for(const task of ["plan","compose"] as const){const f=fixture(task);await f.run();assert.equal(f.res.statusCode,200);assert.equal(f.res.body.data.projectId,scene.projectId);assert.deepEqual(f.counts(),{calls:1,configs:1,finishes:1});}
});
test("bad input, wrong owner and absent config never call a model but still close authorization",async()=>{
  for(const task of ["plan","compose"] as const){
    const bad=fixture(task);bad.req.body.intent="";await bad.run();assert.equal(bad.res.statusCode,400);assert.deepEqual(bad.counts(),{calls:0,configs:0,finishes:1});
    const other=fixture(task);other.req.user.id=2;await other.run();assert.equal(other.res.statusCode,403);assert.equal(other.counts().calls,0);assert.equal(other.counts().finishes,1);
    const absent=fixture(task,{getConfig:async()=>null});await absent.run();assert.equal(absent.counts().calls,0);assert.equal(absent.counts().finishes,1);
  }
});
test("disconnect during preparation blocks the first model call and closes authorization",async()=>{
  let release!:(value:any)=>void;const waiting=new Promise(resolve=>release=resolve);
  const f=fixture("compose",{getConfig:()=>waiting});const pending=f.run();
  f.res.destroyed=true;f.res.emit("close");release({model:"fixture",baseUrl:"http://fixture.invalid/v1",apiKey:"fixture"});await pending;
  assert.equal(f.counts().calls,0);assert.equal(f.counts().finishes,1);assert.equal(f.res.body,undefined);
});
test("a model/format failure is not retried and finishes the single-call budget",async()=>{
  let calls=0;const f=fixture("plan",{plan:async()=>{calls++;throw new AssistantError("模型输出格式无效，已提交用量请查积分明细",502);}});await f.run();assert.equal(calls,1);assert.equal(f.res.statusCode,502);assert.equal(f.counts().finishes,1);
});
test("no-submission receipt is only asserted with a stopped zero-call ledger",()=>{
  assert.equal(billingReceiptStatus(0,{state:"stopped",calls:0}),"not_submitted");
  assert.equal(billingReceiptStatus(0,{state:"active",calls:0}),"pending");
  assert.equal(billingReceiptStatus(0,{state:"stopped",calls:1}),"pending");
  assert.equal(billingReceiptStatus(1,{state:"stopped",calls:1}),"recorded");
  assert.equal(billingReceiptStatus(0,null),"pending");
});
