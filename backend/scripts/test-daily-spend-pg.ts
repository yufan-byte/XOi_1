/** Synthetic ledger in an owned random local schema; never inserts real consumption. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import knex from 'knex';
import pg from 'pg';
import {DailySpendStore} from '../src/lib/gateway/dailySpendStore';
import {dailySpendWindow} from '../src/utils/dailySpendPolicy';
async function main(){
 const url=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url!).hostname));
 const schema='xoi_daily_fixture_'+crypto.randomBytes(12).toString('hex');assert.match(schema,/^xoi_daily_fixture_[a-f0-9]{24}$/);
 const admin=new pg.Client({connectionString:url});await admin.connect();let created=false;let db:ReturnType<typeof knex>|undefined;
 try{
  await admin.query(`CREATE SCHEMA "${schema}"`);created=true;
  db=knex({client:'pg',connection:{connectionString:url},searchPath:[schema],pool:{min:0,max:8}});
  await db.raw('CREATE TABLE logs(user_id bigint,type integer,quota bigint,created_at bigint)');
  let now=Date.parse('2026-10-20T15:00:00Z');const store=new DailySpendStore(db,()=>now),window=dailySpendWindow(now);
  await db('logs').insert([{user_id:1,type:2,quota:10_000_000,created_at:window.start+1},{user_id:1,type:2,quota:-1000,created_at:window.start+2},{user_id:2,type:2,quota:50_000_000,created_at:window.start+3},{user_id:1,type:1,quota:100_000_000,created_at:window.start+4},{user_id:1,type:2,quota:50_000_000,created_at:window.start-1}]);
  const status=await store.status(1);assert.equal(status.todayYuan,20);assert.equal(status.todayPoints,200);assert.equal(status.blocking,false);
  await store.save(1,20);const claims=await Promise.all(Array.from({length:16},()=>store.claim(1)));assert.equal(claims.filter(c=>c.claimed).length,1);
  assert.equal((await store.status(2)).dailyWarningYuan,20);assert.equal((await store.status(2)).todayYuan,100);
  await store.save(1,0);assert.equal((await store.claim(1)).claimed,false);await store.save(1,30);assert.equal((await store.claim(1)).claimed,false);
  const second=new DailySpendStore(db,()=>now);assert.equal((await second.status(1)).dailyWarningYuan,30);
  await store.save(1,20);assert.equal((await store.claim(1)).claimed,false);
  now=Date.parse('2026-10-20T16:00:01Z');assert.equal((await store.status(1)).todayYuan,0);assert.equal((await store.claim(1)).claimed,false);
  console.log(JSON.stringify({passed:true,checks:['Beijing-day-boundary','only-own-real-consumption','refund-topup-old-day-excluded','16-concurrent-tabs-one-notice','settings-cross-instance','disable-no-block','changed-threshold','next-day-reset'],paidRequests:0,realLedgerWrites:0}));
 }finally{await db?.destroy();if(created)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
