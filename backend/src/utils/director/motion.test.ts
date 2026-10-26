import {BUDGET_OUTPUT_TOKENS} from "../billingBudgetPolicy";
import assert from "node:assert/strict";
import {test} from "node:test";
import { MOTION_PRESETS, createMotionPath, appendMotionShot, appendSceneActionShot, validateSceneActionPlan, editMotionEndpoint } from "../../../../shared/directorMotion";
import { composeDirector, validateComposeRequest } from "./composer";
import { sceneFromNative, sceneFingerprint } from "../../../../frontend/src/utils/directorScene";
import { validateTimelineClear } from "../../../../frontend/src/utils/directorTimeline";

const actor={id:"actor-1",name:"主角",type:"person",position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],pose:"idle",poseTime:0,joints:{},rigRoot:[0,0,0]};
const camera={position:[0,2,6],rotation:[0,0,0],focalLength:35,aspectRatio:"16:9"};
const objectKeyframes={"actor-1":[{frame:0,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],pose:"walk",interpolation:"linear",continuousMotion:true},{frame:119,position:[2,0,0],rotation:[0,0,0],scale:[1,1,1],pose:"walk",interpolation:"linear",continuousMotion:true}]};
const shot={id:"shot-01",name:"原镜头",fps:24,durationSeconds:5,loopPlayback:false,objects:[actor],camera,lighting:{ambientIntensity:1},reference:{image:"private-image"},keyframes:[],objectKeyframes};
const project={version:16,settings:{fps:24,durationSeconds:5},activeShotId:shot.id,shots:[shot],...shot};
// 顶层镜头 id/name 对原生结构无影响；activeShotId 是原生镜头选择来源。
test("six relative presets, all styles and frame rates keep source and actor routes",()=>{
  const before=JSON.stringify(project);
  for(const p of MOTION_PRESETS)for(const style of ["calm","suspense","bright"] as const)for(const fps of [24,25,30]) {
    const source=structuredClone(project);source.settings.fps=fps;source.shots[0].fps=fps;source.objectKeyframes["actor-1"][1].frame=fps*5-1;
    const points=createMotionPath(source,{presetId:p.id,targetId:actor.id,duration:1,distance:5,amount:1,direction:1,style,follow:false});
    assert.equal(points[0].t,0);assert.equal(points.at(-1)!.t,1);
    const result=appendMotionShot(source,points,1,p.name);
    assert.equal(result.shots.length,2);assert.deepEqual(result.shots[0],source.shots[0]);assert.equal(result.keyframes.at(-1).frame,fps-1);
    assert.equal(new Set(result.keyframes.map((k:any)=>k.frame)).size,result.keyframes.length);
    assert.ok(result.keyframes.every((k:any)=>k.interpolation==="linear"&&[...k.position,...k.rotation,k.focalLength].every(Number.isFinite)));
    assert.equal(result.objectKeyframes[actor.id].at(-1).frame,fps-1);
    assert.deepEqual(result.reference,source.reference);assert.deepEqual(result.objects,source.objects);
  }
  assert.equal(JSON.stringify(project),before);
});
test("following and endpoint edits retain target tracking and continuous geometry",()=>{
  const points=createMotionPath(project,{presetId:"follow",targetId:actor.id,duration:5,distance:5,amount:1,direction:1,style:"calm",follow:true});
  assert.equal(points.at(-1)!.target[0]-points[0].target[0],2);
  assert.equal(points.at(-1)!.position[0]-points[0].position[0],2);
  const changed=editMotionEndpoint(points,1,[8,3,6]);assert.deepEqual(changed[0],points[0]);assert.deepEqual(changed.at(-1)!.position,[8,3,6]);assert.deepEqual(changed.at(-1)!.target,points.at(-1)!.target);
  assert.throws(()=>createMotionPath(project,{presetId:"push",targetId:"missing",duration:5,distance:5,amount:1,direction:1,style:"calm",follow:false}));
});
test("playback camera evaluation is reversible while manual camera edits invalidate drafts",async()=>{
  const points=createMotionPath(project,{presetId:"orbit",targetId:actor.id,duration:5,distance:5,amount:1,direction:1,style:"calm",follow:false});
  const original=appendMotionShot(project,points,5,"环绕"),during=structuredClone(original),point=during.keyframes[15];
  during.camera={...point,aspectRatio:"16:9"};during.shots.at(-1).camera=structuredClone(during.camera);
  assert.equal(await sceneFingerprint(JSON.stringify(original)),await sceneFingerprint(JSON.stringify(during),point.frame));
  during.camera.position[0]+=.3;during.shots.at(-1).camera=structuredClone(during.camera);
  assert.notEqual(await sceneFingerprint(JSON.stringify(original)),await sceneFingerprint(JSON.stringify(during),point.frame));
});
const proposal={name:"对峙场景",summary:"添加配角、桌子，并安排主角走向桌边。",warnings:[],actions:[
  {kind:"add",ref:"new-partner",name:"配角",type:"person",position:[2,0,0],rotation:[0,Math.PI,0],scale:[1,1,1]},
  {kind:"pose",objectId:"new-partner",pose:"sit"},
  {kind:"add",ref:"new-table",name:"桌子",type:"table",position:[1,.5,0],rotation:[0,0,0],scale:[1.7,1,1.1]},
  {kind:"animate",objectId:"actor-1",pose:"walk",points:[{t:0,position:[0,0,0]},{t:1,position:[1,0,0]}]},
  {kind:"camera",position:[0,2,6],target:[1,1,0],focalLength:35},
]};
test("clear undo validation accepts one track only and rejects unrelated scene changes",()=>{
  const before=structuredClone(project) as Record<string,any>;
  before.objectKeyframes["other-person"]=structuredClone(before.objectKeyframes[actor.id]);
  before.shots[0].objectKeyframes=structuredClone(before.objectKeyframes);
  const after=structuredClone(before);delete after.objectKeyframes[actor.id];delete after.shots[0].objectKeyframes[actor.id];
  assert.deepEqual(validateTimelineClear(JSON.stringify(before),JSON.stringify(after),"object"),before);
  const extra=structuredClone(after);extra.objects[0].position[0]=10;
  assert.throws(()=>validateTimelineClear(JSON.stringify(before),JSON.stringify(extra),"object"),/工程已变化/);
  delete after.objectKeyframes["other-person"];delete after.shots[0].objectKeyframes["other-person"];
  assert.throws(()=>validateTimelineClear(JSON.stringify(before),JSON.stringify(after),"object"),/范围不符/);
});
test("AI actions produce an additive version with native pose phase and original reference preserved",()=>{
  const plan=validateSceneActionPlan(proposal,project.objects),before=JSON.stringify(project);
  const result=appendSceneActionShot(project,plan);
  assert.equal(JSON.stringify(project),before);assert.deepEqual(result.shots[0],shot);assert.equal(result.objects.length,3);
  assert.equal(result.objects.find((o:any)=>o.name==="配角").poseTime,1,"native seated animation phase");
  assert.equal(result.objectKeyframes[actor.id].at(-1).frame,119);assert.ok(result.objectKeyframes[actor.id].every((k:any)=>k.pose==="walk"&&k.continuousMotion));
  assert.deepEqual(result.reference,project.reference);assert.deepEqual(result.camera.aspectRatio,"16:9");
  const moved=appendSceneActionShot(project,validateSceneActionPlan({name:"摆位",summary:"平移",warnings:[],actions:[{kind:"move",objectId:actor.id,position:[3,0,0]}]},project.objects));
  assert.deepEqual(moved.objectKeyframes[actor.id].map((k:any)=>k.position[0]),[3,5]);
});
test("reject unsupported actions, lock edits, nonfinite coordinates and nonexistent references",()=>{
  for(const action of [{kind:"delete",objectId:actor.id},{kind:"add",ref:"new-model",name:"坏模型",type:"model",url:"secret",position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},{kind:"move",objectId:"missing",position:[0,0,0]},{kind:"move",objectId:actor.id,position:[Infinity,0,0]}])assert.throws(()=>validateSceneActionPlan({...proposal,actions:[action]},project.objects));
  assert.throws(()=>validateSceneActionPlan({...proposal,actions:[{kind:"move",objectId:actor.id,position:[1,0,0]}]},[{...actor,locked:true}]));
  assert.throws(()=>validateComposeRequest({task:"delete",intent:"删除",scene:{}}));
});
test("composer returns validated plans without execution tools or private scene resources",async()=>{
  const scene=sceneFromNative(project,"director3d-u1-test","验证场景"),input=validateComposeRequest({task:"build",intent:"在桌边对峙",scene,history:[{role:"user",content:"保留主角"}]}),config={baseUrl:"http://fixture.invalid/v1",apiKey:"fixture",model:"fixture"};
  let sent:any,outcome:any={finish_reason:"stop",message:{content:JSON.stringify(proposal)}};
  const fetcher=(async (_:any,init:any)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({choices:[outcome]}));}) as typeof fetch;
  const result=await composeDirector({config,input,signal:new AbortController().signal,fetcher});assert.equal(result.plan.actions.length,5);assert.equal(result.projectId,scene.projectId);assert.equal(sent.tools,undefined);assert.equal(sent.max_tokens,BUDGET_OUTPUT_TOKENS);assert.doesNotMatch(JSON.stringify(sent),/private-image/);
  outcome={finish_reason:"stop",message:{content:JSON.stringify(proposal),tool_calls:[{}]}};await assert.rejects(composeDirector({config,input,signal:new AbortController().signal,fetcher}),/未完整完成/);
  outcome={finish_reason:"stop",message:{content:'{"actions":[{"kind":"delete"}]}'}};await assert.rejects(composeDirector({config,input,signal:new AbortController().signal,fetcher}),/无效/);
});

