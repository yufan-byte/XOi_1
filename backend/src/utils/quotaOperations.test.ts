import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import {QuotaOperations} from "./quotaOperations";
async function fixture(t:any){const db=knex({client:"better-sqlite3",connection:{filename:":memory:"},useNullAsDefault:true});t.after(()=>db.destroy());
  await db.schema.createTable("o_quota_ledger",r=>{r.increments("id");r.integer("user_id");r.integer("delta");r.integer("quota_after");for(const key of ["type","description","reference_type","reference_id","created_at"])r.text(key);r.integer("operator_id");r.text("idempotency_key").unique();});return db;}
const input={userId:1,delta:100,type:"recharge",idempotencyKey:"payment:fixture-1",referenceId:"fixture-1"};
test("concurrent duplicate credits attempt the gateway only once, including another service instance",async t=>{
  const db=await fixture(t);let calls=0;const adjust=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return 1100;};
  const a=new QuotaOperations(db,adjust),b=new QuotaOperations(db,adjust);await Promise.all([a.ensure(),b.ensure()]);
  await Promise.allSettled(Array.from({length:40},(_,i)=>(i%2?a:b).apply(input)));
  assert.equal(calls,1);assert.equal((await db("o_quota_ledger")).length,1);
  assert.deepEqual(await new QuotaOperations(db,adjust).apply(input),{applied:false,quotaAfter:1100});assert.equal(calls,1);
});
test("same operation cannot credit another account or a modified amount",async t=>{
  const db=await fixture(t);let calls=0;const ops=new QuotaOperations(db,async()=>{calls++;return 1100;});await ops.apply(input);
  await assert.rejects(()=>ops.apply({...input,userId:2}),/不同用户/);await assert.rejects(()=>ops.apply({...input,delta:200}),/不同用户/);assert.equal(calls,1);
});
test("ambiguous network results survive restart and block old and new retry IDs",async t=>{
  const db=await fixture(t);let calls=0;const adjust=async()=>{calls++;throw new Error("remote might have applied then disconnected");};
  await assert.rejects(()=>new QuotaOperations(db,adjust).apply(input),/待核对/);
  const reboot=new QuotaOperations(db,adjust);await assert.rejects(()=>reboot.apply(input),/待核对/);
  await assert.rejects(()=>reboot.apply({...input,idempotencyKey:"payment:changed-id"}),/未核对/);assert.equal(calls,1);
  assert.equal((await db("xoi_quota_operations").first()).state,"unknown");assert.equal((await db("o_quota_ledger")).length,0);
});
test("missing operation IDs and unsafe/non-integral amounts fail before external mutation",async t=>{
  const db=await fixture(t);let calls=0;const ops=new QuotaOperations(db,async()=>{calls++;return 0;});
  for(const patch of [{idempotencyKey:undefined},{delta:.5},{delta:Infinity},{delta:Number.MAX_SAFE_INTEGER+1},{userId:0}])await assert.rejects(()=>ops.apply({...input,...patch}));assert.equal(calls,0);
});
test("failed audit persistence after remote success cannot cause automatic second credit",async t=>{
  const db=await fixture(t);let calls=0;const ops=new QuotaOperations(db,async()=>{calls++;await db.schema.dropTable("o_quota_ledger");return 1100;});
  await assert.rejects(()=>ops.apply(input),/待核对/);await assert.rejects(()=>ops.apply(input),/待核对/);assert.equal(calls,1);
});
