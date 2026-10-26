import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {once} from "node:events";
import {ReleaseLifecycle} from "./releaseLifecycle";

test("drain guards mounted API before work, but keeps admin recovery and signed payment settlement",async()=>{
  const lifecycle=new ReleaseLifecycle(),app=express();let calls=0;
  app.use("/api",lifecycle.admission);
  app.post("/api/generate",(_q,r)=>{calls++;r.json({ok:true});});
  app.get("/api/admin/releases",(_q,r)=>r.json({recovery:true}));
  app.post("/api/pay/callback/fixture",(_q,r)=>r.json({settled:true}));
  const server=app.listen(0,"127.0.0.1");await once(server,"listening");
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{
    assert.equal((await fetch(base+"/api/generate",{method:"POST"})).status,200);
    lifecycle.setDraining(true);
    const refused=await fetch(base+"/api/generate",{method:"POST"});assert.equal(refused.status,503);assert.equal((await refused.json()).code,"RELEASE_DRAINING");assert.equal(calls,1);
    assert.equal((await fetch(base+"/api/admin/releases")).status,200);
    assert.equal((await fetch(base+"/api/pay/callback/fixture",{method:"POST"})).status,200);
    assert.deepEqual(lifecycle.snapshot(),{http:0,socket:0});
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test("accepted HTTP remains tracked during drain until response finishes",async()=>{
  const lifecycle=new ReleaseLifecycle(),app=express();let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
  app.use("/api",lifecycle.admission);app.get("/api/slow",async(_q,r)=>{entered();await gate;r.json({ok:true});});
  const server=app.listen(0,"127.0.0.1");await once(server,"listening");
  const response=fetch(`http://127.0.0.1:${(server.address() as any).port}/api/slow`);
  try{
    await started;lifecycle.setDraining(true);assert.equal(lifecycle.snapshot().http,1);
    assert.equal(await lifecycle.waitForIdle(()=>true,1),false);release();assert.equal((await response).status,200);
    assert.equal(await lifecycle.waitForIdle(()=>true,500),true);assert.equal(lifecycle.snapshot().http,0);
  }finally{release();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test("socket logical work remains tracked until promise ends; new work blocked without invoking handler",async()=>{
  const lifecycle=new ReleaseLifecycle();let complete!:()=>void,executed=0,rejected=0;
  const work=lifecycle.socketHandler(async()=>{executed++;await new Promise<void>(r=>complete=r);},()=>rejected++);
  const active=work();assert.equal(lifecycle.snapshot().socket,1);lifecycle.setDraining(true);
  await work();assert.equal(executed,1);assert.equal(rejected,1);assert.equal(lifecycle.snapshot().socket,1);
  complete();await active;assert.equal(lifecycle.snapshot().socket,0);
  lifecycle.setDraining(false);
  let warning="";await lifecycle.socketHandler(async()=>{throw Error("fixture");},message=>warning=message)();assert.match(warning,/结果待核对/);assert.equal(lifecycle.snapshot().socket,0);
});
test("retirement also waits for the queue claim boundary, not just active jobs",async()=>{
  const lifecycle=new ReleaseLifecycle();let claiming=true;
  assert.equal(await lifecycle.waitForIdle(()=>!claiming,1),false);claiming=false;
  assert.equal(await lifecycle.waitForIdle(()=>!claiming,100),true);
});
test('a director batch stays active after HTTP reply until its background settlement ends',async()=>{
  const lifecycle=new ReleaseLifecycle(),finish=lifecycle.beginBackground();
  lifecycle.setDraining(true);
  assert.equal(await lifecycle.waitForIdle(()=>true,1),false);
  assert.equal(lifecycle.snapshot().http,1);
  finish();finish();
  assert.equal(await lifecycle.waitForIdle(()=>true,100),true);
  assert.equal(lifecycle.snapshot().http,0);
});