test('scene adjustment leaves camera design to its own workflow, without silently changing camera',async()=>{
 const scene=sceneFromNative(project,'director3d-u1-test','验证场景'),input=validateComposeRequest({task:'adjust',intent:'让主角向右走2米',scene}),config={baseUrl:'http://fixture.invalid/v1',apiKey:'fixture',model:'fixture'};
 let calls=0,actions:any[]=[{kind:'move',objectId:actor.id,position:[2,0,0]},{kind:'camera',position:[0,2,4],target:[2,1,0],focalLength:35}];
 const fetcher=(async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({name:'调整',summary:'调整',warnings:[],actions})}}]}));}) as typeof fetch;
 const result=await composeDirector({config,input,signal:new AbortController().signal,fetcher});assert.equal(calls,1);assert.deepEqual(result.plan.actions.map(a=>a.kind),['move']);assert.match(result.plan.warnings.join(' '),/保留当前机位/);
 actions=actions.filter(a=>a.kind==='camera');await assert.rejects(composeDirector({config,input,signal:new AbortController().signal,fetcher}),/切换“设计镜头”/);assert.equal(calls,2);
});


test('follow refuses stationary / pose-only subjects; demo creates one additive shot with actor and camera travel',async()=>{
 const {hasObjectTravel,createFollowDemo}=await import('../../../../shared/directorMotion');
 const stationary=structuredClone(project);stationary.objectKeyframes[actor.id as keyof typeof stationary.objectKeyframes].forEach((k:any)=>k.position=[0,0,0]);stationary.shots[0].objectKeyframes=structuredClone(stationary.objectKeyframes);
 assert.equal(hasObjectTravel(stationary,actor.id),false);
 assert.throws(()=>createMotionPath(stationary,{presetId:'follow',targetId:actor.id,duration:5,distance:5,amount:1,direction:1,style:'calm',follow:true}),/移动路线/);
 const before=JSON.stringify(stationary),demo=createFollowDemo(stationary,actor.id,5);
 assert.equal(JSON.stringify(stationary),before);assert.equal(demo.shots.length,2);assert.deepEqual(demo.shots[0],stationary.shots[0]);assert.ok(hasObjectTravel(demo,actor.id));
 const route=demo.objectKeyframes[actor.id];assert.equal(Math.hypot(...route.at(-1).position.map((v:number,i:number)=>v-route[0].position[i])),2);
 assert.ok(Math.hypot(...demo.keyframes.at(-1).position.map((v:number,i:number)=>v-demo.keyframes[0].position[i]))>1.9);assert.equal(demo.keyframes.at(-1).frame,119);
});
