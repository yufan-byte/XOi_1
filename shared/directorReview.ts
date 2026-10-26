import {DirectorInputError, type DirectorScene, type DirectorShot, type Vec3} from './directorSkills';
import type {SceneActionPlan} from './directorMotion';
type Object3D=DirectorScene['objects'][number];
const chineseNumbers:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
function seconds(value:string){if(/^\d+$/.test(value))return Number(value);if(value.includes('十')){const [a,b]=value.split('十');return (a?chineseNumbers[a]:1)*10+(b?chineseNumbers[b]:0);}return chineseNumbers[value];}
export function resolveDirectorDuration(intent:string,explicit:unknown,current:number):number {
  const allMentions=[...intent.matchAll(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]{1,3})\s*秒/g)];
  const mentions=allMentions.filter(m=>!/[第前后从到]$/.test(intent.slice(0,m.index).trim()));
  const values=[...new Set(mentions.map(m=>seconds(m[1])))];
  const valid=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=60;
  if(values.some(v=>!valid(v)))throw new DirectorInputError('镜头时长请使用 1–60 秒的整数');
  if(explicit!==undefined&&explicit!==null&&explicit!==''&&!valid(explicit))throw new DirectorInputError('镜头时长请使用 1–60 秒的整数');
  if(explicit!==undefined&&explicit!==null&&explicit!==''){
    if(values.length===1&&values[0]!==explicit)throw new DirectorInputError(`需求为 ${values[0]} 秒，与时长设置 ${explicit} 秒不一致，请统一后生成`);
    return explicit as number;
  }
  if(values.length>1||allMentions.length>1)throw new DirectorInputError('需求包含多段时间，请在“本镜时长”中明确总时长');
  return values[0]??current;
}
export function retimeDirectorShot(shot:any,duration:number){
  if(!Number.isInteger(duration)||duration<1||duration>60)throw new DirectorInputError('镜头时长须为 1–60 秒');
  if(duration===shot.durationSeconds)return;
  const oldLast=Math.max(1,shot.fps*shot.durationSeconds-1),last=shot.fps*duration-1;
  const retime=(keys:any[])=>{
    const next=keys.map(k=>({...k,frame:Math.round(Math.min(1,k.frame/oldLast)*last)}));
    if(new Set(next.map(k=>k.frame)).size!==next.length)throw new DirectorInputError('时长过短，会合并已有关键帧；请延长镜头时长');
    return next;
  };
  shot.keyframes=retime(shot.keyframes||[]);
  for(const id of Object.keys(shot.objectKeyframes||{}))shot.objectKeyframes[id]=retime(shot.objectKeyframes[id]);
  shot.durationSeconds=duration;
}
export function resolveDirectorSubject(intent:string,explicit:unknown,objects:Object3D[],fallbackSingle=true):string|undefined {
  if(explicit!==undefined&&explicit!==''&&(typeof explicit!=='string'||!objects.some(o=>o.id===explicit)))throw new DirectorInputError('所选主体已不存在，请重新选择');
  const matches=objects.filter(o=>{
    const name=o.name.replace(/^人物\s*[·・:]\s*/,''),escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(!name)return false;
    return new RegExp(`(?:让|将|把|移动|调整|修改|旋转|跟随|对准|拍摄|靠近|推进到|给)\\s*(?:人物\\s*[·・:]\\s*)?${escaped}`).test(intent)||new RegExp(`${escaped}\\s*(?:向|走|跑|移动|转身)`).test(intent);
  });
  if(explicit){if(matches.length===1&&matches[0].id!==explicit)throw new DirectorInputError(`所选主体与需求中的“${matches[0].name}”不一致，请统一后生成`);return explicit as string;}
  if(matches.length===1)return matches[0].id;
  if(matches.length>1&&new Set(matches.map(o=>o.name)).size===1)throw new DirectorInputError('场景中有同名主体，请先选择具体人物');
  const named=intent.match(/(?:让|移动|调整|跟随|对准|拍摄|靠近|推进到)\s*([\u4e00-\u9fa5A-Za-z0-9·]{1,30}?)(?=向|走|跑|移动|转身|近景|特写|中景|。|，|,|$)/)?.[1];
  if(!matches.length&&named&&!['他','她','人物','角色','主体','相机','镜头','机位','场景','构图','视角','灯光'].includes(named))throw new DirectorInputError(`场景中找不到“${named}”，请检查名称或选择具体主体`);
  return fallbackSingle&&objects.filter(o=>o.type==='person').length===1?objects.find(o=>o.type==='person')!.id:undefined;
}
export function assertDirectorActionSubject(plan:SceneActionPlan,subjectId:string|undefined,objects:Object3D[]){
  if(!subjectId)return;
  for(const a of plan.actions)if('objectId'in a&&objects.some(o=>o.id===a.objectId&&o.type==='person')&&a.objectId!==subjectId)throw new DirectorInputError('方案修改了指定主体以外的人物，已拦截；请拆分需求或重新选择主体');
}
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3;
const sub=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v-b[i]) as Vec3;
const mul=(a:Vec3,n:number):Vec3=>a.map(v=>v*n) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0);
const unit=(a:Vec3):Vec3=>mul(a,1/(Math.hypot(...a)||1));
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function directorAspect(ratio:string){const [w,h]=ratio.split(':').map(Number);return w>0&&h>0?w/h:16/9;}
export function subjectAtTime(scene:DirectorScene,object:Object3D,t:number):Object3D {
  const path=scene.objectPaths?.[object.id];if(!path?.length)return object;
  const end=path.findIndex(p=>p.t>=t),a=end<0?path.at(-1)!:end===0?path[0]:path[end-1],b=end<0?path.at(-1)!:path[end];
  let u=a===b?0:(t-a.t)/(b.t-a.t);u=a.interpolation==='hold'?0:a.interpolation==='linear'?u:u*u*(3-2*u);
  return {...object,position:a.position.map((v,i)=>v+(b.position[i]-v)*u) as Vec3,pose:(u===1?b.pose:a.pose)||object.pose,rigRoot:a.rigRoot&&b.rigRoot?a.rigRoot.map((v,i)=>v+(b.rigRoot![i]-v)*u) as Vec3:a.rigRoot||object.rigRoot};
}
/** Native seated clip displaces the pelvis from the actor origin. */
export function directorSubjectAnchor(o:Pick<Object3D,'position'|'rotation'|'scale'|'pose'|'type'>):Vec3 {
 if(o.type!=='person'||o.pose!=='sit')return [...o.position];
 const x=.000906*o.scale[0],z=-.646358*o.scale[2],yaw=o.rotation[1];
 return [o.position[0]+Math.cos(yaw)*x+Math.sin(yaw)*z,o.position[1],o.position[2]-Math.sin(yaw)*x+Math.cos(yaw)*z];
}
export function subjectBounds(o:Object3D,framing=''){
  const height=(o.pose==='sit'?1.45:o.pose==='crouch'?1.2:1.95)*(o.bodyType==='tall'?1.1:1)*Math.abs(o.scale[1]);
  const bottom=o.position[1]+(o.rigRoot?.[1]||0),crop=/特写|近景/.test(framing)?.62:/中景|半身/.test(framing)?.3:0;
  const half=o.type==='person'?.4*Math.max(Math.abs(o.scale[0]),Math.abs(o.scale[2])):.6*Math.max(...o.scale.map(Math.abs));
  const top=o.type==='person'?bottom+height:bottom+Math.abs(o.scale[1])*.6;
  const low=o.type==='person'?bottom+height*crop:bottom-Math.abs(o.scale[1])*.6;
  const center=directorSubjectAnchor(o);
  return {min:[center[0]-half,low,center[2]-half] as Vec3,max:[center[0]+half,top,center[2]+half] as Vec3};
}
function corners(bounds:ReturnType<typeof subjectBounds>){return [0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>[bounds[x?'max':'min'][0],bounds[y?'max':'min'][1],bounds[z?'max':'min'][2]] as Vec3)));}
export function projectSubject(point:{position:Vec3;target:Vec3;focalLength:number},object:Object3D,aspectRatio:string,framing=''){
  const forward=unit(sub(point.target,point.position)),right=unit(cross(forward,[0,1,0])),up=unit(cross(right,forward)),tanV=12/point.focalLength,tanH=tanV*directorAspect(aspectRatio);
  return corners(subjectBounds(object,framing)).map(c=>{const v=sub(c,point.position),depth=dot(v,forward);return {x:.5+dot(v,right)/(2*depth*tanH),y:.5-dot(v,up)/(2*depth*tanV),depth};});
}
function objectWorldBounds(o:Object3D){
      if(o.type==='person')return subjectBounds(o);
      const half=[.5,.5,.5];if(o.type==='table')half.splice(0,3,.5,.425,.41);if(o.type==='chair')half.splice(0,3,.41,.555,.39);
      const x=half[0]*Math.abs(o.scale[0]),z=half[2]*Math.abs(o.scale[2]),c=Math.abs(Math.cos(o.rotation[1])),s=Math.abs(Math.sin(o.rotation[1]));
      const extent:Vec3=[c*x+s*z,half[1]*Math.abs(o.scale[1]),s*x+c*z];return {min:sub(o.position,extent),max:add(o.position,extent)};
}

