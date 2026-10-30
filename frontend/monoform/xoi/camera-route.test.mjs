import test from 'node:test'
import assert from 'node:assert/strict'
import {buildCameraRoute,normalizeCameraRoute,removeCameraRouteKeys,resolveRouteCamera,cameraPresetPoints} from './camera-route.js'
const camera={position:[0,2,6],rotation:[0,0,0],focalLength:50,aspectRatio:'16:9'}
const options={id:'camera-a',startFrame:24,endFrame:120,orientation:'fixed',targetId:''}
test('camera route bakes only camera keys and preserves manual keys outside its time range',()=>{
  const actorKeys=[{frame:24,position:[1,0,2]}],manual={frame:0,position:[0,2,6],rotation:[0,0,0],focalLength:35,source:'manual'}
  const result=buildCameraRoute([[0,2,6],[2,4,3],[4,2,0]],options,camera,[manual])
  assert.equal(result.keys[0],manual);assert.equal(result.keys.at(-1).frame,120);assert.deepEqual(result.keys.at(-1).position,[4,2,0]);assert.equal(result.keys.at(-1).source,'camera-route');assert.deepEqual(actorKeys,[{frame:24,position:[1,0,2]}])
  assert.deepEqual(removeCameraRouteKeys(result.keys,result.route),[manual])
})
test('replacing a route cannot erase overlapping manual keys or a different route',()=>{
  for(const source of ['manual','camera-route'])assert.throws(()=>buildCameraRoute([[0,2,0],[3,2,0]],options,camera,[{frame:72,source,routeId:'different'}]),/已有/)
  const first=buildCameraRoute([[0,2,0],[1,2,0]],options,camera)
  assert.equal(buildCameraRoute([[0,2,0],[3,2,0]],options,camera,first.keys).keys.at(-1).position[0],3)
})
test('camera route position remains independent while tracking an animated target',()=>{
  const base={...camera,position:[2,3,8]},route={enabled:true,orientation:'target',targetId:'lead'}
  const a=resolveRouteCamera(base,route,[{id:'lead',type:'person',position:[0,0,0],scale:[1,1,1]}]),b=resolveRouteCamera(base,route,[{id:'lead',type:'person',position:[4,0,0],scale:[1,1,1]}])
  assert.deepEqual(a.position,base.position);assert.deepEqual(b.position,base.position);assert.notDeepEqual(a.rotation,b.rotation)
  assert.equal(resolveRouteCamera(base,route,[]).routeTargetMissing,true)
})
test('camera faces along minus Z instead of reusing actor heading',()=>{
  const result=buildCameraRoute([[0,2,0],[0,2,3]],{...options,orientation:'tangent'},camera)
  assert.ok(Math.abs(Math.abs(result.keys[0].rotation[1])-Math.PI)<1e-8)
})
test('long camera paths are resampled through their endpoint and corrupt geometry is refused',()=>{
  const points=Array.from({length:300},(_,i)=>[i/100,2,Math.sin(i/100)])
  const result=buildCameraRoute(points,options,camera);assert.equal(result.route.points.length,128);assert.deepEqual(result.keys.at(-1).position,points.at(-1));assert.ok(result.keys.length<=48)
  assert.throws(()=>buildCameraRoute([[0,0,0],[NaN,2,0]],options,camera));assert.throws(()=>buildCameraRoute([[0,0,0],[0,0,0]],options,camera));assert.throws(()=>normalizeCameraRoute({...result.route,endFrame:0}))
})
test('quick camera presets never create or mutate actors',()=>{
  const actor={id:'a',position:[1,0,1]},before=JSON.stringify(actor)
  for(const kind of ['push','pull','slide','orbit','rise'])assert.ok(cameraPresetPoints(kind,camera,actor).length>=2)
  assert.equal(JSON.stringify(actor),before)
})

test('manual placement freezes the displayed route pose without deleting saved route data',async()=>{
  const {manualCameraPose,cameraMotionMode}=await import('./camera-route.js')
  const route=buildCameraRoute([[0,2,6],[3,2,1]],options,camera).route
  const driven={...camera,route,motionMode:'route'},shown={...camera,position:[2,2,3],rotation:[.1,1,0]}
  const before=JSON.stringify(driven),manual=manualCameraPose(driven,shown)
  assert.deepEqual(manual.position,shown.position);assert.deepEqual(manual.rotation,shown.rotation)
  assert.equal(manual.route.enabled,false);assert.deepEqual(manual.route.points,route.points)
  assert.equal(cameraMotionMode(manual),'manual');assert.equal(JSON.stringify(driven),before)
  manual.position[0]=9;assert.equal(shown.position[0],2)
})
test('a camera drag detaches route and follow drivers while preserving current unedited axes',async()=>{
  const {editableCameraPatch,cameraMotionMode}=await import('./camera-route.js')
  const driven={...camera,follow:{enabled:true,targetId:'lead'},route:{enabled:false,points:[[0,2,6],[3,2,1]]},motionMode:'follow'}
  const shown={...camera,position:[6,3,1],rotation:[.1,.8,0]},rotation=[.2,1,0]
  const edited=editableCameraPatch(driven,shown,{rotation})
  assert.equal(edited.follow,null);assert.equal(edited.route.enabled,false);assert.equal(cameraMotionMode(edited),'manual')
  assert.deepEqual(edited.position,shown.position);assert.deepEqual(edited.rotation,rotation)
  const follow=editableCameraPatch({...driven,route:{...driven.route,enabled:true}},shown,{follow:{enabled:true,targetId:'other'}})
  assert.equal(follow.route.enabled,false);assert.equal(cameraMotionMode(follow),'follow')
  assert.equal(cameraMotionMode({...driven,motionMode:'manual'}),'manual')
})
