import {pathToKeys} from '../upstream/src/previsMotion.js'
import {rotationToward} from '../upstream/src/cameraMotion.js'
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=10000)
// Entering a placement tool must stop every camera driver while keeping the frame
// the user is looking at. Route data stays available for a later edit / undo.
export function manualCameraPose(camera, displayed=camera){
  return {...camera,position:[...displayed.position],rotation:[...displayed.rotation],focalLength:displayed.focalLength??camera.focalLength,motionMode:'manual',follow:null,route:camera.route?{...camera.route,enabled:false}:null}
}
export function cameraMotionMode(camera){
  if(camera.route?.enabled)return 'route'
  if(camera.motionMode!=='manual'&&camera.follow?.enabled&&camera.follow.targetId)return 'follow'
  return 'manual'
}
export function editableCameraPatch(camera,displayed,patch){
  if(patch.follow!==undefined){
    const base=manualCameraPose(camera,displayed)
    return {...base,...patch,motionMode:patch.follow?.enabled?'follow':'manual'}
  }
  if(patch.position||patch.rotation)return {...manualCameraPose(camera,displayed),...patch}
  return {...camera,...patch}
}
export function normalizeCameraRoute(value){
  if(value==null)return null
  if(value.version!==1||typeof value.id!=='string'||!/^[\w-]{1,160}$/.test(value.id)||!Array.isArray(value.points)||value.points.length<2||value.points.length>128||!value.points.every(vector)||!Number.isInteger(value.startFrame)||!Number.isInteger(value.endFrame)||value.startFrame<0||value.endFrame<=value.startFrame||value.endFrame>18000||!['fixed','tangent','target'].includes(value.orientation)||!vector(value.rotation))throw Error('相机路线数据无效，原工程保留')
  return {version:1,id:value.id,enabled:value.enabled!==false,points:value.points.map(p=>[...p]),startFrame:value.startFrame,endFrame:value.endFrame,orientation:value.orientation,rotation:[...value.rotation],targetId:typeof value.targetId==='string'?value.targetId.slice(0,160):''}
}
export const ownsCameraRouteKey=(key,route)=>key?.source==='camera-route'&&key?.routeId===route?.id
export function removeCameraRouteKeys(keys,route){return keys.filter(key=>!ownsCameraRouteKey(key,route))}
export function buildCameraRoute(points,options,camera,existing=[]){
  if(!Array.isArray(points)||points.length>4000||!points.every(vector))throw Error('路线节点过多或坐标无效')
  if(points.length>128)points=pathToKeys(points,0,127,{rotation:camera.rotation},128).map(key=>key.position)
  const route=normalizeCameraRoute({version:1,enabled:true,rotation:camera.rotation,...options,points})
  const remaining=removeCameraRouteKeys(existing,route)
  if(remaining.some(key=>key.frame>=route.startFrame&&key.frame<=route.endFrame))throw Error('这段时间已有手动或其他运镜关键帧，请调整路线时间或先移除冲突帧；原动画保留')
  const keys=pathToKeys(route.points,route.startFrame,route.endFrame,{rotation:route.rotation,focalLength:camera.focalLength},48).map(key=>({frame:key.frame,position:key.position,rotation:route.orientation==='tangent'?[0,key.rotation[1]+Math.PI,0]:[...route.rotation],focalLength:camera.focalLength,interpolation:'linear',source:'camera-route',routeId:route.id,followEnabled:false}))
  return {route,keys:[...remaining,...keys].sort((a,b)=>a.frame-b.frame)}
}
export function resolveRouteCamera(base,route,objects=[]){
  if(!route?.enabled||route.orientation!=='target')return base
  const target=objects.find(item=>item.id===route.targetId)
  if(!target)return {...base,routeTargetMissing:true}
  const height=target.type==='person'?1.2*Math.abs(target.scale?.[1]||1):0
  const aim=[target.position[0],target.position[1]+height,target.position[2]]
  return {...base,rotation:rotationToward(base.position,aim),follow:null}
}
export function cameraPresetPoints(kind,camera,target){
  if(!target)throw Error('先选择人物或物体作为运镜主体')
  const center=target.position,dx=camera.position[0]-center[0],dz=camera.position[2]-center[2]
  const distance=Math.max(3,Math.min(20,Math.hypot(dx,dz))),yaw=Math.atan2(dx,dz),height=Math.max(1.6,camera.position[1])
  const count=kind==='orbit'?25:9
  return Array.from({length:count},(_,i)=>{
    const t=i/(count-1),a=kind==='orbit'?yaw+(t-.5)*Math.PI*.75:yaw,r=distance*(kind==='push'?1-.4*t:kind==='pull'?1+.5*t:1),side=kind==='slide'?(t-.5)*distance:0
    return [center[0]+Math.sin(a)*r+Math.cos(a)*side,kind==='rise'?.6+t*3:height,center[2]+Math.cos(a)*r-Math.sin(a)*side]
  })
}
