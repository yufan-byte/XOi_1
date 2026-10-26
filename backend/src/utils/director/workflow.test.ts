import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {applyActorTravel,applyMotionToCurrent,createMotionPath,createFollowDemo,replaceCurrentShot,hasObjectTravel,repairLegacyWalkingEndRotations} from '../../../../shared/directorMotion';
const source=JSON.parse(readFileSync(resolve(__dirname,'../../../../docs/验证/2026-10-17导演助理恢复与场景预设/桌边对谈.monoform.json'),'utf8'));
const people=source.objects.filter((o:any)=>o.type==='person');
const options={presetId:'push' as const,duration:5,distance:5,amount:1,direction:1 as const,style:'calm' as const,follow:false};
test('switching the subject changes the camera framing and updates only the active shot',()=>{
 const before=JSON.stringify(source),a=people[0].id,b=people[1].id;
 const first=applyMotionToCurrent(source,createMotionPath(source,{...options,targetId:a}),5,'推进');
 const second=applyMotionToCurrent(first,createMotionPath(first,{...options,targetId:b}),5,'推进');
 assert.notDeepEqual(first.keyframes[0].rotation,second.keyframes[0].rotation);
 assert.equal(second.activeShotId,source.activeShotId);assert.equal(second.shots.length,source.shots.length);
 assert.deepEqual(second.objects,source.objects);assert.deepEqual(second.objectKeyframes,source.objectKeyframes);
 assert.equal(JSON.stringify(source),before);
});
test('blocking moves only the selected actor and preserves the camera and other actors',()=>{
 const changed=applyActorTravel(source,people[1].id,5,3,'right');
 assert.equal(changed.activeShotId,source.activeShotId);assert.equal(changed.shots.length,source.shots.length);
 assert.equal(hasObjectTravel(changed,people[1].id),true);assert.equal(hasObjectTravel(changed,people[0].id),false);
 assert.deepEqual(changed.camera,source.camera);assert.deepEqual(changed.keyframes,source.keyframes);
 assert.deepEqual(changed.objects.find((o:any)=>o.id===people[0].id),people[0]);
 const keys=changed.objectKeyframes[people[1].id];assert.ok(Math.abs(keys[0].rotation[1]-Math.atan2(keys.at(-1).position[0]-keys[0].position[0],keys.at(-1).position[2]-keys[0].position[2]))<1e-8);assert.ok(Math.abs(Math.hypot(...keys.at(-1).position.map((v:number,i:number)=>v-keys[0].position[i]))-3)<1e-8);
});
test('walking gets full-body motion, turns along detours and never crosses the table',()=>{
 const scene=structuredClone(source),actor=scene.objects.find((o:any)=>o.id===people[0].id),table=scene.objects.find((o:any)=>o.type==='table');
 actor.position=[-2,0,0];actor.pose='idle';table.position=[0,.44,0];table.rotation=[0,0,0];table.scale=[1.4,1,1.4];
 const next=applyBlockingToCurrent(scene,{name:'绕桌行走',summary:'自动避障',warnings:[],durationSeconds:5,actions:[{kind:'animate',objectId:actor.id,points:[{t:0,position:[-2,0,0]},{t:1,position:[2,0,0]}]}]},actor.id);
 const keys=next.objectKeyframes[actor.id];assert.ok(keys.length>2,'a detour waypoint should be inserted');assert.ok(keys.every((key:any)=>key.pose==='walk'&&key.continuousMotion),'walking uses the native full-body clip');
 assert.ok(new Set(keys.map((key:any)=>key.rotation[1].toFixed(4))).size>1,'the actor turns along the detour');
 const corrected=applyBlockingToCurrent(scene,{name:'修正终点',summary:'终点在桌子里',warnings:[],actions:[{kind:'animate',objectId:actor.id,points:[{t:0,position:[-2,0,0]},{t:1,position:[0,0,0]}]}]},actor.id);
 const end=corrected.objectKeyframes[actor.id].at(-1).position;assert.ok(Math.abs(end[0])>.7||Math.abs(end[2])>.7,'an endpoint inside furniture is pushed to its safe edge');
});
test('a lone actor walks a straight line and does not turn backwards on the final keyframe',()=>{
 const solo=structuredClone(source),person=solo.objects.find((object:any)=>object.type==='person');
 solo.objects=[person];solo.shots[0].objects=structuredClone(solo.objects);solo.objectKeyframes={};solo.shots[0].objectKeyframes={};
 const next=applyActorTravel(solo,person.id,5,2,'right'),keys=next.objectKeyframes[person.id];
 assert.equal(keys.length,2,'an empty scene must not invent detour points');
 assert.deepEqual(keys[0].position,[person.position[0],Math.max(0,person.position[1]),person.position[2]]);
 assert.equal(Math.hypot(...keys[1].position.map((value:number,index:number)=>value-keys[0].position[index])),2);
 assert.ok(Math.abs(keys[0].rotation[1]-keys[1].rotation[1])<1e-8,'arrival keeps facing the direction of travel');
 assert.ok(keys.every((key:any)=>key.pose==='walk'&&key.continuousMotion));
 const legacy=structuredClone(next),legacyKeys=legacy.objectKeyframes[person.id];legacyKeys[1].rotation[1]+=Math.PI;
 const legacyShot=legacy.shots.find((shot:any)=>shot.id===legacy.activeShotId);legacyShot.objectKeyframes[person.id][1].rotation[1]+=Math.PI;
 assert.equal(repairLegacyWalkingEndRotations(legacy),true,'existing affected scenes are repaired on load');
 assert.ok(Math.abs(legacy.objectKeyframes[person.id][0].rotation[1]-legacy.objectKeyframes[person.id][1].rotation[1])<1e-8);
});
test('stationary follow creates actor travel and camera travel in the same current shot',()=>{
 const next=replaceCurrentShot(source,createFollowDemo({...source,shots:[source.shots.find((s:any)=>s.id===source.activeShotId)]},people[0].id,5,{distance:8,direction:-1,style:'bright'},'away'));
 assert.equal(next.activeShotId,source.activeShotId);assert.equal(next.shots.length,source.shots.length);
 assert.ok(hasObjectTravel(next,people[0].id));assert.notDeepEqual(next.keyframes[0].position,next.keyframes.at(-1).position);
 const actor=next.objectKeyframes[people[0].id][0].position;
 assert.ok(Math.hypot(next.keyframes[0].position[0]-actor[0],next.keyframes[0].position[2]-actor[2])>=7.99);
});
test('locked actors and invalid travel do not change the scene',()=>{
 const locked=structuredClone(source);locked.objects.find((o:any)=>o.id===people[0].id).locked=true;
 assert.throws(()=>applyActorTravel(locked,people[0].id,5,2,'right'),/锁定/);
 assert.throws(()=>applyActorTravel(source,people[0].id,5,NaN,'right'),/无效/);
});

