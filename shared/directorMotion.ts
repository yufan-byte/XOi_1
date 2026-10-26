import {retimeDirectorShot,directorSubjectAnchor,avoidDirectorObstacles} from "./directorReview";
import { directorVec3, DirectorInputError, type Vec3 } from "./directorSkills";
import { DIRECTOR_POSE_DATA } from "./directorPoseData";

export const MOTION_PRESETS = [
  { id:"push", name:"缓慢推进", description:"靠近主体，强调情绪", path:"M 22 58 L 88 58" },
  { id:"pull", name:"拉远揭示", description:"离开主体，展开空间", path:"M 88 58 L 22 58" },
  { id:"slide", name:"横移跟拍", description:"横向移动，保持主体", path:"M 20 74 L 122 74" },
  { id:"orbit", name:"环绕人物", description:"绕主体转动，突出登场", path:"M 30 83 A 48 48 0 0 1 105 26" },
  { id:"rise", name:"低位升起", description:"抬升机位，揭示环境", path:"M 28 86 Q 75 86 110 24" },
  { id:"follow", name:"前后跟随", description:"人物走动，相机跟随", path:"M 20 82 Q 60 82 76 53 T 122 24" },
] as const;
export type MotionId = typeof MOTION_PRESETS[number]["id"];
export type MotionStyle = "calm" | "suspense" | "bright";
export interface MotionOptions { presetId:MotionId; targetId:string; duration:number; distance:number; amount:number; direction:1|-1; style:MotionStyle; follow:boolean;framing?:'subject'|'scene';focalLength?:number }
export interface MotionPoint { t:number; position:Vec3; target:Vec3; focalLength:number }
type Project = Record<string, any>;
const smooth = (t:number) => t*t*(3-2*t);
const lerp = (a:number,b:number,t:number) => a+(b-a)*t;
const vec = (a:Vec3,b:Vec3,t:number):Vec3 => a.map((v,i)=>lerp(v,b[i],t)) as Vec3;
export function cameraRotation(position:Vec3,target:Vec3):Vec3 {
  const d=target.map((v,i)=>v-position[i]),len=Math.hypot(...d);
  if(len<.01)throw new DirectorInputError("镜头与主体太近，请增大距离");
  return [Math.asin(d[1]/len),Math.atan2(-d[0],-d[2]),0];
}
export function sampleObjectPosition(object:any, keys:any[], frame:number):Vec3 {
  const sorted=[...keys].sort((a,b)=>a.frame-b.frame);
  if(!sorted.length)return directorVec3(object.position,"主体位置");
  if(frame<=sorted[0].frame)return directorVec3(sorted[0].position,"路线起点");
  if(frame>=sorted.at(-1).frame)return directorVec3(sorted.at(-1).position,"路线终点");
  const end=sorted.findIndex(k=>k.frame>=frame),a=sorted[end-1],b=sorted[end];
  let t=(frame-a.frame)/(b.frame-a.frame);t=a.interpolation==="hold"?0:a.interpolation==="linear"?t:smooth(t);
  return vec(a.position,b.position,t);
}
export function hasObjectTravel(project:Project,id:string){
 const keys=project.objectKeyframes?.[id]||[];
 return keys.length>=2&&keys.some((k:any)=>Array.isArray(k.position)&&Array.isArray(keys[0].position)&&Math.hypot(...k.position.map((v:number,i:number)=>v-keys[0].position[i]))>.02);
}
export function createMotionPath(project:Project, options:MotionOptions):MotionPoint[] {
  if(!MOTION_PRESETS.some(p=>p.id===options.presetId))throw new DirectorInputError("请选择有效的运镜预设");
  if(!Number.isInteger(options.duration)||options.duration<1||options.duration>60||!Number.isFinite(options.distance)||options.distance<1||options.distance>30||!Number.isFinite(options.amount)||options.amount<.2||options.amount>2||![1,-1].includes(options.direction)||!["calm","suspense","bright"].includes(options.style)||options.focalLength!==undefined&&(!Number.isFinite(options.focalLength)||options.focalLength<18||options.focalLength>120))throw new DirectorInputError("运镜参数无效");
  const object=project.objects?.find((o:any)=>o.id===options.targetId);
  if(!object)throw new DirectorInputError("先选一个人物或物体作为镜头主体");
  if(options.presetId==='follow'&&!hasObjectTravel(project,object.id))throw new DirectorInputError('前后跟随需要主体先有移动路线。请记录人物起点和终点，或点击“设置走位并跟拍”；固定人物可选推进、拉远或环绕。');
  const keys=project.objectKeyframes?.[object.id]||[];
  const origin=directorSubjectAnchor(object),shift=origin.map((v,i)=>v-object.position[i]);
  const sampleCenter=(frame:number)=>sampleObjectPosition(object,keys,frame).map((v,i)=>v+shift[i]) as Vec3;
  const base=sampleCenter(0);
  const aimHeight=(object.type==="person"?(options.framing==='subject'?(object.pose==='sit'?1.35:object.pose==='crouch'?.85:1.4):1.15):.3)*Math.max(.1,object.scale?.[1]||1);
  const camera=project.camera,offset=[camera.position[0]-base[0],0,camera.position[2]-base[2]];
  const length=Math.hypot(offset[0],offset[2])||1,front:Vec3=[offset[0]/length,0,offset[2]/length];
  if(Math.hypot(...front)<.1){front[0]=0;front[2]=1;}
  const right:Vec3=[front[2],0,-front[0]];
  const extent=Math.max(...(object.scale||[1,1,1]).map((v:number)=>Math.abs(v)));
  const distance=Math.max(options.distance,extent*.8+1),height=Math.max(1.4,aimHeight+.35),fps=project.settings?.fps||24;
  const count=Math.min(61,options.duration*fps);
  const startKeysDuration=project.settings?.durationSeconds||options.duration;
  return Array.from({length:count},(_,i)=>{
    const t=i/(count-1),u=options.style==="calm"?smooth(t):options.style==="suspense"?t*t:smooth(t);
    const follow=options.follow||options.presetId==="follow";
    const center=follow?sampleCenter(t*fps*startKeysDuration):base;
    const target:Vec3=[center[0],center[1]+aimHeight,center[2]];
    let radial=distance,lateral=0,y=height,angle=0;
    const strength=options.amount*(options.style==="bright"?1.2:1),travel=options.direction===1?u:1-u;
    if(options.presetId==="push")radial=distance*(1-.5*travel*strength/2);
    if(options.presetId==="pull")radial=distance*(1+.6*travel*strength);
    if(options.presetId==="slide")lateral=(u-.5)*distance*.9*strength*options.direction;
    if(options.presetId==="orbit")angle=(u-.5)*Math.PI*.75*strength*options.direction;
    if(options.presetId==="rise")y=.55+travel*distance*.65*strength;
    if(options.presetId==="follow")radial=distance*options.direction;
    const x=(front[0]*Math.cos(angle)+right[0]*Math.sin(angle))*radial+right[0]*lateral;
    const z=(front[2]*Math.cos(angle)+right[2]*Math.sin(angle))*radial+right[2]*lateral;
    return {t,position:[center[0]+x,center[1]+y,center[2]+z] as Vec3,target,focalLength:options.focalLength??(options.framing==='subject'?65:options.style==="suspense"?50:options.style==="bright"?35:42)};
  });
}
export function createFollowDemo(project:Project,targetId:string,duration:number,options?:Partial<MotionOptions>,travelDirection?:'left'|'right'|'away'|'toward'):Project{
 const actor=project.objects?.find((o:any)=>o.id===targetId);
 if(actor?.type!=='person'||actor.locked)throw new DirectorInputError('请选择未锁定的人物添加示例走位');
 const yaw=actor.rotation?.[1]||0,start=[...actor.position] as Vec3,end:[number,number,number]=[start[0]+Math.sin(yaw)*2,start[1],start[2]+Math.cos(yaw)*2];
 const demo=travelDirection?applyActorTravel(project,targetId,duration,2,travelDirection):appendSceneActionShot(project,{name:'前后跟随 · 示例走位',summary:'为所选人物添加两米行走路线并跟拍；原镜头保留',warnings:[],durationSeconds:duration,actions:[{kind:'animate',objectId:targetId,pose:'walk',points:[{t:0,position:start},{t:1,position:end}]}]});
 const points=createMotionPath(demo,{distance:5,amount:1,direction:1,style:'calm',...options,presetId:'follow',targetId,duration,follow:true});
 const cameraVersion=appendMotionShot({...demo,shots:[demo.shots.find((s:any)=>s.id===demo.activeShotId)]},points,duration,'前后跟随 · 示例走位');
 const shot=cameraVersion.shots.at(-1);cameraVersion.shots=[...structuredClone(project.shots),shot];return activateShot(cameraVersion,shot);
}
/** Apply a prepared camera or blocking change to this shot; undo owns the backup. */
export function replaceCurrentShot(project:Project,prepared:Project):Project {
 const source=project.shots?.find((s:any)=>s.id===project.activeShotId),active=prepared.shots?.find((s:any)=>s.id===prepared.activeShotId);
 if(!source||!active)throw new DirectorInputError('当前镜头已不存在');
 const next=structuredClone(prepared),shot={...structuredClone(active),id:source.id,name:source.name};
 next.shots=project.shots.map((s:any)=>structuredClone(s.id===source.id?shot:s));
 return activateShot(next,next.shots.find((s:any)=>s.id===source.id));
}
export function applyMotionToCurrent(project:Project,points:MotionPoint[],duration:number,name:string):Project {
 return replaceCurrentShot(project,appendMotionShot({...project,shots:[project.shots.find((s:any)=>s.id===project.activeShotId)]},points,duration,name));
}
export function applyActorTravel(project:Project,targetId:string,duration:number,distance:number,direction:'left'|'right'|'away'|'toward',pose:'walk'|'run'='walk'):Project {
 const actor=project.objects?.find((o:any)=>o.id===targetId);
 if(actor?.type!=='person'||actor.locked)throw new DirectorInputError('请选择未锁定的人物设置走位');
 if(!Number.isFinite(distance)||distance<.2||distance>10||!['left','right','away','toward'].includes(direction)||!['walk','run'].includes(pose))throw new DirectorInputError('人物走位参数无效');
 const start=directorVec3(actor.position,'人物位置');start[1]=Math.max(0,start[1]);
 const camera=directorVec3(project.camera.position,'机位'),length=Math.hypot(camera[0]-start[0],camera[2]-start[2])||1;
 const front:Vec3=[(camera[0]-start[0])/length,0,(camera[2]-start[2])/length];
 if(Math.hypot(...front)<.1)front[2]=1;
 const axis:Vec3=direction==='left'||direction==='right'?[front[2],0,-front[0]]:front;
 const sign=direction==='left'||direction==='away'?-1:1,end=start.map((v,i)=>v+axis[i]*distance*sign) as Vec3;
 const next=appendSceneActionShot({...project,shots:[project.shots.find((s:any)=>s.id===project.activeShotId)]},{name:'人物走位',summary:'设置所选人物的起终点与动作',warnings:[],durationSeconds:duration,actions:[{kind:'animate',objectId:targetId,pose,points:[{t:0,position:start},{t:1,position:end}]}]});
 return replaceCurrentShot(project,next);
}
/** Repairs the exact two-key walking-track bug shipped before 2026-10-21:
 * the arrival key was written facing 180° away from its travel direction. */
