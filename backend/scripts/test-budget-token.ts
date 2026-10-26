/** Exercise the real preparation/claim functions with transaction-local token/budget fixtures. No network model call. */
import "dotenv/config";
// Match app bootstrap order: the legacy utils facade captures the db export.
import "../src/utils";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {mock} from "node:test";
import {db,dbReady} from "../src/utils/db";
import {runWithGatewayUser} from "../src/lib/gateway/context";
import {claimModelBudget,prepareBudgetedGatewayRequest,stopCurrentBudget} from "../src/lib/gateway/budgets";
import {newApiV1BaseUrl} from "../src/lib/gateway/newapi";
async function main(){
  await dbReady;
  const id=crypto.randomUUID();
  await db.transaction(async trx=>{
    await trx.raw(`CREATE TEMP TABLE xoi_model_budgets(user_id bigint,billing_id uuid,operation_path text,limit_quota bigint,reserved_quota bigint DEFAULT 0,calls integer DEFAULT 0,max_calls integer,state text DEFAULT 'active',stop_reason text,pricing_hash text,token_id bigint,claimed_at timestamptz,expires_at timestamptz,PRIMARY KEY(user_id,billing_id)) ON COMMIT DROP`);
    await trx.raw(`CREATE TEMP TABLE tokens(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id bigint,key text,status int,name text,created_time bigint,accessed_time bigint,expired_time bigint,remain_quota bigint,unlimited_quota boolean,model_limits_enabled boolean,model_limits text,allow_ips text,used_quota bigint,"group" text,cross_group_retry boolean,deleted_at timestamptz) ON COMMIT DROP`);
    await trx.raw("CREATE TEMP TABLE options(key text,value text) ON COMMIT DROP");
    const group=String((await trx("users").where("id",1).first()).group);
    await trx.raw("INSERT INTO options VALUES ('ModelPrice',?),('GroupRatio',?)",[JSON.stringify({'fixture-budget-free':0}),JSON.stringify({[group]:1})]);
    await trx.raw("INSERT INTO xoi_model_budgets(user_id,billing_id,operation_path,limit_quota,max_calls,expires_at) VALUES (1,?,'/v1/chat/completions',100000,20,now()+interval '30 minutes')",[id]);
    const raw=mock.method(db,"raw",(...args:any[])=>(trx.raw as any)(...args));
    const transaction=mock.method(db,"transaction",async (fn:any)=>fn(trx));
    try {
      await assert.rejects(()=>claimModelBudget(2,id,'/v1/chat/completions'));
      await assert.rejects(()=>claimModelBudget(1,id,'/v1/images/generations'));
      await claimModelBudget(1,id,'/v1/chat/completions');
      await assert.rejects(()=>claimModelBudget(1,id,'/v1/chat/completions'));
      const result=await runWithGatewayUser(1,()=>prepareBudgetedGatewayRequest(`${newApiV1BaseUrl()}/chat/completions`,'POST',{model:'fixture-budget-free',messages:[{role:'user',content:'fixture only'}],max_tokens:999999}),id);
      assert.match(result.apiKey,/^sk-[A-Za-z0-9]{48}$/);assert.equal(result.body.max_tokens,4096);
      const token=(await trx.raw("SELECT * FROM tokens")).rows[0];assert.equal(token.unlimited_quota,false);assert.equal(Number(token.remain_quota),100000);assert.ok(Number(token.expired_time)>Date.now()/1000);
      const budget=(await trx.raw("SELECT * FROM xoi_model_budgets")).rows[0];assert.equal(budget.calls,1);assert.equal(Number(budget.reserved_quota),0);assert.equal(Number(budget.token_id),Number(token.id));
      await runWithGatewayUser(1,()=>stopCurrentBudget('本次导演方案请求已结束'),id);
      assert.equal((await trx.raw("SELECT state FROM xoi_model_budgets")).rows[0].state,'stopped');
      await assert.rejects(()=>runWithGatewayUser(1,()=>prepareBudgetedGatewayRequest(`${newApiV1BaseUrl()}/chat/completions`,'POST',{model:'fixture-budget-free',messages:[]}),id));
    } finally {raw.mock.restore();transaction.mock.restore();}
  });
  console.log(JSON.stringify({passed:true,finiteExpiringToken:true,replayAndCrossUserBlocked:true,realTokenWrites:0,paidRequests:0}));
}
void main().catch(error=>{console.error(`任务令牌临时夹具验证失败：${error.message}`);process.exitCode=1;}).finally(()=>db.destroy());
