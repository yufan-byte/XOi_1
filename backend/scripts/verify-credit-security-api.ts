/** Local negative-path checks; unavailable fixture model cannot reach a paid upstream. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
const db=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL});
const base="http://localhost:12121/api";let token="",budget="";const results:any[]=[];
async function request(path:string,body?:unknown,headers:Record<string,string>={}){
  const r=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{Authorization:token,"Content-Type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json()};
}
async function main(){await db.connect();try{
  const owner=(await db.query('SELECT session_version FROM o_user WHERE id=1')).rows[0];const secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',['tokenKey'])).rows[0].value;
  token="Bearer "+jwt.sign({id:1,session_version:Number(owner.session_version||0)},secret,{expiresIn:600});
  const before=Number((await db.query('SELECT quota FROM users WHERE id=1')).rows[0].quota);
  const fake=crypto.randomUUID(),body={model:"__xoi_security_unavailable__",messages:[{role:"user",content:"negative-path fixture"}],max_tokens:1};
  for(const [path,headers,status] of [
    ['/v1/chat/completions',{Authorization:''},401],
    ['/v1/chat/completions',{},428],
    ['/v1/chat/completions',{'X-Xoi-Billing-Id':fake},428],
    ['/CANVAS-IMAGE-TASKS',{},428],
    ['/v1/chat/completions',{Authorization:'Bearer '+jwt.sign({id:1},'not-the-server-secret')},401],
  ] as [string,Record<string,string>,number][]){const r=await request(path,body,headers);assert.equal(r.status,status);results.push({path,status,blocked:true});}
  assert.equal((await request('/billing/authorize',{path:'/v1/chat/completions',points:-1})).status,400);
  assert.equal((await request('/admin/credits',{target:'1',amount:1,reason:'negative-path fixture'})).status,400);
  const paid=(await db.query("SELECT key FROM jsonb_each((SELECT value::jsonb FROM options WHERE key='ModelPrice')) WHERE value::text NOT IN ('0','0.0') LIMIT 1")).rows[0]?.key;
  assert.ok(paid);assert.equal((await request('/billing/authorize',{path:'/v1/chat/completions',points:.001,model:paid,freeOnly:true})).status,400);
  const auth=await request('/billing/authorize',{path:'/v1/chat/completions',points:.001,model:'agnes-2.5-flash',freeOnly:true});assert.equal(auth.status,200);budget=auth.data.data.id;assert.equal(auth.data.data.freeOnly,true);
  const pinned=(await db.query('SELECT bound_model,free_only FROM xoi_model_budgets WHERE user_id=1 AND billing_id=$1',[budget])).rows[0];assert.equal(pinned.bound_model,'agnes-2.5-flash');assert.equal(pinned.free_only,true);
  assert.equal((await request('/v1/images/generations',body,{'X-Xoi-Billing-Id':budget})).status,428);
  const unknown=await request('/v1/chat/completions',body,{'X-Xoi-Billing-Id':budget});assert.equal(unknown.status,402);
  const receipt=await request('/billing/receipt/'+budget);assert.equal(receipt.data.data.budget.calls,0);assert.equal(receipt.data.data.budget.state,'stopped');
  const audit=await request('/admin/billing/security');assert.equal(audit.status,200);
  const after=Number((await db.query('SELECT quota FROM users WHERE id=1')).rows[0].quota);assert.equal(after,before);
  const links=Number((await db.query('SELECT count(*) FROM xoi_billing_links WHERE user_id=1 AND billing_id=$1',[budget])).rows[0].count);assert.equal(links,0);
  const leases=Number((await db.query('SELECT count(*) FROM xoi_model_leases WHERE user_id=1 AND expires_at>$1',[Date.now()])).rows[0].count);assert.equal(leases,0);
  const report={passed:true,results,invalidAmountBlocked:true,creditWithoutIdBlocked:true,confirmedModelPersisted:true,freeOnlyPersisted:true,paidAutoAuthorizationBlocked:true,wrongScopeBlocked:true,unknownModelBlockedBeforeGateway:true,capacityReleased:true,balanceChange:0,upstreamModelRequests:0,securityAudit:audit.data.data};
  await writeFile('/tmp/xoi-credit-security-api-20261014.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(budget)await request('/billing/budget/'+budget+'/stop',{}).catch(()=>{});await db.end();}}
void main().catch(e=>{console.error(e.message);process.exitCode=1});