export function repairLegacyWalkingEndRotations(project:Project):boolean {
 let changed=false;
 const repair=(tracks:Record<string,any[]>|undefined)=>{
  for(const keys of Object.values(tracks||{})){
   if(keys.length!==2||!keys.every(key=>['walk','run'].includes(key.pose)&&key.continuousMotion===true))continue;
   const [start,end]=keys,dx=end.position?.[0]-start.position?.[0],dz=end.position?.[2]-start.position?.[2];
   if(!Number.isFinite(dx)||!Number.isFinite(dz)||Math.hypot(dx,dz)<.05||!Array.isArray(start.rotation)||!Array.isArray(end.rotation))continue;
   const expected=Math.atan2(dx,dz),angle=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
   if(angle(start.rotation[1],expected)<.05&&angle(end.rotation[1],expected)>.05&&angle(end.rotation[1],expected+Math.PI)<.05){
    end.rotation=[end.rotation[0]||0,expected,end.rotation[2]||0];changed=true;
   }
  }
 };
 repair(project.objectKeyframes);
 for(const shot of project.shots||[])repair(shot.objectKeyframes);
 return changed;
}
export function editMotionEndpoint(points:MotionPoint[], index:0|1, position:Vec3):MotionPoint[] {
  const original=points[index===0?0:points.length-1].position;
  const delta=position.map((v,i)=>v-original[i]);
  return points.map(p=>({...p,position:p.position.map((v,i)=>v+delta[i]*(index===0?1-p.t:p.t)) as Vec3}));
}
export function activateShot(project:Project, shot:any):Project {
  project.activeShotId=shot.id;
  for(const k of ["objects","camera","lighting","reference","keyframes","objectKeyframes"])project[k]=structuredClone(shot[k]);
  project.settings={...project.settings,fps:shot.fps,durationSeconds:shot.durationSeconds,loopPlayback:shot.loopPlayback};
  return project;
}
export function appendMotionShot(project:Project,points:MotionPoint[],duration:number,name:string):Project {
  if(!Array.isArray(project.shots)||project.shots.length>=30)throw new DirectorInputError("镜头已达 30 个，请先整理镜头");
  if(!Number.isInteger(duration)||duration<1||duration>60||points.length<2||points.length>200)throw new DirectorInputError("运镜时长或路径无效");
  const next=structuredClone(project),source=next.shots.find((s:any)=>s.id===next.activeShotId);
  if(!source)throw new DirectorInputError("原镜头已不存在");
  const shot=structuredClone(source),oldLast=Math.max(1,shot.fps*shot.durationSeconds-1),last=shot.fps*duration-1;
  shot.id=`shot-motion-${crypto.randomUUID()}`;shot.name=name.slice(0,30);shot.thumbnail="";shot.durationSeconds=duration;shot.loopPlayback=false;
  // 时长变化时，演员路线同步缩放时间，保留全部姿势与动作。
  for(const id of Object.keys(shot.objectKeyframes||{})) {
    const mapped=new Map<number,any>();
    for(const key of shot.objectKeyframes[id]){const frame=Math.round(key.frame/oldLast*last);mapped.set(frame,{...key,frame});}
    shot.objectKeyframes[id]=[...mapped.values()].sort((a,b)=>a.frame-b.frame);
  }
  let prev=-1;
  shot.keyframes=points.map(p=>{
    if(!Number.isFinite(p.t)||p.t<0||p.t>1||p.t<=prev)throw new DirectorInputError("运镜时间顺序无效");prev=p.t;
    const position=directorVec3(p.position,"机位"),target=directorVec3(p.target,"主体");
    if(!Number.isFinite(p.focalLength)||p.focalLength<18||p.focalLength>120)throw new DirectorInputError("焦距无效");
    return {frame:Math.round(p.t*last),position,rotation:cameraRotation(position,target),focalLength:p.focalLength,interpolation:"linear"};
  });
  if(points[0].t!==0||points.at(-1)!.t!==1||new Set(shot.keyframes.map((k:any)=>k.frame)).size!==shot.keyframes.length)throw new DirectorInputError("路径需要有效起点和终点，请延长镜头");
  shot.camera={...shot.camera,position:shot.keyframes[0].position,rotation:shot.keyframes[0].rotation,focalLength:shot.keyframes[0].focalLength};
  next.shots.push(shot);return activateShot(next,shot);
}

