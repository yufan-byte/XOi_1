import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import express from "express";
import {createServer} from "node:http";
import {MediaHistory,createMediaHistoryRouter,historyMetadata} from "../lib/workspace/mediaHistory";
import {mergeHistory,historyCache} from "../../../frontend/console/src/one-stop/studio/history-core";
import type {Work} from "../../../frontend/console/src/one-stop/studio/history-types";
import {MEDIA_HISTORY_POLICY} from "../../../shared/mediaHistoryPolicy";

async function fixture(t:any){
  const db=knex({client:"better-sqlite3",connection:{filename:":memory:"},useNullAsDefault:true,pool:{min:1,max:1}});
  t.after(()=>db.destroy());
  await db.schema.createTable("xoi_generation_tasks",table=>{
    table.increments("id");table.string("task_id");table.integer("user_id");table.string("kind");table.string("status");table.bigInteger("updated_at");table.text("payload");table.unique(["kind","task_id"]);
  });
  await db.schema.createTable("xoi_media_queue",table=>{table.increments("id");table.string("task_id");table.integer("user_id");table.string("kind");table.string("client_id");});
  const insert=async(id:string,user=1,kind="image",status="succeeded",payload:any={},oneStop=true)=>{
    await db("xoi_generation_tasks").insert({task_id:id,user_id:user,kind,status,updated_at:1000,payload:JSON.stringify({model:"fixture",prompt:"历史提示词",...payload})});
    await db("xoi_media_queue").insert({task_id:id,user_id:user,kind,client_id:oneStop?`one-stop-${id}#hash`:`canvas-${id}`});
  };
  return {db,store:new MediaHistory(db),insert};
}
test("cloud history paginates every record beyond 200, retains old dates and isolates account and kind",async t=>{
  const f=await fixture(t);
  for(let i=0;i<237;i++)await f.insert(`old-${i}`);
  await f.insert("other-owner",2);await f.insert("other-kind",1,"video");
  let before:number|undefined;const ids:string[]=[];
  do{
    const page=await f.store.list(1,"image",before);assert.ok(page.items.length<=50);ids.push(...page.items.map(row=>row.taskId));before=page.nextCursor??undefined;
  }while(before);
  assert.equal(new Set(ids).size,237);assert.equal(ids[0],"old-236");assert.equal(ids.at(-1),"old-0");
  assert.deepEqual((await f.store.list(2,"image")).items.map(row=>row.taskId),["other-owner"]);
  assert.equal((await f.store.list(1,"video")).items.length,1);
  await assert.rejects(f.store.list(0,"image"),(e:any)=>e.status===401);
  await assert.rejects(f.store.list(1,"one-stop"));await assert.rejects(f.store.list(1,"image",NaN));
});
test("restore media results and state without returning billing ids, upstream keys or unsafe result URLs",async t=>{
  const f=await fixture(t);
  await f.insert("done",1,"image","succeeded",{queuedAt:77,billingId:"private-budget",apiKey:"never-return",error:"old transient failure",result:{images:[{url:"/oss/private-1.png"},"/oss/private-2.png","https://provider.invalid/secret?token=private"],width:1024,height:1024},history:{clientWorkId:"local-id",params:{ratio:"1:1"}}});
  await f.insert("ambiguous",1,"image","unknown");await f.insert("cancelled",1,"image","cancelled");
  const page=await f.store.list(1,"image"),done=page.items.find(w=>w.taskId==="done")!;
  assert.equal(done.createdAt,77);assert.equal(done.id,"image:done");assert.equal(done.meta.clientWorkId,"local-id");assert.equal(done.status,"done");assert.equal(done.meta.size,"1024x1024");
  assert.deepEqual(done.urls,["/oss/private-1.png","/oss/private-2.png"]);
  assert.equal(done.error,undefined);
  assert.equal(page.items.find(w=>w.taskId==="ambiguous")!.meta.unconfirmed,true);
  assert.equal(page.items.find(w=>w.taskId==="cancelled")!.error,"已取消");
  assert.doesNotMatch(JSON.stringify(page),/private-budget|never-return|provider\.invalid/);
});
test("favorites and removal persist without deleting original tasks, and cannot touch another account",async t=>{
  const f=await fixture(t);await f.insert("mine");await f.insert("theirs",2);
  await assert.rejects(f.store.preference(1,"image","theirs",{hidden:true}),(e:any)=>e.status===404);
  await f.store.preference(1,"image","mine",{favorite:true});
  assert.equal((await new MediaHistory(f.db).list(1,"image")).items[0].favorite,true);
  await f.store.preference(1,"image","mine",{hidden:true});
  const page=await f.store.list(1,"image",undefined,["mine","theirs"]);
  assert.equal(page.items.length,0);assert.deepEqual(page.hiddenTaskIds,["mine"]);
  assert.equal((await f.db("xoi_generation_tasks")).length,2);
  await f.store.preference(1,"image","mine",{hidden:false});assert.equal((await f.store.list(1,"image")).items.length,1);
});
test("one-stop history excludes other modules and legacy recovery verifies persisted owner and canvas source",async t=>{
  const f=await fixture(t);await f.insert("studio");await f.insert("old-studio",1,"image","succeeded",{},false);
  await f.insert("canvas",1,"image","succeeded",{sourceId:"canvas-1"},false);await f.insert("other-module",1,"image","succeeded",{},false);await f.insert("foreign",2,"image","succeeded",{},false);
  assert.deepEqual((await f.store.list(1,"image")).items.map(w=>w.taskId),["studio"]);
  const result=await f.store.recoverLocal(1,"image",["old-studio","canvas","foreign"]);assert.equal(result.recovered,1);
  assert.deepEqual(new Set((await f.store.list(1,"image")).items.map(w=>w.taskId)),new Set(["studio","old-studio"]));
  assert.equal((await f.db("xoi_generation_tasks")).length,5);
});
test("saved generation metadata is bounded, maps input modes and omits inline images and credentials",()=>{
  const meta=historyMetadata("image",{clientTaskId:"work-1",prompt:"x".repeat(10000),mode:"image-edit",aspect_ratio:"9:16",negative_prompt:"不要文字",reference_images:[{base64:"data:image/png;base64,private"},{base64:"/oss/own.png"}],apiKey:"private-key",headers:{authorization:"secret"}});
  assert.equal(meta.prompt.length,4000);assert.equal(meta.modeKey,"edit");assert.deepEqual(meta.refs,["/oss/own.png"]);assert.equal(meta.refsOmitted,true);
  assert.equal(meta.clientWorkId,"work-1");assert.equal(historyMetadata("image",{clientTaskId:123}).clientWorkId,undefined);
  assert.doesNotMatch(JSON.stringify(meta),/private-key|authorization|data:image/);
  const audio=historyMetadata("audio",{input:"旁白",voice:"voice-a",speed:1.1,response_format:"mp3"});assert.equal(audio.prompt,"旁白");assert.equal(audio.params.speed,"1.1");
});
const work=(id:string,patch:Partial<Work>={}):Work=>({id,taskId:id,kind:"image",createdAt:1,model:"fixture",prompt:"本机提示词",status:"done",...patch});
test("local cache limit does not truncate in-memory history and unmatched drafts survive",()=>{
  const cloud=Array.from({length:237},(_,i)=>work(`task-${i}`,{createdAt:i}));
  const merged=mergeHistory([work("unconfirmed",{taskId:undefined,status:"failed",meta:{unconfirmed:true,refs:["data:image/png;base64,private"]}})],cloud);
  assert.equal(merged.length,238);const cached=historyCache(merged);assert.equal(cached.length,201);
  assert.equal(cached.find(w=>w.id==="unconfirmed")!.meta!.refsOmitted,true);assert.equal(merged.length,238);
});
test("cloud reconciliation recovers lost acknowledgement and preserves distinct tasks using the same canvas client id",()=>{
  const local=work("local-id",{taskId:undefined,status:"failed",meta:{params:{ratio:"9:16"}}});
  const restored=work("image:task-id",{taskId:"task-id",meta:{clientWorkId:"local-id",source:"studio",cloud:true}});
  const merged=mergeHistory([local],[restored]);assert.equal(merged.length,1);assert.equal(merged[0].id,"local-id");assert.equal(merged[0].taskId,"task-id");
  const a=work("image:a",{taskId:"a",meta:{clientWorkId:"same-node",source:"canvas"}}),b=work("image:b",{taskId:"b",meta:{clientWorkId:"same-node",source:"canvas"}});
  assert.equal(mergeHistory([],[a,b]).length,2);assert.equal(mergeHistory([],[a,b],new Set(["image:a"])).length,1);
  assert.equal(mergeHistory([work("audio-local")],[work("audio-local",{prompt:"未记录提示词",meta:{promptMissing:true}})])[0].prompt,"本机提示词");
  assert.equal(mergeHistory([work("recovered",{status:"failed",error:"old failure"})],[work("recovered")])[0].error,undefined);
});
test("history HTTP routes require identity, do not cache private data and validate preference changes",async t=>{
  const f=await fixture(t);await f.insert("mine");await f.insert("other",2);
  const app=express();app.use(express.json());app.use((req,_res,next)=>{if(req.headers["x-test-owner"])(req as any).user={id:Number(req.headers["x-test-owner"])};next();});app.use("/history",createMediaHistoryRouter(f.db));
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${(server.address() as any).port}/history`;
  assert.equal((await fetch(base)).status,401);
  const headers={"X-Test-Owner":"1","Content-Type":"application/json"};
  const response=await fetch(base,{headers});assert.match(response.headers.get("cache-control")!,/no-store/);assert.equal((await response.json() as any).data.items.length,1);
  assert.equal((await fetch(`${base}/image/other`,{method:"PATCH",headers,body:JSON.stringify({hidden:true})})).status,404);
  assert.equal((await fetch(`${base}/image/mine`,{method:"PATCH",headers,body:JSON.stringify({user_id:2})})).status,400);
  assert.equal((await fetch(`${base}/image/mine`,{method:"PATCH",headers,body:JSON.stringify({hidden:true})})).status,200);
});
test("retention rules distinguish long-lived records from a proposed future media policy",()=>{
  assert.equal(MEDIA_HISTORY_POLICY.recordRetentionDays,null);assert.equal(MEDIA_HISTORY_POLICY.automaticGeneratedMediaCleanup,false);
  assert.equal(MEDIA_HISTORY_POLICY.recommendedTemporaryMediaDays,30);assert.equal(MEDIA_HISTORY_POLICY.cleanupNoticeDays,7);
});
