import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import express from "express";
import {createServer} from "node:http";
import {MediaQueue} from "../../lib/workspace/mediaQueue";
import {DurableTasks} from "../../lib/workspace/tasks";
import {createSceneVision,generateSceneLayout,validateSceneScope} from "./sceneVision";
import {validateSceneLayout} from "../../../../shared/directorSceneLayout";
import {assertNativeDirectorProject} from "../../../../shared/directorProject";
const scope={sceneId:"director3d-u1-fixture",shotId:"shot-1",revision:1,fingerprint:"a".repeat(64)};
const layout={title:"测试场景",creations:[{id:"c1",name:"墙边平台",a:{x:0,y:0},b:{x:2,y:3},height:1}],walls:[],previs:{camera:{position:[0,-5,2],target:[0,0,1],fov:45},evidence:[{name:"平台",depth:"foreground"}],uncertainties:["比例需人工核对"]}};
test('provider errors are explained without leaking credentials or URLs and never retried',async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:'do_request_failed',message:'secret sk-fixture https://private-provider.invalid/key'}}),{status:500});};
 await assert.rejects(generateSceneLayout({baseUrl:'https://fixture.invalid/v1',apiKey:'private',model:'gpt-5.5'},'fixture','',new AbortController().signal,fetcher),(error:any)=>{assert.match(error.message,/上游通道连接失败.*500/);assert.doesNotMatch(error.message,/sk-fixture|private-provider|private/);return error.upstreamCode==='do_request_failed';});assert.equal(calls,1);
});
test("vision scene geometry is bounded and strips unknown executable fields",()=>{
  const safe=validateSceneLayout({...layout,script:"fetch(privateKey)",apiKey:"private",creations:[{...layout.creations[0],url:"https://untrusted.invalid"}]});assert.doesNotMatch(JSON.stringify(safe),/private|untrusted|script/);
  assert.throws(()=>validateSceneLayout({...layout,creations:Array(101).fill(layout.creations[0])}));assert.throws(()=>validateSceneLayout({...layout,creations:[{...layout.creations[0],height:Infinity}]}));assert.throws(()=>validateSceneLayout({...layout,previs:{camera:{position:[0,0,0],target:[0,0,0],fov:45}}}));
  assert.throws(()=>validateSceneScope(scope,2));assert.throws(()=>validateSceneScope({...scope,revision:0},1));
});
test("vision makes one constrained model request and rejects incomplete or unsafe output without retry",async()=>{
  let calls=0;
  const fetcher:typeof fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.equal(body.messages[1].content[1].type,"image_url");assert.equal(body.stream,false);return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(layout)}}]}));};
  assert.equal((await generateSceneLayout({baseUrl:"https://fixture.invalid/v1",apiKey:"private",model:"vision"},"data:image/jpeg;base64,fixture","画面",new AbortController().signal,fetcher)).creations.length,1);assert.equal(calls,1);
  const truncated:typeof fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:"length",message:{content:"{}"}}]}));await assert.rejects(generateSceneLayout({baseUrl:"https://fixture.invalid",apiKey:"private",model:"vision"},"fixture","",new AbortController().signal,truncated));
});
async function fixture(t:any){
  const db=knex({client:"better-sqlite3",connection:{filename:":memory:"},useNullAsDefault:true,pool:{min:1,max:1}});t.after(()=>db.destroy());
  await db.schema.createTable("xoi_generation_tasks",table=>{table.increments("id");table.string("kind");table.string("task_id");table.integer("user_id");table.string("status");table.string("worker_id");table.bigInteger("updated_at");table.text("payload");table.unique(["kind","task_id"]);});
  const queue=new MediaQueue(db,"fixture-worker"),tasks=new DurableTasks<any>(db,"director-scene");let revision=1,calls=0,receiptCalls=0;
  const vision=createSceneVision({queue,tasks,getDocument:async user=>user===1?{revision,payload:{project:{shots:[{id:"shot-1"}]}}}:null,getModels:async()=>[{id:"newapi:vision",name:"识图模型"},{id:"newapi:url-vision",name:"待配置模型",disabled:true,unavailableReason:"公网素材尚未配置"}],getReceipt:async(user,billingId,status)=>{assert.equal(user,1);assert.equal(billingId,"12345678-1234-4123-8123-123456789012");assert.equal(status,"succeeded");receiptCalls++;return {status:"recorded",points:0.05502};},getImage:async()=>"data:image/jpeg;base64,fixture",getConfig:async()=>({baseUrl:"https://fixture.invalid/v1",apiKey:"private-key",model:"vision"}),billingId:()=>"12345678-1234-4123-8123-123456789012",signal:()=>undefined,fetcher:async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(layout)}}]}));}});
  const app=express();app.use(express.json());app.use((req:any,_res,next)=>{if(req.headers['x-test-user'])req.user={id:Number(req.headers['x-test-user'])};next();});app.use(vision.router);
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${(server.address() as any).port}`,headers={'Content-Type':'application/json','X-Test-User':'1'};
  const body={scope,model:"newapi:vision",imageUrl:"/oss/canvas-files/1/fixture.jpg",prompt:"还原空间",clientTaskId:"12345678-1234-4123-8123-123456789abc"};
  return {db,queue,tasks,vision,base,headers,body,stale:()=>revision++,calls:()=>calls,receiptCalls:()=>receiptCalls};
}
test("scene tasks commit before acknowledgement, deduplicate, isolate users and expose no credentials",async t=>{
  const f=await fixture(t);assert.equal((await fetch(`${f.base}/scene-models`)).status,401);
  const submit=()=>fetch(`${f.base}/scene-tasks`,{method:"POST",headers:f.headers,body:JSON.stringify(f.body)});
  const first:any=await (await submit()).json(),second:any=await (await submit()).json();assert.equal(first.data.id,second.data.id);assert.equal(f.calls(),0);
  const job=(await f.queue.claim(['director-scene']))!;await f.vision.execute(job);await f.queue.finish(job);assert.equal(f.calls(),1);
  const response=await fetch(`${f.base}/scene-tasks/${job.taskId}`,{headers:f.headers}),data:any=await response.json();assert.match(response.headers.get('cache-control')!,/no-store/);assert.equal(data.data.status,'succeeded');assert.equal(data.data.result.scene.creations.length,1);assert.deepEqual(data.data.receipt,{status:'recorded',points:0.05502});assert.equal(f.receiptCalls(),1);assert.doesNotMatch(JSON.stringify(data),/private-key|billingId/);
  assert.equal((await fetch(`${f.base}/scene-tasks/${job.taskId}`,{headers:{'X-Test-User':'2'}})).status,404);assert.equal(f.receiptCalls(),1);
});
test("a scene revision change before execution prevents any provider request",async t=>{
  const f=await fixture(t);await fetch(`${f.base}/scene-tasks`,{method:'POST',headers:f.headers,body:JSON.stringify(f.body)});f.stale();const job=(await f.queue.claim(['director-scene']))!;await assert.rejects(f.vision.execute(job),/已改变/);assert.equal(f.calls(),0);
});
test("foreign scope, foreign image and non-vision model are refused without model calls",async t=>{
  const f=await fixture(t);
  for(const patch of [{scope:{...scope,sceneId:'director3d-u2-foreign'}},{imageUrl:'/oss/canvas-files/2/foreign.jpg'},{model:'newapi:text-only'},{model:'newapi:url-vision'}])assert.ok((await fetch(`${f.base}/scene-tasks`,{method:'POST',headers:f.headers,body:JSON.stringify({...f.body,...patch})})).status>=400);
  assert.equal(f.calls(),0);assert.equal((await f.db('xoi_generation_tasks')).length,0);
});
test("project validation preserves independent camera and actor routes, rejects invalid coordinates and route duration",()=>{
  const camera={position:[0,2,6],rotation:[0,0,0],focalLength:35,aspectRatio:'16:9',route:{version:1,id:'camera-a',enabled:true,points:[[0,2,6],[3,3,4]],startFrame:0,endFrame:120,orientation:'target',targetId:'actor',rotation:[0,0,0]}};
  const routeTracks={actor:{id:'actor',points:[[0,0,0],[2,0,0]],startFrame:0,endFrame:120}};
  const shot={id:'shot-1',fps:24,durationSeconds:5,objects:[],camera,keyframes:[],objectKeyframes:{},routeTracks};const project={shots:[shot],activeShotId:'shot-1',objects:[],camera,keyframes:[],objectKeyframes:{},routeTracks};assert.doesNotThrow(()=>assertNativeDirectorProject(project));
  assert.throws(()=>assertNativeDirectorProject({...project,camera:{...camera,route:{...camera.route,points:[[NaN,0,0],[2,0,0]]}}}));assert.throws(()=>assertNativeDirectorProject({...project,shots:[{...shot,camera:{...camera,route:{...camera.route,endFrame:121}}}]}));
});
