/** Five real, explicitly free Agnes requests under one automatic batch. No project or balance writes. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
async function main(){
 assert.equal(process.env.XOI_RUN_FREE_ONE_STOP_SMOKE,'1');const url=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url!).hostname));
 const db=new pg.Client({connectionString:url});await db.connect();
 try{
  const user=(await db.query('SELECT session_version FROM o_user WHERE id=1')).rows[0],secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',['tokenKey'])).rows[0].value;
  const authorization='Bearer '+jwt.sign({id:1,session_version:Number(user.session_version||0)},secret,{expiresIn:600});
  const api=async(path:string,body?:unknown,extra:Record<string,string>={})=>{const response=await fetch('http://localhost:12121/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization,'content-type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(180000)});const result=await response.json() as any;assert.equal(response.ok,true,result.message||'request failed');return result.data??result;};
  const model='agnes-2.5-flash';const preview=await api('/billing/preview',{path:'/workflow/canvas-text',body:{model,inputLength:30}});assert.equal(preview.free,true);assert.equal(preview.quote.yuan,0);
  const budget=await api('/billing/authorize',{path:'/workflow/canvas-text',model,points:.001,freeOnly:true,automatic:true});assert.equal(budget.automatic,true);assert.equal(budget.freeOnly,true);
  const results=await Promise.all(Array.from({length:5},()=>api('/v1/chat/completions',{model,messages:[{role:'user',content:'仅回复 OK，无需解释。'}],max_tokens:128,stream:false},{'x-xoi-billing-id':budget.id,'x-xoi-billing-step':crypto.randomUUID()})));
  assert.equal(results.length,5);assert.ok(results.every(r=>Array.isArray(r.choices)));
  const state=(await db.query('SELECT automatic,free_only,calls,state,reserved_quota,token_id FROM xoi_model_budgets WHERE user_id=1 AND billing_id=$1',[budget.id])).rows[0];assert.equal(state.calls,5);assert.equal(state.automatic,true);assert.equal(state.free_only,true);assert.equal(state.state,'active');assert.equal(Number(state.reserved_quota),0);assert.equal(state.token_id,null);
  const receipt=await api('/billing/receipt/'+budget.id);assert.equal(receipt.points,0);
  await api('/billing/budget/'+budget.id+'/stop',{});
  console.log(JSON.stringify({passed:true,realFreeCalls:5,concurrentBatch:true,oneAuthorization:true,noGuessedBudgetStop:true,paidRequests:0,receiptPoints:0}));
 }finally{await db.end();}
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
