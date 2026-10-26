import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveDirectorDuration,resolveDirectorSubject,assertDirectorActionSubject,fitDirectorShot,projectSubject,subjectAtTime,reviewScenePlacement,retimeDirectorShot} from '../../../../shared/directorReview';
import {appendSceneActionShot} from '../../../../shared/directorMotion';
import {appendDirectorShots} from '../../../../frontend/src/utils/directorScene';
import {validateComposeRequest,composeDirector} from './composer';
import {validateDirectorRequest} from './planner';
import type {DirectorScene,DirectorShot} from '../../../../shared/directorSkills';
const actor={id:'reporter',name:'记者',type:'person',position:[0,.85,1.2],rotation:[0,0,0],scale:[1,1,1],pose:'sit'};
const lead={...actor,id:'lead',name:'人物 · 主角',position:[3,0,0]};
const scene:DirectorScene={projectId:'director3d-u1-review',activeShotId:'source',name:'采访',fps:24,durationSeconds:15,aspectRatio:'16:9',objects:[actor,lead] as any,camera:{position:[0,1.6,3.8],rotation:[0,0,0],focalLength:35},cameraKeyframes:[],lighting:{},shotNames:['原镜头']};
const cameraShot:DirectorShot={name:'推进',purpose:'采访',framing:'记者近景',movement:'缓慢推进',blocking:'不变',performance:'倾听',lighting:'现有',transition:'切',prompt:'采访',camera:{keyframes:[{t:0,position:[0,1.6,3.8],target:[0,1.4,1.2],focalLength:35},{t:1,position:[0,1.6,1.8],target:[0,1.4,1.2],focalLength:50}]}};
test('four seconds in a request reaches the native camera, actor tracks and total duration without changing the source',()=>{
 const input=validateDirectorRequest({intent:'设计一个4秒缓慢推进到记者近景',skillId:'seedance-shot-design',shotCount:1,scene});assert.equal(input.durationSeconds,4);assert.equal(input.subjectId,'reporter');
 const source={id:'source',name:'原镜头',fps:24,durationSeconds:15,loopPlayback:false,objects:scene.objects,camera:{...scene.camera,aspectRatio:scene.aspectRatio},keyframes:[],objectKeyframes:{reporter:[{frame:0,position:[0,0,0]},{frame:359,position:[2,0,0]}]},lighting:{},reference:{image:'preserve'}};
 const project={settings:{fps:24,durationSeconds:15},shots:[source],activeShotId:source.id,...source};
 const before=JSON.stringify(project),result=appendDirectorShots(project,[{...cameraShot,durationSeconds:input.durationSeconds}]);
 assert.equal(JSON.stringify(project),before);assert.equal(result.settings.durationSeconds,4);assert.equal(result.keyframes.at(-1).frame,95);assert.equal(result.objectKeyframes.reporter.at(-1).frame,95);assert.deepEqual(result.shots[0],source);
 const action=appendSceneActionShot(project,{name:'行走',summary:'向右',warnings:[],durationSeconds:4,actions:[{kind:'animate',objectId:'reporter',pose:'walk',points:[{t:0,position:[0,0,0]},{t:1,position:[2,0,0]}]}]});assert.equal(action.objectKeyframes.reporter.at(-1).frame,95);assert.equal(action.settings.durationSeconds,4);assert.deepEqual(action.shots[0],source);
});
test('timing ambiguity and compressed keyframes are rejected rather than silently ignored or deleted',()=>{
 assert.equal(resolveDirectorDuration('一个四秒镜头',undefined,15),4);assert.equal(resolveDirectorDuration('在第4秒回头',undefined,15),15);
 assert.throws(()=>resolveDirectorDuration('4秒镜头',6,15),/不一致/);assert.throws(()=>resolveDirectorDuration('前2秒停住，再3秒推进',undefined,15),/多段时间/);assert.throws(()=>resolveDirectorDuration('0.5秒',undefined,15),/整数/);assert.throws(()=>resolveDirectorDuration('61秒',undefined,15),/整数/);
 const shot={fps:24,durationSeconds:15,keyframes:[],objectKeyframes:{a:[{frame:1},{frame:2}]}};assert.throws(()=>retimeDirectorShot(shot,1),/合并已有关键帧/);assert.equal(shot.objectKeyframes.a.length,2);
});
test('a named person cannot be silently substituted and missing or duplicate names require correction before the model',()=>{
 assert.equal(resolveDirectorSubject('让记者向右走，保留主角',undefined,scene.objects),'reporter');
 assert.throws(()=>resolveDirectorSubject('让记者向右走','lead',scene.objects),/不一致/);
 assert.throws(()=>resolveDirectorSubject('让记者向右走',undefined,[lead] as any),/找不到/);
 assert.throws(()=>resolveDirectorSubject('让记者向右走',undefined,[actor,{...actor,id:'other'}] as any),/同名/);
 assert.equal(resolveDirectorSubject('搭一张桌子',undefined,[lead] as any,false),undefined);
 assert.throws(()=>assertDirectorActionSubject({name:'错人',summary:'',warnings:[],actions:[{kind:'move',objectId:'lead',position:[2,0,0]}]},'reporter',scene.objects),/指定主体以外/);
 assert.throws(()=>validateComposeRequest({task:'adjust',intent:'让记者向右走',scene:{...scene,objects:[lead]}}),/找不到/);
});
test('frame correction accounts for elevated seated actors and portrait aspect while preserving the requested duration',()=>{
 const original=JSON.stringify(cameraShot);
 for(const aspectRatio of ['16:9','9:16','4:3']){
  const reviewed=fitDirectorShot({...cameraShot,durationSeconds:4},{...scene,aspectRatio},'reporter');assert.ok(reviewed.warnings.length);assert.equal(reviewed.shot.durationSeconds,4);
  for(const p of reviewed.shot.camera!.keyframes)for(const point of projectSubject(p,actor as any,aspectRatio,reviewed.shot.framing)){assert.ok(point.depth>.1);assert.ok(point.x>.05&&point.x<.95);assert.ok(point.y>.05&&point.y<.95);}
 }
 assert.equal(JSON.stringify(cameraShot),original);
});
test('new furniture grounds and seating aligns without moving existing objects; raised sets can opt out',()=>{
 const plan:any={name:'采访',summary:'桌椅',warnings:[],actions:[
  {kind:'add',ref:'new-chair',name:'椅子',type:'chair',position:[0,-1,0],rotation:[0,0,0],scale:[1,1,1]},
  {kind:'add',ref:'new-actor',name:'受访者',type:'person',position:[0,.85,0],rotation:[0,0,0],scale:[1,1,1]},
  {kind:'pose',objectId:'new-actor',pose:'sit'},
  {kind:'add',ref:'new-table',name:'桌子',type:'table',position:[2,-.5,0],rotation:[0,0,0],scale:[1,2,1]},
 ]};
 const before=JSON.stringify(scene),reviewed=reviewScenePlacement(plan,scene,true);
 const actions=reviewed.plan.actions as any[];assert.equal(actions[0].position[1],.51);assert.equal(actions[3].position[1],.88);assert.ok(Math.abs(actions[1].position[1])<.02);assert.ok(Math.abs(actions[0].rotation[1]+Math.PI/2)<.01,'chair back faces away from the table');assert.ok(Math.abs(actions[1].rotation[1]-Math.PI/2)<.01,'seated actor faces the table');assert.equal(JSON.stringify(scene),before);assert.equal(plan.actions[0].position[1],-1);
 assert.deepEqual(reviewScenePlacement(plan,scene,false).plan.actions,plan.actions);
 const overlap=reviewScenePlacement({name:'穿插',summary:'',warnings:[],actions:[{kind:'add',ref:'new-box',name:'箱子',type:'box',position:[3,.5,0],rotation:[0,0,0],scale:[1,1,1]}]},scene,true);assert.ok(overlap.warnings.some(w=>w.includes('主角')&&w.includes('箱子')));
});
test('table seating corrects a reversed chair and person while walking routes gain collision-free waypoints',()=>{
 const plan:any={name:'桌边走位',summary:'校正',warnings:[],actions:[
  {kind:'add',ref:'new-table',name:'桌子',type:'table',position:[0,.44,0],rotation:[0,0,0],scale:[1.4,1,1.4]},
  {kind:'add',ref:'new-chair',name:'椅子',type:'chair',position:[-1.2,.51,0],rotation:[0,Math.PI/2,0],scale:[1,1,1]},
  {kind:'add',ref:'new-guest',name:'客人',type:'person',position:[-1.2,0,0],rotation:[0,0,0],scale:[1,1,1]},
  {kind:'pose',objectId:'new-guest',pose:'sit'},
  {kind:'add',ref:'new-walker',name:'行人',type:'person',position:[-2,0,0],rotation:[0,0,0],scale:[1,1,1]},
  {kind:'animate',objectId:'new-walker',points:[{t:0,position:[-2,0,0]},{t:1,position:[2,0,0]}]},
 ]};
 const reviewed=reviewScenePlacement(plan,{...scene,objects:[]},true),actions=reviewed.plan.actions as any[];
 assert.ok(Math.abs(actions[1].rotation[1]+Math.PI/2)<.01,'chair back faces away from the table');
 assert.ok(Math.abs(actions[2].rotation[1]-Math.PI/2)<.01,'seated person faces the table');
 assert.equal(actions[5].pose,'walk');assert.ok(actions[5].points.length>2);assert.ok(reviewed.warnings.some(w=>w.includes('自动绕开')&&w.includes('桌子')));
});
test('wrong actor output is rejected after exactly one request',async()=>{
 const input=validateComposeRequest({task:'adjust',intent:'让记者用4秒向右移动',scene}),config={baseUrl:'http://fixture.invalid/v1',apiKey:'fixture',model:'fixture'};
 let calls=0;const fetcher=async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({name:'错误目标',summary:'移动',warnings:[],actions:[{kind:'move',objectId:'lead',position:[1,0,0]}]})}}]}));};
 await assert.rejects(composeDirector({config,input,signal:new AbortController().signal,fetcher:fetcher as any}),/指定主体以外/);assert.equal(calls,1);
});

