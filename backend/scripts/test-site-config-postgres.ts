/** Local-only isolated schema. No real user, quota, channel or model writes. */
import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {PgResellerStore,ConfigConflict} from "../src/lib/reseller/pg-store";
import {DEFAULT_DATA} from "../src/lib/reseller/types";

async function main(){
  const connectionString=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;
  if(!connectionString||!["localhost","127.0.0.1","[::1]"].includes(new URL(connectionString).hostname))throw Error("Only local PostgreSQL is allowed");
  const schema="xoi_site_test_"+crypto.randomBytes(8).toString("hex");
  const admin=new pg.Pool({connectionString,max:1});
  const a=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:4});
  const b=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:4});
  const seed=structuredClone(DEFAULT_DATA);seed.site.name="旧品牌";seed.models.markupPct=17;seed.domain.subdomain="legacy";seed.theme.loginVideo="/legacy.mp4";seed.customers["6"]={tags:["keep"],note:"legacy"};
  let imports=0;const fromLegacy=async()=>{imports++;return structuredClone(seed);};
  const first=new PgResellerStore(a,fromLegacy),second=new PgResellerStore(b,fromLegacy);
  let passed=0;
  const check=async(name:string,run:()=>Promise<void>)=>{await run();passed++;console.log("PASS "+name);};
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await check("simultaneous schema creation and import preserve legacy configuration",async()=>{
      const [x,y]=await Promise.all([first.read("platform"),second.read("platform")]);assert.deepEqual(x,seed);assert.deepEqual(y,seed);
      assert.equal((await a.query("SELECT count(*)::int AS n FROM xoi_reseller_config")).rows[0].n,1);
    });
    await check("new node never overwrites an existing row with stale legacy/default values",async()=>{
      await first.patch("platform","site",{...seed.site,name:"新品牌"});
      const stale=new PgResellerStore(b,async()=>structuredClone(DEFAULT_DATA));
      assert.equal((await stale.read("platform")).site.name,"新品牌");
    });
    await check("cross-node updates to unrelated sections are both retained",async()=>{
      await Promise.all([first.patch("platform","site",{...seed.site,name:"品牌同步"}),second.patch("platform","theme",{...seed.theme,skin:"bento"})]);
      const row=await second.read("platform");assert.equal(row.site.name,"品牌同步");assert.equal(row.theme.skin,"bento");assert.equal(row.theme.loginVideo,"/legacy.mp4");assert.deepEqual(row.models,seed.models);assert.deepEqual(row.domain,seed.domain);assert.deepEqual(row.customers,seed.customers);
    });
    await check("simultaneous admin edits use compare-and-swap; exactly one succeeds",async()=>{
      const before=(await first.read("platform")).site;
      const outcomes=await Promise.allSettled([first.patch("platform","site",{...before,name:"编辑A"},{expectedValue:before}),second.patch("platform","site",{...before,name:"编辑B"},{expectedValue:before})]);
      assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
      assert.ok(outcomes.some(x=>x.status==="rejected"&&x.reason instanceof ConfigConflict));
    });
    await check("config and audit commit together; conflict does not append an audit",async()=>{
      const before=(await first.read("platform")).site;
      const entry={id:crypto.randomUUID(),at:Date.now(),actorRole:"reseller",actorEmail:"fixture",action:"site.brand.update",targetType:"site-settings",targetId:"site",ip:"127.0.0.1"};
      await first.patch("platform","site",{...before,name:"已审计"},{expectedValue:before,audit:entry});
      await assert.rejects(second.patch("platform","site",before,{expectedValue:before,audit:{...entry,id:"replay"}}),ConfigConflict);
      const row=await second.read("platform");assert.equal(row.site.name,"已审计");assert.equal(row.audit.length,1);assert.equal(row.audit[0].id,entry.id);
    });
    await check("agent keys remain isolated from each other and platform",async()=>{
      await first.patch("agent-1","site",{...seed.site,name:"代理一"});await second.patch("agent-2","site",{...seed.site,name:"代理二"});
      assert.equal((await first.read("agent-1")).site.name,"代理一");assert.equal((await second.read("agent-2")).site.name,"代理二");assert.equal((await first.read("platform")).site.name,"已审计");
    });
    await check("concurrent audits retain all entries and are capped at 500",async()=>{
      const entry={at:Date.now(),actorRole:"test",actorEmail:"fixture",action:"test",targetType:"fixture",targetId:"fixture",ip:"local"};
      await Promise.all(Array.from({length:16},(_,i)=>(i%2?first:second).audit("platform",{...entry,id:String(i)})));
      const row=await first.read("platform");assert.equal(row.audit.length,17);assert.equal(new Set(row.audit.map(x=>x.id)).size,17);
      await first.patch("platform","audit",Array.from({length:500},(_,i)=>({...entry,id:String(i)})));
      await second.audit("platform",{...entry,id:"latest"});assert.equal((await first.read("platform")).audit.length,500);assert.equal((await first.read("platform")).audit[0].id,"latest");
    });
    await check("database failure never falls back to legacy files",async()=>{
      const count=imports;await b.end();await assert.rejects(second.read("platform"));assert.equal(imports,count);
    });
    console.log(JSON.stringify({passed,modelRequests:0,businessRowsChanged:0}));
  }finally{
    await a.end();if(!(b as any).ended)await b.end();
    // Generated and validated exact test schema only; never business schemas.
    if(!/^xoi_site_test_[a-f0-9]{16}$/.test(schema))throw Error("unsafe fixture cleanup");
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
