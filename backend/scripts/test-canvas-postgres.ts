/** Local PostgreSQL only. All writes confined to an owned random test schema and temp directory. No AI requests. */
import "dotenv/config";
import knex from "knex";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CanvasDatabase,ensureCanvasDatabase } from "../src/lib/workspace/canvasDatabase";
import { migrateCanvasFiles,verifyCanvasImports } from "../src/lib/workspace/canvasMigration";

async function main() {
  const connection=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;
  if(!connection||!["localhost","127.0.0.1","[::1]"].includes(new URL(connection).hostname))throw Error("仅允许本机 PostgreSQL 集成测试");
  const schema=`xoi_canvas_test_${crypto.randomBytes(8).toString("hex")}`;
  const admin=knex({client:"pg",connection,pool:{min:0,max:1}});
  const config={client:"pg",connection:{connectionString:connection,options:`-c search_path=${schema}`},pool:{min:0,max:4},acquireConnectionTimeout:10000};
  const a=knex(config),b=knex(config),one=new CanvasDatabase(a),two=new CanvasDatabase(b);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"xoi-canvas-pg-"));
  const passed:string[]=[];
  const check=async(name:string,run:()=>Promise<void>)=>{await run();passed.push(name);};
  try {
    await admin.raw(`CREATE SCHEMA "${schema}"`);
    await ensureCanvasDatabase(a);
    await a.schema.createTable("users",t=>{t.bigInteger("id").primary();});
    await a("users").insert([{id:1},{id:2}]);
    await check("cross-connection CAS: one of 20 saves wins",async()=>{
      await one.create({id:"race",userId:2,title:"initial",nodes:[],settings:{atelier:{project:{id:"race"}}}},1);
      const results=await Promise.allSettled(Array.from({length:20},(_,i)=>(i%2?one:two).update("race",1,{revision:1},v=>({...v,title:`edit-${i}`}))));
      assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
      for(const r of results)if(r.status==="rejected")assert.equal(r.reason.status,409);
      const result=await two.get("race",1);assert.equal(result.revision,2);assert.equal(result.userId,1);assert.equal(result.settings.atelier.project.cloudRevision,2);
    });
    await check("ownership isolated, including metadata and commands",async()=>{
      assert.equal(await two.get("race",2),null);assert.deepEqual(await two.listMetadata(2),[]);
      await assert.rejects(two.update("race",2,{revision:2},v=>v),(e:any)=>e.status===404);
      await assert.rejects(two.command("race",2,v=>v),(e:any)=>e.status===404);
      await assert.rejects(two.create({id:"race"},2),(e:any)=>e.status===409);
    });
    await check("missing and stale versions rejected",async()=>{
      await assert.rejects(two.update("race",1,{},v=>v),(e:any)=>e.status===409);
      await assert.rejects(two.update("race",1,{revision:1},v=>v),(e:any)=>e.status===409);
    });
    await check("cross-connection commands serialize and enforce owner",async()=>{
      await Promise.all(Array.from({length:10},(_,i)=>(i%2?one:two).command("race",1,v=>({...v,counter:(v.counter||0)+1,userId:2}))));
      const result=await one.get("race",1);assert.equal(result.counter,10);assert.equal(result.revision,12);assert.equal(result.userId,1);
    });
    await check("metadata listing omits full graph",async()=>{
      const meta=(await two.listMetadata(1))[0];assert.equal(meta.id,"race");assert.equal(meta.nodes,undefined);assert.equal(meta.settings.atelier.project,undefined);
      assert.equal((await two.list(1))[0].settings.atelier.project.id,"race");
    });
    await check("failed/oversized mutation rolls back unchanged",async()=>{
      const before=await one.get("race",1);
      await assert.rejects(two.update("race",1,{revision:before.revision},()=>{throw Error("fixture");}));
      await assert.rejects(two.update("race",1,{revision:before.revision},v=>({...v,title:"x".repeat(12*1024*1024)})),(e:any)=>e.status===413);
      assert.deepEqual(await one.get("race",1),before);
    });
    await check("lock waits bounded with retryable status and no unintended save",async()=>{
      const before=await one.get("race",1);
      const held=await a.transaction();
      try {
        await held("xoi_canvas_documents").where({canvas_id:"race"}).forUpdate().first();
        const start=Date.now();
        await assert.rejects(two.update("race",1,{revision:before.revision},v=>({...v,title:"must not commit"})),(e:any)=>e.status===503);
        assert.ok(Date.now()-start<9000);
      }finally{await held.rollback();}
      assert.deepEqual(await one.get("race",1),before);
    });
    await check("delete/restore/purge cannot resurrect or reuse id",async()=>{
      await two.command("race",1,v=>({...v,deleted_at:123}));assert.equal(await one.get("race",1),null);
      await assert.rejects(one.update("race",1,{revision:13},v=>v),(e:any)=>e.status===409);
      assert.equal((await one.listMetadata(1)).length,0);assert.equal((await one.listMetadata(1,true)).length,1);
      await one.command("race",1,v=>{delete v.deleted_at;return v;},true);assert.ok(await two.get("race",1));
      await two.command("race",1,v=>({id:v.id,userId:1,deleted_at:123,purged:true}),true);
      assert.equal(await one.get("race",1,true),null);assert.equal((await one.list(1,true)).length,0);
      await assert.rejects(one.create({id:"race"},1),(e:any)=>e.status===409);
    });
    const legacy={id:"legacy",userId:1,updated_at:100,created_at:50,title:"legacy",nodes:[{id:"fixture-node"}]};
    const legacyBytes=JSON.stringify(legacy,null,2);
    await fs.writeFile(path.join(directory,"legacy.json"),legacyBytes);
    const purged={id:"purged",userId:2,purged:true,deleted_at:100};
    await fs.writeFile(path.join(directory,"purged.json"),JSON.stringify(purged));
    await check("dry run read-only and startup blocks unmigrated files",async()=>{
      const before=Number((await a("xoi_canvas_documents").count("canvas_id as n").first())!.n);
      const result=await migrateCanvasFiles(a,directory);assert.equal(result.toImport,2);assert.equal(result.applied,false);
      assert.equal(Number((await a("xoi_canvas_documents").count("canvas_id as n").first())!.n),before);
      await assert.rejects(verifyCanvasImports(a,directory));
    });
    await check("migration preserves payload, legacy revision and exact source bytes",async()=>{
      await migrateCanvasFiles(a,directory,true);assert.deepEqual(await two.get("legacy",1),legacy);
      assert.equal(await fs.readFile(path.join(directory,"legacy.json"),"utf8"),legacyBytes);
      assert.equal(Number((await a("xoi_canvas_documents").where({canvas_id:"legacy"}).first()).revision),0);
      assert.deepEqual(await verifyCanvasImports(a,directory),{verified:2});
    });
    await check("legacy timestamp CAS and repeat migration preserve newer database work",async()=>{
      await two.update("legacy",1,{timestamp:100},v=>({...v,title:"new cloud work"}));
      await assert.rejects(one.update("legacy",1,{timestamp:100},v=>v),(e:any)=>e.status===409);
      const result=await migrateCanvasFiles(a,directory,true);assert.equal(result.alreadyImported,2);
      assert.equal((await one.get("legacy",1)).title,"new cloud work");assert.equal((await one.get("legacy",1)).revision,1);
      assert.equal(await fs.readFile(path.join(directory,"legacy.json"),"utf8"),legacyBytes);
    });
    await check("purged legacy tombstone prevents resurrection",async()=>{
      assert.equal(await two.get("purged",2,true),null);
      await assert.rejects(two.create({id:"purged"},2),(e:any)=>e.status===409);
    });
    await check("changed old files block migration and startup, no overwrite",async()=>{
      await fs.writeFile(path.join(directory,"legacy.json"),JSON.stringify({...legacy,title:"changed old copy"}));
      await assert.rejects(migrateCanvasFiles(a,directory,true));await assert.rejects(verifyCanvasImports(a,directory));
      assert.equal((await one.get("legacy",1)).title,"new cloud work");
      await fs.writeFile(path.join(directory,"legacy.json"),legacyBytes);
    });
    await check("unknown legacy owner refused without partial import",async()=>{
      const file=path.join(directory,"orphan.json");await fs.writeFile(file,JSON.stringify({id:"orphan",userId:999}));
      await assert.rejects(migrateCanvasFiles(a,directory,true));assert.equal(await one.get("orphan",999),null);await fs.unlink(file);
    });
    await check("account limit enforced across database clients",async()=>{
      const rows=Array.from({length:200},(_,i)=>CanvasDatabase.legacyValues({id:`limit-${i}`,userId:2},"0".repeat(64)));
      await a("xoi_canvas_documents").insert(rows);
      await assert.rejects(two.create({id:"over-limit"},2),(e:any)=>e.status===413);
    });
    await check("database unavailable never falls back to legacy files",async()=>{
      await b.destroy();await assert.rejects(two.get("legacy",1));assert.equal(await fs.readFile(path.join(directory,"legacy.json"),"utf8"),legacyBytes);
    });
    console.log(JSON.stringify({passed:passed.length,checks:passed,paidRequests:0,businessDataWrites:0,temporarySchemaRemovedOnExit:true},null,2));
  } finally {
    await Promise.all([a.destroy(),b.destroy()]);
    // Strict generated identifier, never public or a caller-provided schema.
    if(!/^xoi_canvas_test_[a-f0-9]{16}$/.test(schema))throw Error("invalid owned test schema");
    await admin.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.destroy();
    await fs.rm(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error("画布 PG 验证失败：",error instanceof assert.AssertionError?error.message:"数据库/隔离测试未通过（私有数据不输出）");process.exitCode=1;});