test('moving actors use their recorded endpoint rather than their original position for framing',()=>{
 const moving={...scene,objectPaths:{reporter:[{t:0,position:[0,0,1.2] as [number,number,number],pose:'walk',interpolation:'linear'},{t:1,position:[3,0,1.2] as [number,number,number],pose:'walk',interpolation:'linear'}]}};
 const reviewed=fitDirectorShot(cameraShot,moving,'reporter');assert.equal(reviewed.shot.camera!.keyframes[0].target[0],0);assert.equal(reviewed.shot.camera!.keyframes[1].target[0],3);
 for(const p of reviewed.shot.camera!.keyframes)for(const v of projectSubject(p,subjectAtTime(moving,actor as any,p.t),scene.aspectRatio,reviewed.shot.framing))assert.ok(v.depth>0&&v.x>0&&v.x<1&&v.y>0&&v.y<1);
});

test('framing warns about intervening scenery and hidden actors rather than claiming an unobstructed shot',()=>{
 const obstacle={id:'wall',name:'挡板',type:'box',position:[0,1.7,3],rotation:[0,0,0],scale:[3,3,.2]};
 const shot={...cameraShot,camera:{keyframes:[{t:0,position:[0,2,6],target:[0,1,1.2],focalLength:35},{t:1,position:[0,2,5],target:[0,1,1.2],focalLength:35}]}} as DirectorShot;
 const reviewed=fitDirectorShot(shot,{...scene,objects:[{...actor,visible:false},obstacle] as any},'reporter');assert.ok(reviewed.warnings.some(w=>w.includes('挡板')&&w.includes('遮挡')));assert.ok(reviewed.warnings.some(w=>w.includes('隐藏')));
});

test('the scene summary uses executable duration and actor rather than contradictory model prose',async()=>{
 const input=validateComposeRequest({task:'adjust',intent:'让记者用4秒向右移动',scene}),config={baseUrl:'http://fixture.invalid/v1',apiKey:'fixture',model:'fixture'};
 const fetcher=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({name:'行走',summary:'让主角用2秒移动',warnings:[],actions:[{kind:'animate',objectId:'reporter',pose:'walk',points:[{t:0,position:[0,0,0]},{t:1,position:[2,0,0]}]}]})}}]}));
 const result=await composeDirector({config,input,signal:new AbortController().signal,fetcher:fetcher as any});assert.match(result.plan.summary,/本镜 4 秒/);assert.match(result.plan.summary,/记者/);assert.doesNotMatch(result.plan.summary,/2秒|主角/);
});
