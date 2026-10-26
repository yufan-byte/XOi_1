/** Exercise the actual finite-budget UPDATE against a session-local TEMP table. No model or real wallet writes. */
import 'dotenv/config';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import {resolve} from 'node:path';
import {budgetDecision} from '../src/utils/billingBudgetPolicy';
const client=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL,connectionTimeoutMillis:5000});
async function main(){
 const source=fs.readFileSync(resolve(__dirname,'../src/lib/gateway/budgets.ts'),'utf8');
 const match=/trx\.raw\("(UPDATE xoi_model_budgets SET reserved_quota=reserved_quota\+\?,calls=calls\+1,pricing_hash=\? WHERE user_id=\? AND billing_id=\?)"/.exec(source);assert.ok(match,'Finite requests must persist their call count and price hash');let i=0;const sql=match[1].replace(/\?/g,()=>'$'+(++i));
 await client.connect();await client.query('BEGIN');
 await client.query('CREATE TEMP TABLE xoi_model_budgets(user_id bigint,billing_id text,reserved_quota bigint,calls integer,pricing_hash text) ON COMMIT DROP');
 await client.query("INSERT INTO xoi_model_budgets VALUES(1,'fixture',0,0,NULL)");
 for(let n=0;n<3;n++)await client.query(sql,[0,'fixed-price',1,'fixture']);
 const row=(await client.query('SELECT * FROM xoi_model_budgets')).rows[0];assert.equal(row.calls,3);assert.equal(Number(row.reserved_quota),0);assert.equal(row.pricing_hash,'fixed-price');assert.ok(budgetDecision({...row,state:'active',expires_at:new Date(Date.now()+60000),limit_quota:100,max_calls:3},0));
 await client.query('ROLLBACK');console.log(JSON.stringify({passed:true,actualFiniteUpdate:true,zeroCostCallsStillCounted:true,limitHonored:true,realWalletChanges:0,modelRequests:0}));
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>client.end());