function pointInsideRouteBox(point:Vec3,bounds:ReturnType<typeof objectWorldBounds>){return point[0]>bounds.min[0]&&point[0]<bounds.max[0]&&point[2]>bounds.min[2]&&point[2]<bounds.max[2];}
function segmentHitsRouteBox(a:Vec3,b:Vec3,bounds:ReturnType<typeof objectWorldBounds>){
 let near=0,far=1;
 for(const axis of [0,2]){const d=b[axis]-a[axis];if(Math.abs(d)<1e-8){if(a[axis]<=bounds.min[axis]||a[axis]>=bounds.max[axis])return false;continue;}const x=(bounds.min[axis]-a[axis])/d,y=(bounds.max[axis]-a[axis])/d;near=Math.max(near,Math.min(x,y));far=Math.min(far,Math.max(x,y));if(near>=far)return false;}
 return far>.001&&near<.999;
}
/** Adds editable waypoints around solid white-model props. Existing overlaps may exit,
 * but a route may not end inside furniture. This is deterministic and does not call AI. */
export function avoidDirectorObstacles(objects:Object3D[],actor:Object3D,source:Array<{t:number;position:Vec3}>){
 if(actor.type!=='person'||source.length<2)return {points:structuredClone(source),avoided:[] as string[]};
 const clearance=.42*Math.max(Math.abs(actor.scale[0]),Math.abs(actor.scale[2]))+.16;
 const obstacles=objects.filter(o=>o.id!==actor.id&&o.visible!==false&&!['plane','person'].includes(o.type)).map(object=>{const raw=objectWorldBounds(object);return {object,bounds:{min:[raw.min[0]-clearance,raw.min[1],raw.min[2]-clearance] as Vec3,max:[raw.max[0]+clearance,raw.max[1],raw.max[2]+clearance] as Vec3}};});
 const route=source.map(point=>({t:point.t,position:[...point.position] as Vec3})),avoided=new Set<string>();
 for(let pass=0;pass<3&&route.length<8;pass++){
  let changed=false;
  for(const {object,bounds} of obstacles)for(let i=0;i<route.length-1&&route.length<8;i++){
   const a=route[i].position,b=route[i+1].position;
   if(pointInsideRouteBox(b,bounds)){
    const exits:[number,number,number,number]=[Math.abs(b[0]-bounds.min[0]),Math.abs(bounds.max[0]-b[0]),Math.abs(b[2]-bounds.min[2]),Math.abs(bounds.max[2]-b[2])],side=exits.indexOf(Math.min(...exits)),pad=.06;
    if(side===0)b[0]=bounds.min[0]-pad;else if(side===1)b[0]=bounds.max[0]+pad;else if(side===2)b[2]=bounds.min[2]-pad;else b[2]=bounds.max[2]+pad;
    avoided.add(object.name);
   }
   if(pointInsideRouteBox(a,bounds)||!segmentHitsRouteBox(a,b,bounds))continue;
   const pad=.06,y=(a[1]+b[1])/2,sides:Array<[Vec3,Vec3]>=[
    [[bounds.min[0]-pad,y,bounds.min[2]-pad],[bounds.max[0]+pad,y,bounds.min[2]-pad]],
    [[bounds.min[0]-pad,y,bounds.max[2]+pad],[bounds.max[0]+pad,y,bounds.max[2]+pad]],
    [[bounds.min[0]-pad,y,bounds.min[2]-pad],[bounds.min[0]-pad,y,bounds.max[2]+pad]],
    [[bounds.max[0]+pad,y,bounds.min[2]-pad],[bounds.max[0]+pad,y,bounds.max[2]+pad]],
   ];
   const detour=sides.map(([first,second])=>{
    const normal=[first,second] as [Vec3,Vec3],reverse=[second,first] as [Vec3,Vec3];
    const score=(pair:[Vec3,Vec3])=>Math.hypot(pair[0][0]-a[0],pair[0][2]-a[2])+Math.hypot(pair[1][0]-pair[0][0],pair[1][2]-pair[0][2])+Math.hypot(b[0]-pair[1][0],b[2]-pair[1][2]);
    return score(normal)<=score(reverse)?normal:reverse;
   }).sort((p,q)=>Math.hypot(p[0][0]-a[0],p[0][2]-a[2])+Math.hypot(b[0]-p[1][0],b[2]-p[1][2])-Math.hypot(q[0][0]-a[0],q[0][2]-a[2])-Math.hypot(b[0]-q[1][0],b[2]-q[1][2]))[0];
   route.splice(i+1,0,{t:0,position:detour[0]},{t:0,position:detour[1]});avoided.add(object.name);changed=true;i+=2;
  }
  if(!changed)break;
 }
 const lengths=route.slice(1).map((point,index)=>Math.hypot(point.position[0]-route[index].position[0],point.position[1]-route[index].position[1],point.position[2]-route[index].position[2])),total=lengths.reduce((sum,value)=>sum+value,0);
 let traveled=0;route.forEach((point,index)=>{if(index)traveled+=lengths[index-1];point.t=total?traveled/total:index/(route.length-1);});route[0].t=0;route.at(-1)!.t=1;
 return {points:route,avoided:[...avoided]};
}

