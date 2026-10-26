/** Isolated schema only: no real user balances, channels, tokens, logs, or upstream calls. */
import "dotenv/config";
import crypto from "node:crypto";
import knex from "knex";
import pg from "pg";
import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {SharedRateLimit} from "../src/utils/sharedRateLimit";
import {ModelConcurrency} from "../src/utils/modelConcurrency";
import {QuotaOperations} from "../src/utils/quotaOperations";
import {accountBudgetHold} from "../src/utils/accountBudgetHold";
const name=`xoi_security_fixture_${crypto.randomUUID().replace(/-/g,"")}`;
assert.match(name,/^xoi_security_fixture_[a-f0-9]{32}$/);
const url=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;
const admin=new pg.Pool({connectionString:url,max:1});
let db:ReturnType<typeof knex>|undefined,created=false;
async function main(){
  await admin.query(`CREATE SCHEMA ${name}`);created=true;
  db=knex({client:"pg",connection:{connectionString:url},searchPath:[name],pool:{min:0,max:8}});
  const schema=(await db.raw("select current_schema() as name")).rows[0].name;assert.equal(schema,name);
  const ratesA=new SharedRateLimit(db),ratesB=new SharedRateLimit(db);await Promise.all([ratesA.ensure(),ratesB.ensure()]);
  const rateResults=await Promise.all(Array.from({length:200},(_,i)=>(i%2?ratesA:ratesB).take("test-user","same-user",60000,10,120000)));
  assert.equal(rateResults.filter(r=>r.allowed).length,10);
  const cA=new ModelConcurrency(db,32,3),cB=new ModelConcurrency(db,32,3);await Promise.all([cA.ensure(),cB.ensure()]);
  const owner=await Promise.allSettled(Array.from({length:12},()=>cA.acquire(1)));assert.equal(owner.filter(r=>r.status==="fulfilled").length,3);
  const rest=await Promise.allSettled(Array.from({length:70},(_,i)=>(i%2?cA:cB).acquire(i+2)));
  const releases=[...owner,...rest].filter((r):r is PromiseFulfilledResult<()=>Promise<void>>=>r.status==="fulfilled").map(r=>r.value);
  assert.equal(releases.length,32);await Promise.all(releases.map(r=>r()));assert.equal(Number((await db("xoi_model_leases").count("id as count").first() as any).count),0);
  const small=new ModelConcurrency(db,1,1,1000);await small.acquire(1,1000);await assert.rejects(()=>small.acquire(2,1500));await small.acquire(2,2100);await db("xoi_model_leases").delete();
  await db.schema.createTable("o_quota_ledger",t=>{t.increments("id");t.bigInteger("user_id");t.bigInteger("delta");t.bigInteger("quota_after");for(const key of ["type","description","reference_type","reference_id","created_at"])t.text(key);t.integer("operator_id");t.text("idempotency_key").unique();});
  let remoteAttempts=0;const fakeAdjust=async()=>{remoteAttempts++;return 100;};
  const creditA=new QuotaOperations(db,fakeAdjust),creditB=new QuotaOperations(db,fakeAdjust);await Promise.all([creditA.ensure(),creditB.ensure()]);
  const credit={userId:777,delta:100,type:"gift",idempotencyKey:"fixture:concurrent-credit"};
  await Promise.allSettled(Array.from({length:100},(_,i)=>(i%2?creditA:creditB).apply(credit)));
  assert.equal(remoteAttempts,1);assert.equal((await db("o_quota_ledger")).length,1);
  await assert.rejects(()=>creditA.apply({...credit,userId:888}));
  await db.raw(`CREATE TABLE xoi_model_budgets(user_id bigint,billing_id uuid PRIMARY KEY,state text,expires_at timestamptz,limit_quota bigint,reserved_quota bigint,calls integer,free_only boolean NOT NULL DEFAULT false);
    CREATE TABLE xoi_billing_links(user_id bigint,billing_id uuid,request_id text);
    CREATE TABLE logs(user_id bigint,request_id text,quota bigint,type integer);
    CREATE TABLE xoi_generation_tasks(user_id bigint,status text,payload text);
    CREATE TABLE fixture_wallets(id integer PRIMARY KEY,quota bigint);INSERT INTO fixture_wallets VALUES(1,100);`);
  const authResults=await Promise.allSettled(Array.from({length:40},()=>db!.transaction(async trx=>{
    const wallet=await trx("fixture_wallets").where("id",1).forUpdate().first();
    const held=await accountBudgetHold(trx,1,true);if(Number(wallet.quota)-held<20)throw new Error("No available authorization");
    await trx("xoi_model_budgets").insert({user_id:1,billing_id:crypto.randomUUID(),state:"active",expires_at:new Date(Date.now()+60000),limit_quota:20,reserved_quota:0,calls:0});
  })));
  assert.equal(authResults.filter(r=>r.status==="fulfilled").length,5);assert.equal(await accountBudgetHold(db,1,true),100);
  // The tiny finite token for server-enforced free-only calls is NOT a spending hold.
  await db("xoi_model_budgets").insert({user_id:2,billing_id:crypto.randomUUID(),state:"active",expires_at:new Date(Date.now()+60000),limit_quota:50,reserved_quota:0,calls:0,free_only:true});
  assert.equal(await accountBudgetHold(db,2,false),0);
  // Synthetic 2000 distinct users prove isolation, not real HTTP concurrency capacity.
  for(let start=0;start<2000;start+=40)await Promise.all(Array.from({length:40},(_,offset)=>ratesA.take("test-2000",`fixture-${start+offset}`,60000,10,120000)));
  assert.equal(Number((await db("xoi_rate_windows").where("scope","test-2000").count("key_hash as count").first() as any).count),2000);
  const report={passed:true,sharedRateAdmission:{attempts:200,accepted:10},sharedModelConcurrency:{globalAccepted:32,userAccepted:3,expiryRecovered:true},concurrentCredit:{attempts:100,externalMockAttempts:remoteAttempts},crossAccountReplayBlocked:true,accountBudgetAllocation:{attempts:40,accepted:5,totalHeld:100,available:0},syntheticUsers:2000,production2000OnlineVerified:false,paidRequests:0,realBalanceMutations:0};
  await writeFile("/tmp/xoi-credit-security-pg-20261014.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
void main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(async()=>{
  await db?.destroy();if(created)await admin.query(`DROP SCHEMA ${name} CASCADE`);await admin.end();
});