export const WHITE_OBJECTS=["person","box","sphere","cylinder","plane","arch","stairs","table","chair","sofa","door","window","tree","vehicle","roof"] as const;
export const WHITE_POSES=["idle","stand_relaxed","crouch","sit","walk","run","wave","sad_pose"] as const;
export type SceneAction =
  | {kind:"add";ref:string;name:string;type:typeof WHITE_OBJECTS[number];position:Vec3;rotation:Vec3;scale:Vec3}
  | {kind:"move";objectId:string;position:Vec3}
  | {kind:"pose";objectId:string;pose:typeof WHITE_POSES[number]}
  | {kind:"animate";objectId:string;points:Array<{t:number;position:Vec3}>;pose?:"walk"|"run"|"wave"}
  | {kind:"camera";position:Vec3;target:Vec3;focalLength:number}
  | {kind:"lighting";ambientIntensity:number;keyIntensity:number;keyAzimuth:number;keyElevation:number};
export interface SceneActionPlan {name:string;summary:string;warnings:string[];actions:SceneAction[];durationSeconds?:number}
/** AI walking plans may only touch existing actors, never scenery or cameras. */
export function validateBlockingPlan(input:any,objects:Array<{id:string;type:string;locked?:boolean}>,subjectId?:string):SceneActionPlan {
 const plan=validateSceneActionPlan(input,objects);
 for(const action of plan.actions){
  if(!['move','pose','animate'].includes(action.kind)||!('objectId' in action))throw new DirectorInputError('人物走位方案只能修改现有人物的路线或姿势，不能改变布景、灯光和机位');
  const actor=objects.find(o=>o.id===action.objectId);
  if(actor?.type!=='person'||actor.locked||subjectId&&actor.id!==subjectId)throw new DirectorInputError('走位方案修改了所选人物以外的对象，请重新描述人物走位');
 }
 return plan;
}
export function applyBlockingToCurrent(project:Project,input:SceneActionPlan,subjectId?:string):Project {
 const plan=validateBlockingPlan(input,project.objects,subjectId),next=appendSceneActionShot({...project,shots:[project.shots.find((s:any)=>s.id===project.activeShotId)]},plan);
 const shot=next.shots.find((s:any)=>s.id===next.activeShotId);
 for(const action of plan.actions)if(action.kind==='animate'&&action.pose){
  const keys=shot.objectKeyframes[action.objectId];
  keys.forEach((key:any,i:number)=>{const a=keys[i===keys.length-1?i-1:i],b=keys[i===keys.length-1?i:i+1],dx=b.position[0]-a.position[0],dz=b.position[2]-a.position[2];if(Math.hypot(dx,dz)>.01)key.rotation=[0,Math.atan2(dx,dz),0];});
  shot.objects.find((o:any)=>o.id===action.objectId).rotation=[...keys[0].rotation];
 }
 return replaceCurrentShot(project,next);
}
function text(v:unknown,label:string,max=100):string {if(typeof v!=="string"||!v.trim()||v.length>max)throw new DirectorInputError(`${label}无效`);return v.trim();}
export function validateSceneActionPlan(input:any,objects:Array<{id:string;type:string;locked?:boolean}>):SceneActionPlan {
  if(!input||!Array.isArray(input.actions)||!input.actions.length||input.actions.length>30)throw new DirectorInputError("场景方案需要 1–30 项调整");
  const ids=new Map(objects.map(o=>[o.id,o])), refs=new Set<string>();
  let additions=0;
  const target=(id:unknown,person=false)=>{const key=text(id,"物体标识",160),object=ids.get(key);if(!object)throw new DirectorInputError("方案引用了不存在的物体");if(object.locked)throw new DirectorInputError("方案包含锁定物体，请先解锁或重新生成");if(person&&object.type!=="person")throw new DirectorInputError("只有人物可以设置姿势");return key;};
  const actions:SceneAction[]=input.actions.map((a:any)=>{
    switch(a?.kind){
      case "add": {
        const ref=text(a.ref,"新物体标识",60);if(!/^new-[a-zA-Z0-9-]+$/.test(ref)||refs.has(ref)||ids.has(ref)||!WHITE_OBJECTS.includes(a.type))throw new DirectorInputError("新物体类型或标识无效");
        const scale=directorVec3(a.scale,"缩放",30);if(scale.some(v=>v<.05))throw new DirectorInputError("物体尺寸太小");
        refs.add(ref);ids.set(ref,{id:ref,type:a.type});additions++;
        return {kind:"add",ref,name:text(a.name,"物体名",60),type:a.type,position:directorVec3(a.position,"位置",200),rotation:directorVec3(a.rotation,"旋转",Math.PI*2),scale};
      }
      case "move":return {kind:"move",objectId:target(a.objectId),position:directorVec3(a.position,"位置",200)};
      case "pose":if(!WHITE_POSES.includes(a.pose))throw new DirectorInputError("姿势暂不支持");return {kind:"pose",objectId:target(a.objectId,true),pose:a.pose};
      case "animate": {
        const objectId=target(a.objectId);if(!Array.isArray(a.points)||a.points.length<2||a.points.length>8||a.points[0]?.t!==0||a.points.at(-1)?.t!==1)throw new DirectorInputError("人物路线需要起点和终点");
        let last=-1;const points=a.points.map((p:any)=>{if(typeof p.t!=="number"||!Number.isFinite(p.t)||p.t<=last||p.t<0||p.t>1)throw new DirectorInputError("路线时间无效");last=p.t;return {t:p.t,position:directorVec3(p.position,"路线位置",200)};});
        if(a.pose!==undefined&&(!["walk","run","wave"].includes(a.pose)||ids.get(objectId)?.type!=="person"))throw new DirectorInputError("人物动作无效");
        const moving=points.some((point:{t:number;position:Vec3},index:number)=>index>0&&Math.hypot(...point.position.map((value:number,axis:number)=>value-points[0].position[axis]))>.05);
        return {kind:"animate",objectId,points,...(a.pose?{pose:a.pose}:ids.get(objectId)?.type==="person"&&moving?{pose:"walk" as const}:{})};
      }
      case "camera": {
        const position=directorVec3(a.position,"机位",200),point=directorVec3(a.target,"视线目标",200);cameraRotation(position,point);
        if(typeof a.focalLength!=="number"||!Number.isFinite(a.focalLength)||a.focalLength<18||a.focalLength>120)throw new DirectorInputError("焦距无效");
        return {kind:"camera",position,target:point,focalLength:a.focalLength};
      }
      case "lighting": {
        for(const [key,min,max] of [["ambientIntensity",0,3],["keyIntensity",0,6],["keyAzimuth",-180,180],["keyElevation",5,85]] as const)if(typeof a[key]!=="number"||!Number.isFinite(a[key])||a[key]<min||a[key]>max)throw new DirectorInputError("灯光参数无效");
        return {kind:"lighting",ambientIntensity:a.ambientIntensity,keyIntensity:a.keyIntensity,keyAzimuth:a.keyAzimuth,keyElevation:a.keyElevation};
      }
      default:throw new DirectorInputError("方案包含暂不支持的操作");
    }
  });
  if(objects.length+additions>120)throw new DirectorInputError("场景最多 120 个物体");
  if(!Array.isArray(input.warnings)||input.warnings.length>8)throw new DirectorInputError("方案提示无效");
  if(input.durationSeconds!==undefined&&(!Number.isInteger(input.durationSeconds)||input.durationSeconds<1||input.durationSeconds>60))throw new DirectorInputError("镜头时长须为 1–60 秒");
  return {...(input.durationSeconds===undefined?{}:{durationSeconds:input.durationSeconds}),name:text(input.name,"方案名称",30),summary:text(input.summary,"方案摘要",2000),warnings:input.warnings.map((w:unknown)=>text(w,"方案提示",1000)),actions};
}
export function appendSceneActionShot(project:Project, input:SceneActionPlan):Project {
  const plan=validateSceneActionPlan(input,project.objects||[]);
  if(project.shots?.length>=30)throw new DirectorInputError("镜头已达上限，请先整理");
  const next=structuredClone(project),source=next.shots?.find((s:any)=>s.id===next.activeShotId);
  if(!source)throw new DirectorInputError("原镜头已不存在");
  const shot=structuredClone(source);shot.id=`shot-scene-${crypto.randomUUID()}`;shot.name=plan.name;shot.thumbnail="";
  retimeDirectorShot(shot,plan.durationSeconds??source.durationSeconds);
  const refs=new Map<string,string>();
  for(const a of plan.actions){
    const id="objectId" in a?(refs.get(a.objectId)||a.objectId):"";
    const object=shot.objects.find((o:any)=>o.id===id);
    if(a.kind==="add") {
      const newId=`object-assistant-${crypto.randomUUID()}`;refs.set(a.ref,newId);
      shot.objects.push({id:newId,name:a.name,type:a.type,position:a.position,rotation:a.rotation,scale:a.scale,color:a.type==="tree"?"#9ca68d":"#d8d1c5",visible:true,locked:false,...(a.type==="person"?{bodyType:"standard",pose:"idle",...structuredClone(DIRECTOR_POSE_DATA.idle),footLock:false}:{})});
    } else if(a.kind==="move") {
      const delta=a.position.map((v,i)=>v-object.position[i]);object.position=a.position;
      if(shot.objectKeyframes?.[id])shot.objectKeyframes[id]=shot.objectKeyframes[id].map((k:any)=>({...k,position:k.position.map((v:number,i:number)=>v+delta[i])}));
    } else if(a.kind==="pose") {
      const poseData=structuredClone(DIRECTOR_POSE_DATA[a.pose]);
      Object.assign(object,{pose:a.pose,...poseData});
      if(shot.objectKeyframes?.[id])shot.objectKeyframes[id]=shot.objectKeyframes[id].map((k:any)=>({...k,pose:a.pose,...poseData}));
    } else if(a.kind==="animate") {
      const last=shot.fps*shot.durationSeconds-1;
      if(a.pose)Object.assign(object,{pose:a.pose,...structuredClone(DIRECTOR_POSE_DATA[a.pose])});
      const route=avoidDirectorObstacles(shot.objects,object,a.points).points;
      shot.objectKeyframes||={};shot.objectKeyframes[id]=route.map((p,index)=>{
        // The final key must keep facing along the last segment. Using "previous - current"
        // here made a walking actor spin 180° on arrival, even in an empty scene.
        const from=route[index===0?0:index-1].position,to=route[index===0?Math.min(1,route.length-1):index].position;
        const dx=to[0]-from[0],dz=to[2]-from[2],rotation=object.type==='person'&&Math.hypot(dx,dz)>.01?[0,Math.atan2(dx,dz),0]:[...object.rotation];
        return {frame:Math.round(p.t*last),interpolation:"linear",position:p.position,rotation,scale:[...object.scale],pose:object.pose||"idle",poseTime:object.poseTime||0,continuousMotion:!!object.continuousMotion,rigRoot:object.rigRoot||[0,0,0],joints:object.joints||{}};
      });
      if(new Set(shot.objectKeyframes[id].map((k:any)=>k.frame)).size!==route.length)throw new DirectorInputError("人物路线过密");
      object.position=[...route[0].position];object.rotation=[...shot.objectKeyframes[id][0].rotation];
    } else if(a.kind==="camera") {
      shot.camera={...shot.camera,position:a.position,rotation:cameraRotation(a.position,a.target),focalLength:a.focalLength};shot.keyframes=[];
    } else if(a.kind==="lighting") { const {kind,...values}=a;shot.lighting={...shot.lighting,...values}; }
  }
  next.shots.push(shot);return activateShot(next,shot);
}
export function sceneActionLabel(action:SceneAction,objects:Array<{id:string;name:string}>,actions:SceneAction[]):string {
  const names=new Map([...objects.map(o=>[o.id,o.name] as const),...actions.filter((a):a is Extract<SceneAction,{kind:"add"}>=>a.kind==="add").map(a=>[a.ref,a.name] as const)]);
  if(action.kind==="add")return `添加 ${action.name}`;
  if(action.kind==="camera")return `设置主摄像机 · ${action.focalLength}mm`;
  if(action.kind==="lighting")return "调整环境光和主光";
  const name=names.get(action.objectId)||"物体";
  if(action.kind==="move")return `移动 ${name}（已有路线同步平移）`;
  if(action.kind==="pose")return `调整 ${name} 的姿势`;
  return `为 ${name} 记录 ${action.points.length} 个移动点${action.pose==="walk"?"，配合行走动作":action.pose==="run"?"，配合奔跑动作":""}`;
}
