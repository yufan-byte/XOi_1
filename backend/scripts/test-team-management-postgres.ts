/** Exact local isolated schema only. No real accounts, balances, NewAPI or generation calls. */
import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import express from "express";
import {once} from "node:events";
import {TeamManagement,TeamManagementError} from "../src/lib/team/management";
import {createTeamManagementRouter} from "../src/lib/team/managementRouter";
async function main(){
  const connectionString=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;
  if(!connectionString||!["127.0.0.1","localhost","[::1]"].includes(new URL(connectionString).hostname))throw Error("Local PostgreSQL required");
  const schema="xoi_team_test_"+crypto.randomBytes(8).toString("hex"),admin=new pg.Pool({connectionString,max:1});
  const config={connectionString,options:`-c search_path=${schema}`,max:4},a=new pg.Pool(config),b=new pg.Pool(config);
  const first=new TeamManagement(a),second=new TeamManagement(b);let server:ReturnType<typeof express.application.listen>|undefined;
  let passed=0;const check=async(name:string,run:()=>Promise<void>)=>{await run();passed++;console.log("PASS "+name);};
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await a.query(`CREATE TABLE mc_teams(id integer PRIMARY KEY,owner_id integer UNIQUE,name text,pool bigint);
      CREATE TABLE mc_team_members(id integer PRIMARY KEY,team_id integer,user_id integer,nickname text,status text);
      CREATE TABLE mc_team_ledger(id bigserial PRIMARY KEY,team_id integer,kind text,user_id integer,amount bigint,pool_after bigint,actor_id integer,created_at bigint);
      INSERT INTO mc_teams VALUES(1,101,'团队一',1000),(2,201,'团队二',2000);
      INSERT INTO mc_team_members VALUES(11,1,102,'成员一','active'),(21,2,202,'成员二','active');
      INSERT INTO mc_team_ledger(team_id,kind,user_id,amount,pool_after,actor_id,created_at) VALUES(1,'transfer_in',101,500000,1000,101,1),(2,'transfer_in',201,1000000,2000,201,1);`);
    await check("two nodes initialize safely",async()=>{await Promise.all([first.ensure(),second.ensure()]);});
    await check("only owner sees their own ledger; ordinary member and outsiders are denied",async()=>{
      for(const uid of [102,103,202])await assert.rejects(first.list(uid,"ledger",1),(e:any)=>e.status===403);
      const own=await first.list(101,"ledger",1),other=await second.list(201,"ledger",1);
      assert.equal(own.total,1);assert.equal(own.items[0].actorId,101);assert.equal(other.items[0].actorId,201);
      await assert.rejects(first.start(201,"member.update",11,{}),(e:any)=>e.status===404);
    });
    await check("rename and audit commit atomically; stale editors cannot overwrite",async()=>{
      const values=await Promise.allSettled([first.rename(101,"名称A","团队一"),second.rename(101,"名称B","团队一")]);
      assert.equal(values.filter(v=>v.status==="fulfilled").length,1);assert.ok(values.some(v=>v.status==="rejected"&&v.reason.status===409));
      const events=await first.list(101,"operations",1);assert.equal(events.total,1);assert.equal((events.items[0] as any).status,"confirmed");
      const name=(await a.query("SELECT name FROM mc_teams WHERE id=1")).rows[0].name;
      await a.query("ALTER TABLE xoi_team_operations ADD CONSTRAINT fixture_reject_name CHECK(details->>'name' IS DISTINCT FROM '触发失败')");
      await assert.rejects(first.rename(101,"触发失败",name));assert.equal((await a.query("SELECT name FROM mc_teams WHERE id=1")).rows[0].name,name);
      assert.equal((await first.list(101,"operations",1)).total,1);
    });
    await check("events redact credentials; finish is owner-scoped and cannot replay",async()=>{
      const id=await first.start(101,"member.update",11,{nickname:"成员一",limitQuota:500000,canViewAll:false,password:"NEVER_SAVE_PASSWORD",token:"NEVER_SAVE_TOKEN",authorization:"SECRET"});
      await assert.rejects(second.finish(201,id,"confirmed"),(e:any)=>e.status===409);
      const serialized=JSON.stringify((await first.list(101,"operations",1)).items);assert.ok(!/NEVER_SAVE|authorization|password|SECRET/.test(serialized));
      await second.finish(101,id,"confirmed");await assert.rejects(first.finish(101,id,"needs_review"),(e:any)=>e.status===409);
    });
    await check("unauthorized intents cannot execute an external mutation",async()=>{
      let calls=0;await assert.rejects(first.track(201,"member.disable",11,{},async()=>{calls++;}));assert.equal(calls,0);
      await a.query("ALTER TABLE xoi_team_operations ADD CONSTRAINT fixture_reject_member_add CHECK(action<>'member.add')");
      await assert.rejects(first.track(101,"member.add",undefined,{},async()=>{calls++;}));assert.equal(calls,0);
      await a.query("ALTER TABLE xoi_team_operations DROP CONSTRAINT fixture_reject_member_add");
    });
    await check("ambiguous and failed executions never receive confirmed status",async()=>{
      await assert.rejects(first.track(101,"member.password",11,{},async()=>{throw Error("simulated gateway failure");}));
      assert.ok((await first.list(101,"operations",1)).items.some((e:any)=>e.action==="member.password"&&e.status==="needs_review"));
      const finish=first.finish.bind(first);first.finish=async()=>{throw Error("fixture audit connection lost");};
      await assert.rejects(first.track(101,"member.enable",11,{},async()=>true),(e:any)=>e instanceof TeamManagementError&&e.status===502);
      first.finish=finish;
      assert.ok((await first.list(101,"operations",1)).items.some((e:any)=>e.action==="member.enable"&&e.status==="started"));
    });
    await check("pagination total remains correct beyond the last page",async()=>{
      const result=await first.list(101,"ledger",3);assert.equal(result.total,1);assert.equal(result.items.length,0);
    });
    const app=express();app.use(express.json());
    // Trusted test identity on a loopback-only test server, never installed in the real app.
    app.use((req,_res,next)=>{const id=Number(req.headers["x-fixture-user"]);if(id)(req as any).user={id};next();});
    app.use("/management",createTeamManagementRouter(()=>first,async()=>{}));
    server=app.listen(0,"127.0.0.1");await once(server,"listening");const base=`http://127.0.0.1:${(server.address() as any).port}`;
    const request=(id:number|undefined,url="",body?:unknown)=>fetch(base+"/management"+url,{method:body===undefined?"GET":"PATCH",headers:{"Content-Type":"application/json",...(id?{"X-Fixture-User":String(id)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    await check("HTTP route rejects anonymous/member access, tenant overrides and invalid pages",async()=>{
      assert.equal((await request(undefined)).status,401);assert.equal((await request(102)).status,403);assert.equal((await request(201,"?teamId=1")).status,400);assert.equal((await request(101,"?page=-1")).status,400);
      assert.equal((await request(201,"",{name:"越权",expectedName:"团队一",ownerId:101})).status,400);
      const result=await request(101,"?view=ledger");assert.equal(result.status,200);assert.equal(result.headers.get("cache-control"),"no-store");
    });
    console.log(JSON.stringify({passed,modelRequests:0,realBalanceMutations:0,realMemberMutations:0}));
  }finally{
    if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}
    await a.end();await b.end();if(!/^xoi_team_test_[a-f0-9]{16}$/.test(schema))throw Error("Unsafe fixture cleanup");
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
