import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {createOneStopRouter} from '../lib/oneStop/router';
import {generationRequest} from '../lib/oneStop/generationPolicy';
import {OneStopError} from '../lib/oneStop/documents';
import {resourceScope} from '../middleware/resourceScope';

test('generation API identity, fail-closed errors and document fences use trusted auth only',async()=>{
 const events:any[]=[],app=express();let locked=true,writes=0;
 const store:any={list:async()=>({items:[]}),get:async()=>({id:'p',revision:1,payload:{id:'p'}}),save:async()=>{writes++;return{};},delete:async()=>{writes++;return{};}};
 app.use((req,_res,next)=>{if(req.get('x-fixture-user'))(req as any).user={id:Number(req.get('x-fixture-user'))};next();});
 app.use('/api',resourceScope(async()=>{throw Error('One-stop UUIDs must not resolve through legacy numeric resources');}));
 app.use('/api/one-stop',createOneStopRouter(()=>store,{
  quote:async(owner,input)=>{const parsed=generationRequest.safeParse(input);if(!parsed.success)throw new OneStopError('生成参数无效');events.push({owner,input:parsed.data});return{free:true};},
  submit:async(owner,input)=>{events.push({owner,submit:true});if(input.fail)throw Error('SECRET_DATABASE_URL');return{id:'safe-task'};},
  get:async(owner,id)=>{if(owner!==1)throw new OneStopError('任务不存在',404);return{id};},list:async(owner,id)=>({owner,id}),stop:async(owner,id)=>({owner,id}),receipt:async(owner,id)=>({owner,id}),active:async()=>locked,capabilities:()=>({enabled:true}),
 }));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 const call=async(path:string,body?:unknown,user?:number,method=body===undefined?'GET':'POST')=>{const r=await fetch(`http://127.0.0.1:${addr.port}/api/one-stop${path}`,{method,headers:{...(user?{'x-fixture-user':String(user)}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json() as any,cache:r.headers.get('cache-control')};};
 try{
  assert.equal((await call('/generation/quote',{projectId:'p',operation:'intent'})).status,401);assert.equal(events.length,0);
  assert.equal((await call('/generation/quote',{projectId:'p',operation:'intent',userId:99},1)).status,400);assert.equal(events.length,0);
  assert.equal((await call('/generation/quote',{projectId:'p',operation:'intent'},2)).status,200);assert.equal(events[0].owner,2);
  assert.equal((await call('/generation/jobs/owned',undefined,2)).status,404);
  const secret=await call('/generation/jobs',{fail:true},1);assert.equal(secret.status,503);assert.doesNotMatch(JSON.stringify(secret.body),/SECRET|DATABASE/);
  const payload={collection:'comic',revision:1,title:'x',payload:{id:'p'}};
  assert.equal((await call('/documents/p',payload,1,'PUT')).status,409);assert.equal((await call('/documents/p',{collection:'comic',revision:1},1,'DELETE')).status,409);assert.equal(writes,0);
  assert.equal((await call('/documents/p?collection=comic',undefined,1)).status,200);
  locked=false;assert.equal((await call('/documents/p',payload,1,'PUT')).status,200);assert.equal(writes,1);
  const caps=await call('/generation/capabilities',undefined,1);assert.equal(caps.body.data.enabled,true);assert.equal(caps.cache,'no-store');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('history API requires trusted identity and strict restore versions, never accepts tenant override or leaks store errors',async()=>{
 const events:any[]=[],app=express();app.use((req,_res,next)=>{if(req.get('x-fixture-user'))(req as any).user={id:Number(req.get('x-fixture-user'))};next();});
 app.use('/api',resourceScope(async()=>{throw Error('History IDs are not legacy numeric resources');}));
 app.use('/api/one-stop',createOneStopRouter(()=>({} as any),undefined,{
  list:async(owner,id,page)=>{events.push({owner,id,page});return{items:[],hasMore:false};},
  get:async(owner,id,version)=>{if(owner!==1)throw new OneStopError('历史版本不存在',404);events.push({owner,id,version});return{revision:version};},
  restore:async(owner,id,version,revision,clientId)=>{events.push({owner,id,version,revision,clientId});if(id==='failure')throw Error('SECRET_CONNECTION_STRING');return{restored:true};},
 }));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 const call=async(path:string,body?:unknown,user?:number)=>{const r=await fetch(`http://127.0.0.1:${addr.port}/api/one-stop${path}`,{method:body===undefined?'GET':'POST',headers:{...(user?{'x-fixture-user':String(user)}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json() as any,cache:r.headers.get('cache-control')};};
 try{
  const valid={revision:3,clientId:'fixture-history-client-01'};
  assert.equal((await call('/documents/p/history')).status,401);assert.equal((await call('/documents/p/history/1/restore',valid)).status,401);assert.equal(events.length,0);
  for(const path of ['/documents/p/history?page=0','/documents/p/history?page=2&userId=2','/documents/p/history/0','/documents/p/history/1?owner=2'])assert.equal((await call(path,undefined,1)).status,400);
  for(const body of [{...valid,userId:2},{...valid,revision:0},{...valid,revision:'3'},{...valid,clientId:'bad'}])assert.equal((await call('/documents/p/history/1/restore',body,1)).status,400);
  assert.equal(events.length,0);assert.equal((await call('/documents/p/history/1',undefined,2)).status,404);
  const list=await call('/documents/p/history?page=2',undefined,2);assert.equal(list.status,200);assert.equal(list.cache,'no-store');assert.deepEqual(events.at(-1),{owner:2,id:'p',page:2});
  assert.equal((await call('/documents/p/history/1/restore',valid,1)).status,200);assert.deepEqual(events.at(-1),{owner:1,id:'p',version:1,revision:3,clientId:valid.clientId});
  const failed=await call('/documents/failure/history/1/restore',valid,1);assert.equal(failed.status,503);assert.doesNotMatch(JSON.stringify(failed.body),/SECRET|CONNECTION/);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
