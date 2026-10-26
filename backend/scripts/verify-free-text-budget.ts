/** Local real zero-price test. No settings, balances or paid models are changed. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
const base="http://localhost:12121/api";
const db=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL});
let token="",id="";
async function request(path:string,body?:unknown,step?:string){
  const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(step?{"X-Xoi-Billing-Id":id,"X-Xoi-Billing-Step":step}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
  return {status:response.status,data:await response.json()};
}
async function main(){
  await db.connect();
  try{
    const user=(await db.query('SELECT session_version FROM o_user WHERE id=1')).rows[0];
    const before=Number((await db.query('SELECT quota FROM users WHERE id=1')).rows[0].quota);
    const secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',['tokenKey'])).rows[0].value;
    token=jwt.sign({id:1,session_version:Number(user.session_version||0)},secret,{expiresIn:600});
    const model="agnes-2.5-flash",body={model,stream:false,max_tokens:60,messages:[{role:"user",content:"验收：只回复测试通过四个字，不使用工具。"}]};
    const catalog=await request('/model-catalog');
    assert.equal(catalog.data.data.find((r:any)=>r.modelName===model)?.price?.yuan,0);
    const options=(await db.query('SELECT value FROM options WHERE key=$1',['ModelPrice'])).rows[0];
    assert.equal(JSON.parse(options.value)[model],0);
    const channels=(await db.query('SELECT id,models FROM channels WHERE status=1')).rows.filter((r:any)=>String(r.models).split(',').includes(model));
    assert.equal(channels.length,1);assert.equal(Number(channels[0].id),1);
    const preview=await request('/billing/preview',{path:'/workflow/canvas-text',body});assert.equal(preview.data.data.free,true);
    const zero=await request('/billing/authorize',{path:'/workflow/canvas-text',points:0,model});assert.equal(zero.status,400);assert.match(zero.data.message,/不支持零额度/);
    const auth=await request('/billing/authorize',{path:'/workflow/canvas-text',points:.001,model});assert.equal(auth.status,200);id=auth.data.data.id;
    const firstStep=randomUUID(),first=await request('/v1/chat/completions',body,firstStep);assert.equal(first.status,200,JSON.stringify(first));assert.ok(first.data.choices?.length);
    const second=await request('/v1/chat/completions',body,randomUUID());assert.equal(second.status,200,JSON.stringify(second));
    const replay=await request('/v1/chat/completions',body,firstStep);assert.equal(replay.status,428);
    await request('/billing/budget/'+id+'/stop',{});
    const stopped=await request('/v1/chat/completions',body,randomUUID());assert.equal(stopped.status,428);
    const receipt=await request('/billing/receipt/'+id);assert.equal(receipt.data.data.points,0);
    const after=Number((await db.query('SELECT quota FROM users WHERE id=1')).rows[0].quota);assert.equal(after,before);
    const logs=(await db.query('SELECT type,quota,model_name,channel_id FROM logs WHERE request_id IN (SELECT request_id FROM xoi_billing_links WHERE user_id=1 AND billing_id=$1)',[id])).rows;
    assert.ok(logs.length>=2);assert.ok(logs.every((r:any)=>Number(r.quota)===0&&Number(r.channel_id)===1));
    const report={passed:true,zeroBudgetRejectedSafely:true,budgetPoints:.001,actualCalls:2,replayBlocked:true,afterStopBlocked:true,deltaPoints:0,paidRequests:0,receipt:receipt.data.data,logs};
    await writeFile('/tmp/xoi-free-text-budget-20261014.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{if(id)await request('/billing/budget/'+id+'/stop',{}).catch(()=>{});await db.end();}
}
void main().catch(error=>{console.error(error.message);process.exitCode=1});
