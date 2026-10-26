import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DIRECTOR_SCENE_PRESETS,appendScenePreset,appendFreshSceneActionShot,applyCurrentScenePreset,applyCurrentSceneActions} from '../../../../shared/directorScenePresets';
import {reviewDirectorReceipt} from '../../../../frontend/src/utils/directorBillingState';
import {sceneFromNative} from '../../../../frontend/src/utils/directorScene';
import {projectSubject} from '../../../../shared/directorReview';
import {cameraRotation} from '../../../../shared/directorMotion';
import {directorCanvasGraph} from '../../../../shared/directorCanvas';
function project(fps=24,aspectRatio='16:9'){
 const source={id:'original',name:'用户原镜头',objects:[{id:'old',name:'旧布景',type:'box',position:[10,0,0],rotation:[0,0,0],scale:[1,1,1]}],camera:{position:[0,2,6],rotation:[0,0,0],focalLength:35,aspectRatio},lighting:{ambientIntensity:1},reference:{image:'private-original'},objectKeyframes:{old:[{frame:0,position:[10,0,0]},{frame:fps*15-1,position:[11,0,0]}]},keyframes:[],fps,durationSeconds:15,loopPlayback:false};
 return {version:16,settings:{fps,durationSeconds:15},shots:[source],activeShotId:source.id,...structuredClone(source)};
}
test('templates preserve all source content, create only named objects, and frame people in landscape and portrait',()=>{
 for(const fps of [24,25,30])for(const aspect of ['16:9','9:16','4:3','3:4'])for(const preset of DIRECTOR_SCENE_PRESETS){
  const original=project(fps,aspect),before=JSON.stringify(original),next=appendScenePreset(original,preset.id);
  assert.equal(JSON.stringify(original),before);assert.deepEqual(next.shots[0],original.shots[0]);assert.equal(next.shots.length,2);
  assert.equal(next.settings.durationSeconds,preset.duration);assert.equal(next.camera.aspectRatio,aspect);assert.deepEqual(next.reference,{});
  assert.equal(next.objects.filter((o:any)=>o.type==='person').length,preset.actors);
  assert.equal(next.objects.length,preset.id==='table'?5:preset.actors);assert.ok(next.objects.every((o:any)=>o.id!=='old'));
  const scene=sceneFromNative(next,'director3d-u1-presets','预设');
  for(const actor of scene.objects.filter(o=>o.type==='person')){
   const x=preset.id==='walk'?-1:0,position=[x,1.3,next.camera.position[2]] as [number,number,number],target=[x,.95,0] as [number,number,number];
   assert.deepEqual(next.camera.rotation,cameraRotation(position,target));
   const points=projectSubject({position,target,focalLength:35},actor,aspect);
   assert.ok(points.every(p=>p.depth>0&&p.x>0&&p.x<1&&p.y>0&&p.y<1),preset.id+' '+aspect+' actor must remain in frame');
  }
  if(preset.id==='walk'){
   const keys=Object.values(next.objectKeyframes)[0] as any[];
   assert.equal(keys.at(-1).frame,fps*4-1);assert.equal(keys.at(-1).position[0]-keys[0].position[0],2);
   assert.equal(next.keyframes.at(-1).position[0]-next.keyframes[0].position[0],2);
   assert.ok(keys.every(k=>k.pose==='walk'&&k.continuousMotion));
  }else{assert.deepEqual(next.objectKeyframes,{});assert.deepEqual(next.keyframes,[]);}
 }
});
test('fresh AI build cannot reference original objects or inherit old animation; shot cap holds',()=>{
 const input=project(),before=JSON.stringify(input);
 const plan={name:'仅一人',summary:'空场搭建',warnings:[],actions:[{kind:'add',ref:'new-a',name:'主角',type:'person',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}]} as any;
 const next=appendFreshSceneActionShot(input,plan);assert.equal(next.objects.length,1);assert.deepEqual(next.shots[0],input.shots[0]);assert.deepEqual(next.objectKeyframes,{});assert.equal(JSON.stringify(input),before);
 assert.throws(()=>appendFreshSceneActionShot(input,{...plan,actions:[{kind:'move',objectId:'old',position:[0,0,0]}]}));
 input.shots=Array.from({length:30},()=>input.shots[0]);assert.throws(()=>appendScenePreset(input,'solo'),/30/);
});
test('pending settlement and permission to start a separate attempt are independent, without inventing zero charges',()=>{
 const bill={id:'receipt-id',state:'pending',needsReview:true} as const;
 const stopped=reviewDirectorReceipt(bill,{status:'pending',points:0,budget:{state:'stopped',calls:1}});
 assert.equal(stopped.state,'pending');assert.equal(stopped.points,undefined);assert.equal(stopped.needsReview,false);
 for(const budget of [undefined,{state:'active'},{state:'other'}])assert.equal(reviewDirectorReceipt(bill,{status:'pending',budget}).needsReview,true);
 assert.equal(reviewDirectorReceipt(bill,{status:'recorded',points:.6}).points,.6);
 assert.equal(reviewDirectorReceipt(bill,{status:'recorded',points:NaN}).state,'pending');
 assert.deepEqual(reviewDirectorReceipt(bill,{status:'not_submitted'}),{id:bill.id,state:'not_submitted',points:0,needsReview:false});
});
test('scene edits do not add shots, keep active identity and other shots, even at the shot limit',()=>{
 const input=project();input.shots=Array.from({length:30},(_,i)=>({...structuredClone(input.shots[0]),id:i?'other-'+i:'original'}));
 const before=JSON.stringify(input),next=applyCurrentScenePreset(input,'solo');
 assert.equal(next.shots.length,30);assert.equal(next.activeShotId,input.activeShotId);assert.equal(next.objects.length,1);
 assert.deepEqual(next.shots.slice(1),input.shots.slice(1));assert.equal(JSON.stringify(input),before);
 const adjusted=applyCurrentSceneActions(next,{name:'向右一步',summary:'移动',warnings:[],actions:[{kind:'move',objectId:next.objects[0].id,position:[1,0,0]}]},false);
 assert.equal(adjusted.shots.length,30);assert.equal(adjusted.objects[0].position[0],1);assert.deepEqual(adjusted.shots.slice(1),input.shots.slice(1));
});
test('canvas handoff has readable controls, exact per-shot time, one prompt source and optional reference; never submits generation',()=>{
 const scene=sceneFromNative(project(),'director3d-u1-presets','预设');
 const plan={shots:[{name:'推进',durationSeconds:4,prompt:'镜头一'},{name:'拉远',durationSeconds:7,prompt:'镜头二'}]} as any;
 const graph=directorCanvasGraph(plan,scene,'验证',{url:'data:image/png;base64,fixture',width:640,height:360});
 const configs=graph.nodes.filter(n=>n.type==='videoConfig'),texts=graph.nodes.filter(n=>n.type==='text'),image=graph.nodes.find(n=>n.type==='image')!;
 assert.deepEqual(configs.map(n=>n.data.duration),[4,7]);assert.ok(configs.every(n=>n.w>=560&&n.h>=360&&n.data.prompt===undefined&&n.data.ratio==='16:9'));
 assert.equal(graph.edges.length,4);assert.equal(graph.nodes.length,6);assert.equal(graph.source,'director3d');assert.equal('prompt'in graph,false);
 for(const config of configs){const inputs=graph.edges.filter(e=>e.t===config.id);assert.equal(inputs.length,2);assert.ok(inputs.some(e=>e.s===image.id));assert.ok(inputs.some(e=>texts.some(n=>n.id===e.s)));}
 assert.ok(graph.focusNodeIds.includes(configs[0].id));assert.ok(!graph.focusNodeIds.includes(configs[1].id));
 const plain=directorCanvasGraph(plan,scene,'验证');assert.equal(plain.nodes.filter(n=>n.type==='image').length,0);assert.equal(plain.edges.length,2);
});
