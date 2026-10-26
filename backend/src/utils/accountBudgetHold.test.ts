import test from "node:test";
import assert from "node:assert/strict";
import {budgetHold} from "./accountBudgetHold";
import {budgetModelDecision,normalizeBudgetPath,freeBudgetDecision} from "./billingBudgetPolicy";
test("automatic free consent stops price changes, token pricing and nonzero reservation",()=>{
  const pricing={quota_type:1,model_price:0};
  assert.equal(freeBudgetDecision(pricing),undefined);
  for(const [price,quota] of [[{...pricing,model_price:.01},0],[{...pricing,quota_type:0,model_ratio:0},0],[{...pricing,billing_expr:'0'},0],[pricing,1]] as const)assert.match(freeBudgetDecision(price,quota)!,/收费操作需要先确认/);
});
test("a pinned budget rejects model substitution and route case cannot bypass scope",()=>{
  assert.equal(budgetModelDecision("model-a","model-a"),undefined);
  assert.match(budgetModelDecision("model-a","model-b")!,/禁止更换/);
  assert.equal(normalizeBudgetPath("/API/Script/extractAssets/?x=1"),"/script/extractassets");
});
test("active budgets cannot pledge the same available quota to multiple tasks",()=>{
  const row={state:"active",expires_at:new Date(Date.now()+60000),limit_quota:100,reserved_quota:30};
  assert.equal(budgetHold(row,20,true),100);assert.equal(budgetHold(row,20,false),100);
});
test("unknown and expired tasks keep outstanding holds; batch writes cannot fake settlement",()=>{
  const row={state:"stopped",expires_at:new Date(0),limit_quota:100,reserved_quota:30};
  assert.equal(budgetHold(row,30,false),30);assert.equal(budgetHold(row,10,true),20);assert.equal(budgetHold(row,30,true),0);
  assert.equal(budgetHold({...row,state:"active"},0,true),30);
  assert.equal(budgetHold({...row,calls:2,recorded_calls:2,pending_tasks:0},10,true),0);
  assert.equal(budgetHold({...row,calls:2,recorded_calls:2,pending_tasks:1},10,true),20);
  assert.equal(budgetHold({...row,calls:2,recorded_calls:2,pending_tasks:0},10,false),30);
});
