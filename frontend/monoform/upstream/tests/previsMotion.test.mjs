import test from 'node:test'
import assert from 'node:assert/strict'
import {pathToKeys,simplifyRoutePoints,smoothRoutePoints} from '../src/previsMotion.js'
test('drawn path becomes timed position and heading keys including exact endpoint',()=>{
 const keys=pathToKeys([[0,0,0],[2,0,0],[2,0,-2]],0,60,{scale:[1,1,1],rotation:[0,0,0],pose:'idle'})
 assert.equal(keys[0].frame,0);assert.equal(keys.at(-1).frame,60);assert.ok(keys.length>3);assert.deepEqual(keys.at(-1).position,[2,0,-2]);assert.ok(keys[1].rotation[1]!==keys[0].rotation[1]);assert.equal(keys[0].interpolation,'linear')
})
test('zero length route rejected',()=>assert.throws(()=>pathToKeys([[0,0,0],[0,0,0]],0,24,{})))
test('dense freehand strokes keep endpoints and curvature with manageable control points',()=>{
 const input=Array.from({length:400},(_,i)=>[i/50,0,Math.sin(i/50)])
 const controls=simplifyRoutePoints(input),curve=smoothRoutePoints(controls)
 assert.ok(controls.length<=24&&controls.length>2);assert.deepEqual(controls[0],input[0]);assert.deepEqual(controls.at(-1),input.at(-1));assert.ok(curve.length>controls.length)
 const keys=pathToKeys(controls,0,120,{rotation:[0,0,0]})
 for(let i=1;i<keys.length;i++)assert.ok(Math.abs(keys[i].rotation[1]-keys[i-1].rotation[1])<Math.PI)
})

test('long route is arc-length resampled without a terminal jump',()=>{
 const points=Array.from({length:140},(_,i)=>[i/10,0,Math.sin(i/8)*2])
 const keys=pathToKeys(points,0,240,{rotation:[0,0,0]},48)
 assert.equal(keys.length,48)
 assert.deepEqual(keys[0].position,points[0])
 assert.deepEqual(keys.at(-1).position,points.at(-1))
 const lastSegment=Math.hypot(...keys.at(-1).position.map((v,i)=>v-keys.at(-2).position[i]))
 assert.ok(lastSegment<2)
})