import {validateBlockingPlan,applyBlockingToCurrent} from '../../../../shared/directorMotion';
import {projectSubject,directorSubjectAnchor} from '../../../../shared/directorReview';
test('subject framing prioritizes the selected actor while scene framing stays wider',()=>{
 const points=createMotionPath(source,{...options,targetId:people[0].id,distance:2.2,framing:'subject'}),wide=createMotionPath(source,{...options,targetId:people[0].id,distance:5,framing:'scene'});
 const anchor=directorSubjectAnchor(people[0]);assert.ok(Math.abs(points[0].target[0]-anchor[0])<1e-9);assert.ok(Math.abs(points[0].target[2]-anchor[2])<1e-9);assert.ok(Math.hypot(anchor[0]-people[0].position[0],anchor[2]-people[0].position[2])>.64);
 const selected=projectSubject(points[0],people[0],'16:9'),other=projectSubject(points[0],people[1],'16:9');
 assert.ok(Math.abs((Math.min(...selected.map(p=>p.x))+Math.max(...selected.map(p=>p.x)))/2-.5)<.1);
 const otherCenter=(Math.max(...other.map(p=>p.x))+Math.min(...other.map(p=>p.x)))/2;assert.ok(otherCenter>1||otherCenter<0);
 assert.equal(points[0].focalLength,65);assert.ok(Math.hypot(...points[0].position.map((v,i)=>v-points[0].target[i]))<Math.hypot(...wide[0].position.map((v,i)=>v-wide[0].target[i])));
});
test('shot-size controls keep a comfortable distance and use their requested focal length',()=>{
 const close=createMotionPath(source,{...options,targetId:people[0].id,distance:3.5,framing:'subject',focalLength:65});
 const medium=createMotionPath(source,{...options,targetId:people[0].id,distance:5.5,framing:'subject',focalLength:50});
 const wide=createMotionPath(source,{...options,targetId:people[0].id,distance:8,framing:'scene',focalLength:35});
 const horizontal=(point:any)=>Math.hypot(point.position[0]-point.target[0],point.position[2]-point.target[2]);
 assert.equal(close[0].focalLength,65);assert.equal(medium[0].focalLength,50);assert.equal(wide[0].focalLength,35);
 assert.ok(horizontal(close[0])>=3.49);assert.ok(horizontal(medium[0])>=5.49);assert.ok(horizontal(wide[0])>=7.99);
 assert.ok(horizontal(close[0])<horizontal(medium[0]));assert.ok(horizontal(medium[0])<horizontal(wide[0]));
});
test('AI blocking accepts actor routes and rejects camera, scenery and other actors',()=>{
 const id=people[0].id,plan={name:'转弯走位',summary:'只移动人物',warnings:[],durationSeconds:5,actions:[{kind:'animate',objectId:id,pose:'walk',points:[{t:0,position:[-1,0,0]},{t:.5,position:[0,0,0]},{t:1,position:[0,0,-2]}]}]};
 const next=applyBlockingToCurrent(source,plan as any,id);assert.deepEqual(next.keyframes,source.keyframes);assert.equal(next.shots.length,source.shots.length);
 assert.notEqual(next.objectKeyframes[id][0].rotation[1],next.objectKeyframes[id].at(-1).rotation[1]);
 for(const action of [{kind:'camera',position:[0,2,5],target:[0,1,0],focalLength:35},{kind:'move',objectId:source.objects.find((o:any)=>o.type==='table').id,position:[0,0,0]},{...plan.actions[0],objectId:people[1].id}])assert.throws(()=>validateBlockingPlan({...plan,actions:[action]},source.objects,id));
});