function blocksView(start:Vec3,end:Vec3,bounds:ReturnType<typeof subjectBounds>){
 let near=0,far=.96;
 for(let i=0;i<3;i++){const d=end[i]-start[i];if(Math.abs(d)<1e-8){if(start[i]<bounds.min[i]||start[i]>bounds.max[i])return false;continue;}const a=(bounds.min[i]-start[i])/d,b=(bounds.max[i]-start[i])/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return false;}
 return far>0;
}
export function fitDirectorShot(shot:DirectorShot,scene:DirectorScene,subjectId:string|string[]|undefined):{shot:DirectorShot;warnings:string[]} {
  const next=structuredClone(shot),ids=Array.isArray(subjectId)?subjectId:subjectId?[subjectId]:[],objects=scene.objects.filter(o=>ids.includes(o.id));
  if(!next.camera||!objects.length)return {shot:next,warnings:next.camera?['未指定唯一主体，请检查画面或选择主体后重新生成']:[]};
  const aspect=directorAspect(scene.aspectRatio);
  let corrected=false;const obstructions=new Set<string>();
  for(const p of next.camera.keyframes){
    const boxes=objects.map(o=>subjectBounds(subjectAtTime(scene,o,p.t),next.framing)),bounds={min:[0,1,2].map(k=>Math.min(...boxes.map(b=>b.min[k]))) as Vec3,max:[0,1,2].map(k=>Math.max(...boxes.map(b=>b.max[k]))) as Vec3},target=mul(add(bounds.min,bounds.max),.5);
    const oldTarget=[...p.target];p.target=[...target];
    const forward=unit(sub(p.target,p.position)),right=unit(cross(forward,[0,1,0]));
    if(Math.hypot(...right)<.1)throw new DirectorInputError('机位垂直于主体，无法稳定取景，请调整机位');
    const up=unit(cross(right,forward)),tanV=12/p.focalLength,tanH=tanV*aspect;
    const retreat=Math.max(0,...corners(bounds).map(c=>{const v=sub(c,p.position);return Math.max(Math.abs(dot(v,right))/(tanH*.84),Math.abs(dot(v,up))/(tanV*.84),.2)-dot(v,forward);}));
    if(retreat>0)p.position=sub(p.position,mul(forward,retreat+.03));
    for(const o of scene.objects)if(!ids.includes(o.id)&&o.type!=='plane'&&o.visible!==false&&obstructions.size<3&&blocksView(p.position,p.target,objectWorldBounds(subjectAtTime(scene,o,p.t))))obstructions.add(o.name);
    if(retreat>.001||Math.hypot(...sub(oldTarget as Vec3,p.target))>.01)corrected=true;
  }
  const moving=objects.some(o=>(scene.objectPaths?.[o.id]?.length||0)>1);
  return {shot:next,warnings:[...objects.filter(o=>o.visible===false).map(o=>`“${o.name}”目前隐藏，应用机位不会自动显示该主体`),...[...obstructions].map(name=>`“${name}”可能遮挡主体，请在3D预演中检查`),...(moving?["移动主体已按路线关键点校准取景，中段与遮挡仍请试播检查"]:[]),...(corrected?[`已按“${objects.slice(0,6).map(o=>o.name).join("、")}”的白模范围校准取景，必要时拉远机位；应用后请预演确认`]:[])]};
}
// Center-based native geometry. Only newly added, upright floor furniture is grounded.
const floorBottom:Record<string,number>={table:.44,chair:.51};
/** Measured on the native sit clip at phase 1: the animated pelvis moves
 * backwards 0.646 m from the actor origin. Align the pelvis, not that origin. */
