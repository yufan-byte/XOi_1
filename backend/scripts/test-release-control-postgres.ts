/** Isolated local schema; no business users, balances, deployment commands or model requests. */
import "dotenv/config";
import knex from "knex";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import {once} from "node:events";
import {ReleaseControl,ensureReleaseControl,releaseView,type ReleaseSnapshot} from "../src/lib/workspace/releaseControl";
import {createReleaseRouter} from "../src/lib/workspace/releaseRouter";
import {resolveIdentity} from "../src/utils/authIdentity";

async function main(){
  const connection=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;
  if(!connection||!["127.0.0.1","localhost","[::1]"].includes(new URL(connection).hostname))throw Error("local PostgreSQL required");
  const schema="xoi_release_test_"+crypto.randomBytes(8).toString("hex");
  const admin=knex({client:"pg",connection,pool:{min:0,max:1}});
  const config={client:"pg",connection:{connectionString:connection,options:`-c search_path=${schema}`},pool:{min:0,max:4}};
  const a=knex(config),b=knex(config);let server:ReturnType<typeof express.application.listen>|undefined;
  let now=Date.now();const checks:string[]=[];
  const check=async(name:string,fn:()=>Promise<void>)=>{await fn();checks.push(name);};
  try{
    await admin.raw(`CREATE SCHEMA "${schema}"`);await Promise.all([ensureReleaseControl(a),ensureReleaseControl(b)]);
    await a.schema.createTable("users",t=>{t.bigInteger("id").primary();t.integer("role");t.integer("status");t.bigInteger("deleted_at");});
    await a("users").insert([{id:1,role:100,status:1},{id:2,role:10,status:1},{id:3,role:1,status:1},{id:4,role:100,status:2},{id:5,role:100,status:1,deleted_at:now}]);
    const control=new ReleaseControl(a,true,()=>now),other=new ReleaseControl(b,true,()=>now),disabled=new ReleaseControl(a,false,()=>now);
    const x=crypto.randomUUID(),y=crypto.randomUUID();
    const snapshot:ReleaseSnapshot={http:0,socket:0,media:0,claiming:false,ready:true,postgres:true,pending:0,legacyPending:0};
    await control.register(x,"fixture-v1","blue");await control.heartbeat(x,snapshot,false);
    await check("deployment groups cannot inspect, control, or count each other's replacements",async()=>{
      const isolated=new ReleaseControl(b,true,()=>now,"other-deployment"),z=crypto.randomUUID();
      await isolated.register(z,"fixture-other","other");await isolated.heartbeat(z,snapshot,false);
      assert.equal((await control.list()).some(v=>v.instanceId===z),false);
      await assert.rejects(control.change(z,0,false,1,"foreign"),(e:any)=>e.status===404);
      await assert.rejects(control.change(x,0,true,1,"foreign replacement"),(e:any)=>e.status===409);
      await isolated.change(z,0,false,1,"other audit");assert.equal((await control.audit()).length,0);assert.equal((await isolated.audit()).length,1);
    });
    await check("single-node drain is refused without audit or state change",async()=>{
      await assert.rejects(control.change(x,0,true,1,"test"),(e:any)=>e.status===409);
      assert.equal(await control.desired(x),false);assert.equal((await control.audit()).length,0);
    });
    await control.register(y,"fixture-v2","green");await control.heartbeat(y,snapshot,false);
    await check("rollout, storage and dependency readiness gates fail closed",async()=>{
      await assert.rejects(disabled.change(x,0,true,1,"test"),(e:any)=>e.status===409);
      await control.heartbeat(x,{...snapshot,postgres:false},false);
      await assert.rejects(control.change(x,0,true,1,"test"),(e:any)=>e.status===409);await control.heartbeat(x,snapshot,false);
      await control.heartbeat(x,{...snapshot,ready:false},true);
      await assert.rejects(control.change(x,0,false,1,"unhealthy activation"),(e:any)=>e.status===409);await control.heartbeat(x,snapshot,false);
    });
    await check("simultaneous drains keep one healthy replacement",async()=>{
      const outcomes=await Promise.allSettled([control.change(x,0,true,1,"test"),other.change(y,0,true,1,"test")]);
      assert.equal(outcomes.filter(v=>v.status==="fulfilled").length,1);assert.equal((await control.audit()).length,1);
      const nodes=await control.list();assert.equal(nodes.filter(v=>v.desiredDraining).length,1);
      const drained=nodes.find(v=>v.desiredDraining)!;await control.change(drained.instanceId,drained.revision,false,1,"resume fixture");
    });
    await check("stale control version cannot replay an instruction",async()=>{
      const row=(await control.list()).find(v=>v.instanceId===x)!;
      await control.change(x,row.revision,false,1,"fixture");
      await assert.rejects(other.change(x,row.revision,false,1,"replay"),(e:any)=>e.status===409);
    });
    await check("stale heartbeat is never a replacement or permission to retire",async()=>{
      await a("xoi_release_instances").where({instance_id:y}).update({heartbeat_at:now-16000});
      const row=(await control.list()).find(v=>v.instanceId===x)!;
      await assert.rejects(control.change(x,row.revision,true,1,"fixture"),(e:any)=>e.status===409);
      await assert.rejects(control.change(y,0,false,1,"fixture"),(e:any)=>e.status===409);await control.heartbeat(y,snapshot,false);
    });
    await check("idle status requires confirmed drain, fresh and complete counters",async()=>{
      const row=await a("xoi_release_instances").where({instance_id:x}).first();
      assert.equal(releaseView({...row,drain_requested:true,observed_draining:true,snapshot},now).observedIdle,true);
      for(const s of [{}, {...snapshot,media:1},{...snapshot,socket:1},{...snapshot,http:1},{...snapshot,claiming:true},{...snapshot,pending:1},{...snapshot,legacyPending:1}])assert.equal(releaseView({...row,drain_requested:true,observed_draining:true,snapshot:s},now).observedIdle,false);
      assert.equal(releaseView({...row,drain_requested:true,observed_draining:true,snapshot,heartbeat_at:now-16000},now).observedIdle,false);
    });
    await check("standby candidate is not a replacement until explicitly activated and observed",async()=>{
      const z=crypto.randomUUID();await control.register(z,"fixture-v3","candidate",true);await control.heartbeat(z,snapshot,true);
      await a("xoi_release_instances").where({instance_id:y}).update({heartbeat_at:now-16000});
      const row=(await control.list()).find(v=>v.instanceId===x)!;
      await assert.rejects(control.change(x,row.revision,true,1,"fixture"),(e:any)=>e.status===409);
      await control.change(z,0,false,1,"activate fixture");
      await assert.rejects(control.change(x,row.revision,true,1,"fixture"),(e:any)=>e.status===409);
      await control.heartbeat(z,snapshot,false);await control.change(x,row.revision,true,1,"fixture");await control.change(x,row.revision+1,false,1,"restore fixture");
    });
    const secret=crypto.randomBytes(32).toString("hex"),app=express();app.use(express.json());
    app.use(async(req,_res,next)=>{
      const token=req.get("authorization");if(!token)return next();
      try{(req as any).user=await resolveIdentity(token,secret,async id=>{const u=await a("users").where({id}).first();return u&&!u.deleted_at?{id:Number(u.id),role:u.role>=10?"admin":"user",status:u.status===1?"active":"banned"}:undefined;});}catch{}
      next();
    });
    app.use("/api/admin/releases",createReleaseRouter(a,control,x,true));server=app.listen(0,"127.0.0.1");await once(server,"listening");
    const url=`http://127.0.0.1:${(server.address() as any).port}/api/admin/releases`;
    const token=(id:number,claims={})=>"Bearer "+jwt.sign({id,...claims},secret,{expiresIn:"5m"});
    await check("anonymous, admin, ordinary, banned and deleted users cannot inspect nodes",async()=>{
      assert.equal((await fetch(url)).status,401);
      for(const id of [2,3,4,5])assert.ok([401,403].includes((await fetch(url,{headers:{authorization:token(id,{role:"admin",root:true})}})).status));
      assert.equal((await fetch(url,{headers:{authorization:token(1)}})).status,200);
    });
    await check("root command requires exact intent, confirmation and allowlisted fields",async()=>{
      const row=(await control.list()).find(v=>v.instanceId===x)!;
      const body={revision:row.revision,action:"resume",reason:"fixture",confirm:"CONFIRM_NODE_CONTROL"};
      const headers={authorization:token(1),"Content-Type":"application/json","X-XOi-Release-Intent":"node-control"};
      assert.equal((await fetch(url+`/${x}/control`,{method:"POST",headers,body:JSON.stringify({...body,command:"touch /forbidden"})})).status,400);
      assert.equal((await fetch(url+`/${x}/control`,{method:"POST",headers,body:JSON.stringify({...body,confirm:""})})).status,400);
      assert.equal((await fetch(url+`/${x}/control`,{method:"POST",headers:{authorization:token(1),"Content-Type":"application/json"},body:JSON.stringify(body)})).status,400);
      assert.equal((await fetch(url+`/${x}/control`,{method:"POST",headers,body:JSON.stringify(body)})).status,200);
    });
    await check("role revocation takes effect on existing JWT and transaction authority",async()=>{
      const old=token(1);await a("users").where({id:1}).update({role:10});
      assert.equal((await fetch(url,{headers:{authorization:old}})).status,403);
      const row=(await control.list()).find(v=>v.instanceId===x)!;
      await assert.rejects(control.change(x,row.revision,false,1,"bypass"),(e:any)=>e.status===403);
      await a("users").where({id:1}).update({role:100});
    });
    console.log(JSON.stringify({passed:checks.length,checks,paidRequests:0,businessDataWrites:0,realServiceDrained:false},null,2));
  }finally{
    if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
    await Promise.all([a.destroy(),b.destroy()]);
    if(!/^xoi_release_test_[a-f0-9]{16}$/.test(schema))throw Error("invalid owned schema");
    await admin.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.destroy();
  }
}
main().catch(e=>{console.error("发布控制验证失败：",e instanceof assert.AssertionError?e.message:"隔离测试未通过，私有数据不输出");process.exitCode=1;});
