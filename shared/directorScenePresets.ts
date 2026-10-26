import {activateShot,appendSceneActionShot,cameraRotation,type SceneAction,type SceneActionPlan} from './directorMotion';
import {DirectorInputError,type Vec3} from './directorSkills';
import {directorSeatTransform} from './directorReview';

export const DIRECTOR_SCENE_PRESETS = [
  {id:'solo',name:'单人空场',description:'只有一个人，固定全景；从干净场景开始。',duration:5,actors:1},
  {id:'dialogue',name:'双人对话',description:'两人面对面站立，固定双人全景。',duration:5,actors:2},
  {id:'table',name:'桌边对谈',description:'两人对坐、一桌两椅，固定双人机位。',duration:5,actors:2},
  {id:'walk',name:'走位跟拍',description:'人物用 4 秒向右走 2 米，相机同步横移。',duration:4,actors:1},
] as const;
export type ScenePresetId=typeof DIRECTOR_SCENE_PRESETS[number]['id'];

/** Scene application edits the active scene snapshot, not the shot list.
 * Version backup and undo are persisted by the editor before importing this result. */
export function applySceneToCurrent(project:Record<string,any>,prepared:Record<string,any>){
 const original=project.shots?.find((s:any)=>s.id===project.activeShotId);
 const proposal=prepared.shots?.find((s:any)=>s.id===prepared.activeShotId);
 if(!original||!proposal)throw new DirectorInputError('当前场景已不存在');
 const next=structuredClone(prepared),shot={...structuredClone(proposal),id:original.id,name:original.name};
 next.shots=project.shots.map((s:any)=>structuredClone(s.id===original.id?shot:s));
 return activateShot(next,next.shots.find((s:any)=>s.id===original.id));
}
function currentSceneCopy(project:Record<string,any>){
 const source=project.shots?.find((s:any)=>s.id===project.activeShotId);
 if(!source)throw new DirectorInputError('当前场景已不存在');
 return {...project,shots:[source]};
}
export function applyCurrentScenePreset(project:Record<string,any>,id:ScenePresetId){
 return applySceneToCurrent(project,appendScenePreset(currentSceneCopy(project),id));
}
export function applyCurrentSceneActions(project:Record<string,any>,plan:SceneActionPlan,fresh:boolean){
 return applySceneToCurrent(project,(fresh?appendFreshSceneActionShot:appendSceneActionShot)(currentSceneCopy(project),plan));
}

export function appendFreshSceneActionShot(project:Record<string,any>,plan:SceneActionPlan){
 const next=structuredClone(project),source=next.shots?.find((s:any)=>s.id===next.activeShotId);
 if(!source)throw new DirectorInputError('原镜头已不存在');
 const clean=structuredClone(source);
 clean.objects=[];clean.keyframes=[];clean.objectKeyframes={};clean.reference={};clean.thumbnail='';
 next.shots[next.shots.indexOf(source)]=clean;activateShot(next,clean);
 const result=appendSceneActionShot(next,plan);
 result.shots[result.shots.findIndex((s:any)=>s.id===source.id)]=structuredClone(source);
 return result;
}

/** Templates create a clean NEW shot. No model, no inherited props, routes or reference image.
 * Source shots remain intact; the caller uses the normal fingerprint/undo transaction. */
export function appendScenePreset(project:Record<string,any>,id:ScenePresetId){
 const preset=DIRECTOR_SCENE_PRESETS.find(p=>p.id===id);
 if(!preset)throw new DirectorInputError('请选择有效场景预设');
 if(!Array.isArray(project.shots)||project.shots.length>=30)throw new DirectorInputError('镜头已达 30 个，请先整理镜头');
 const source=project.shots.find((s:any)=>s.id===project.activeShotId);
 if(!source)throw new DirectorInputError('原镜头已不存在');
 const add=(ref:string,name:string,type:'person'|'table'|'chair',position:Vec3,yaw=0):SceneAction=>({kind:'add',ref,name,type,position,rotation:[0,yaw,0],scale:[1,1,1]});
 const actions:SceneAction[]=[];
 if(id==='solo'||id==='walk'){
  actions.push(add('new-lead','主角','person',id==='walk'?[-1,0,0]:[0,0,0],id==='walk'?Math.PI/2:0));
  if(id==='walk')actions.push({kind:'animate',objectId:'new-lead',pose:'walk',points:[{t:0,position:[-1,0,0]},{t:1,position:[1,0,0]}]});
  else actions.push({kind:'pose',objectId:'new-lead',pose:'stand_relaxed'});
 }else if(id==='dialogue'){
  actions.push(add('new-a','人物 A','person',[-.9,0,0],Math.PI/2),add('new-b','人物 B','person',[.9,0,0],-Math.PI/2));
  for(const objectId of ['new-a','new-b'])actions.push({kind:'pose',objectId,pose:'stand_relaxed'});
 }else{
  actions.push(add('new-table','桌子','table',[0,.44,0]));
  // Native seat height: chair center + .085 - seated hip offset .60.
  actions.push(add('new-chair-a','左椅','chair',[-1,.51,0],-Math.PI/2),add('new-chair-b','右椅','chair',[1,.51,0],Math.PI/2));
  const left=directorSeatTransform({position:[-1,.51,0],rotation:[0,-Math.PI/2,0],scale:[1,1,1]},{scale:[1,1,1]});
  const right=directorSeatTransform({position:[1,.51,0],rotation:[0,Math.PI/2,0],scale:[1,1,1]},{scale:[1,1,1]});
  actions.push(add('new-a','人物 A','person',left.position,left.rotation[1]),add('new-b','人物 B','person',right.position,right.rotation[1]));
  for(const objectId of ['new-a','new-b'])actions.push({kind:'pose',objectId,pose:'sit'});
 }
 // Vertical-FOV-based full-body framing also covers narrow portrait ratios.
 const [w,h]=String(source.camera.aspectRatio||'16:9').split(':').map(Number),ratio=w>0&&h>0?w/h:16/9;
 const distance=Math.max(4.7,(id==='dialogue'||id==='table'?1.5:.55)/(12/35*ratio*.8));
 actions.push({kind:'camera',position:[id==='walk'?-1:0,1.3,distance],target:[id==='walk'?-1:0,.95,0],focalLength:35});
 actions.push({kind:'lighting',ambientIntensity:.8,keyIntensity:1.5,keyAzimuth:35,keyElevation:45});
 const result=appendFreshSceneActionShot(project,{name:preset.name,summary:preset.description,warnings:[],durationSeconds:preset.duration,actions});
 if(id==='walk'){
  const shot=result.shots.at(-1),last=shot.fps*preset.duration-1;
  shot.keyframes=[-1,1].map((x,i)=>({frame:i*last,position:[x,1.3,distance],rotation:cameraRotation([x,1.3,distance],[x,.95,0]),focalLength:35,interpolation:'linear'}));
  activateShot(result,shot);
 }
 return result;
}