export function directorSeatTransform(chair:{position:Vec3;rotation:Vec3;scale:Vec3},actor:{scale:Vec3}){
 const yaw=Math.atan2(Math.sin(chair.rotation[1]+Math.PI),Math.cos(chair.rotation[1]+Math.PI));
 const hipX=.000906*actor.scale[0],hipZ=-.646358*actor.scale[2];
 return {position:[chair.position[0]-Math.cos(yaw)*hipX-Math.sin(yaw)*hipZ,chair.position[1]+.085*chair.scale[1]-.60*actor.scale[1],chair.position[2]+Math.sin(yaw)*hipX-Math.cos(yaw)*hipZ] as Vec3,rotation:[0,yaw,0] as Vec3};
}
export function reviewScenePlacement(input:SceneActionPlan,scene:DirectorScene,groundNewObjects:boolean){
  const plan=structuredClone(input),objects=scene.objects.map(o=>structuredClone(o)),refs=new Map(objects.map(o=>[o.id,o]));
  const corrected:string[]=[],seatedPairs=new Set<string>();
  for(const action of plan.actions){
    if(action.kind==='add'){
      if(groundNewObjects&&Math.abs(action.rotation[0])<.01&&Math.abs(action.rotation[2])<.01){
        const bottom=action.type==='person'?0:floorBottom[action.type];
        if(bottom!==undefined){const y=bottom*action.scale[1];if(Math.abs(action.position[1]-y)>.015){action.position[1]=y;corrected.push(action.name);}}
      }
      const o={...action,id:action.ref,pose:'idle'};objects.push(o);refs.set(o.id,o);
    }else if('objectId'in action){
      const o=refs.get(action.objectId);if(!o)continue;
      if(action.kind==='move')o.position=action.position;
      if(action.kind==='pose')o.pose=action.pose;
    }
  }
  if(groundNewObjects){
    for(const action of plan.actions)if(action.kind==='add'&&action.type==='chair'){
      const table=objects.filter(o=>o.type==='table').sort((a,b)=>Math.hypot(a.position[0]-action.position[0],a.position[2]-action.position[2])-Math.hypot(b.position[0]-action.position[0],b.position[2]-action.position[2]))[0];
      if(table&&Math.hypot(table.position[0]-action.position[0],table.position[2]-action.position[2])<3.5){const yaw=Math.atan2(action.position[0]-table.position[0],action.position[2]-table.position[2]);if(Math.abs(Math.atan2(Math.sin(action.rotation[1]-yaw),Math.cos(action.rotation[1]-yaw)))>.05){action.rotation[1]=yaw;refs.get(action.ref)!.rotation=[...action.rotation];corrected.push(action.name+'朝向');}}
    }
  }
  const usedChairs=new Set<string>();
  for(const a of plan.actions)if(a.kind==='add'&&a.type==='person'&&refs.get(a.ref)?.pose==='sit'&&groundNewObjects){
    const chair=objects.filter(o=>o.type==='chair'&&!usedChairs.has(o.id)).sort((x,y)=>Math.hypot(x.position[0]-a.position[0],x.position[2]-a.position[2])-Math.hypot(y.position[0]-a.position[0],y.position[2]-a.position[2]))[0];
    if(chair&&Math.hypot(chair.position[0]-a.position[0],chair.position[2]-a.position[2])<1.2){
      Object.assign(a,directorSeatTransform(chair,a));
      Object.assign(refs.get(a.ref)!,{position:a.position,rotation:a.rotation});usedChairs.add(chair.id);seatedPairs.add([a.ref,chair.id].sort().join(':'));corrected.push(a.name+'坐姿');
    }
  }
  const routeWarnings:string[]=[];
  for(const action of plan.actions)if(action.kind==='animate'){
    const actor=refs.get(action.objectId);if(actor?.type!=='person')continue;
    if(!action.pose)action.pose='walk';
    const reviewed=avoidDirectorObstacles(objects,actor,action.points);action.points=reviewed.points;
    if(reviewed.avoided.length)routeWarnings.push(`${actor.name}已自动绕开：${reviewed.avoided.join('、')}`);
  }
  const warnings=[...routeWarnings,...placementWarnings(objects,new Set(plan.actions.filter(a=>a.kind==='add').map(a=>(a as any).ref)),seatedPairs)];
  if(corrected.length)warnings.unshift(`已自动落地或对齐：${[...new Set(corrected)].slice(0,8).join('、')}`);
  return {plan,warnings,objects};
}
function placementWarnings(objects:Object3D[],added:Set<string>,seatedPairs:Set<string>){
  const warnings:string[]=[];
  for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++){
    const a=objects[i],b=objects[j];if((!added.has(a.id)&&!added.has(b.id))||seatedPairs.has([a.id,b.id].sort().join(':'))||a.type==='plane'||b.type==='plane'||a.visible===false||b.visible===false)continue;
    const x=objectWorldBounds(a),y=objectWorldBounds(b);if([0,1,2].every(k=>Math.min(x.max[k],y.max[k])-Math.max(x.min[k],y.min[k])>.12)&&warnings.length<5)warnings.push(`“${a.name}”与“${b.name}”范围可能重叠，应用后检查；不会移动已有布景`);
  }return warnings;
}
