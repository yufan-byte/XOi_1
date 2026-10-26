/** Real concurrent PG admissions on an isolated fixture table; no users/tokens/logs or model calls. */
import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { BUDGET_RESERVATION_QUERY } from "../src/utils/budgetReservationQuery";
async function main() {
  const pool=new pg.Pool({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL,max:8});
  const name=`xoi_budget_fixture_${crypto.randomUUID().replace(/-/g,"")}`;
  assert.match(name,/^xoi_budget_fixture_[a-f0-9]{32}$/);
  const id=crypto.randomUUID();let created=false;
  const sql=BUDGET_RESERVATION_QUERY.replace("xoi_model_budgets",name);
  try {
    await pool.query(`CREATE TABLE ${name} (user_id bigint,billing_id uuid,claimed_at timestamptz,state text,expires_at timestamptz,reserved_quota bigint,limit_quota bigint,calls integer,max_calls integer,pricing_hash text,token_id bigint,PRIMARY KEY(user_id,billing_id))`);created=true;
    await pool.query(`INSERT INTO ${name} VALUES (1,$1,now(),'active',now()+interval '30 minutes',0,100,0,20,NULL,NULL)`,[id]);
    const results=await Promise.all(Array.from({length:40},()=>pool.query(sql,[30,"price",999,1,id])));
    assert.equal(results.filter(r=>r.rowCount===1).length,3);
    let row=(await pool.query(`SELECT * FROM ${name}`)).rows[0];assert.equal(Number(row.reserved_quota),90);assert.equal(row.calls,3);
    assert.equal((await pool.query(sql,[1,"price",999,2,id])).rowCount,0);
    await pool.query(`UPDATE ${name} SET reserved_quota=0,calls=0,limit_quota=0,max_calls=4`);
    const free=await Promise.all(Array.from({length:40},()=>pool.query(sql,[0,"price",999,1,id])));
    assert.equal(free.filter(r=>r.rowCount===1).length,4);
    await pool.query(`UPDATE ${name} SET state='stopped',calls=0`);
    assert.equal((await pool.query(sql,[0,"price",999,1,id])).rowCount,0);
    await pool.query(`UPDATE ${name} SET state='active',expires_at=now()-interval '1 second'`);
    assert.equal((await pool.query(sql,[0,"price",999,1,id])).rowCount,0);
    console.log(JSON.stringify({passed:true,parallelRequests:40,admittedPaidFixture:3,admittedFreeFixture:4,crossUserBlocked:true,stoppedAndExpiredBlocked:true,realBalanceChanges:0,paidRequests:0}));
  } finally {if(created)await pool.query(`DROP TABLE ${name}`);await pool.end();}
}
void main().catch(error=>{console.error(`预算并发夹具验证失败：${error.message}`);process.exitCode=1;});
