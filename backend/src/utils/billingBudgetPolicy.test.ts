import test from "node:test";
import assert from "node:assert/strict";
import {billingExpressionUpperBound} from "../lib/model-catalog/expression";
import {boundGatewayRequest,budgetDecision,normalizeBudgetPath,budgetCallLimit,directorBudgetDecision,BUDGET_OUTPUT_TOKENS} from "./billingBudgetPolicy";
test('director single-call authorization cannot opt into a bulk automatic budget',()=>{
 for(const path of ['/api/aiAssistant/director/scene-tasks','/aiassistant/director/plan','/aiassistant/director/compose']){assert.ok(directorBudgetDecision(path,true));assert.equal(directorBudgetDecision(path,false),undefined);assert.equal(budgetCallLimit(path),1);}
 assert.equal(directorBudgetDecision('/workflow/one-stop',true),undefined);
});
test("interval bounds cover all token tiers/cache branches, not just the optimistic estimate",()=>{
  const expression='max(len, cr + cc) > 100 ? tier("long", p * 10 + c * 20 + cr * 2) : tier("normal", p * 1 + c * 2)';
  assert.equal(billingExpressionUpperBound(expression,{p:100,c:50,len:150,cr:100,cc:100},{},{}),2200);
  assert.equal(billingExpressionUpperBound('(p - cr) * 2 + cr * 5',{p:100,cr:100},{},{}),700);
  assert.throws(()=>billingExpressionUpperBound('u("upstream_cost") * 2',{}, {},{}));
  assert.throws(()=>billingExpressionUpperBound('p / c',{p:100,c:10},{},{}));
});
test("request clamps real output/n, preserves caller input, and reserves pessimistic text price",()=>{
  const body={model:"test",messages:[{role:"user",content:"你好"}],max_tokens:999999};
  const bounded=boundGatewayRequest('/v1/chat/completions',body,{model_ratio:1,completion_ratio:2,quota_type:0},1);
  assert.equal(bounded.body.max_tokens,BUDGET_OUTPUT_TOKENS);assert.equal(body.max_tokens,999999);
  assert.ok(bounded.quota>8192);
  const response=boundGatewayRequest('/v1/responses',{model:"test",input:"hi"},{model_ratio:1,completion_ratio:2},1);
  assert.equal(response.body.max_output_tokens,BUDGET_OUTPUT_TOKENS);assert.equal(response.body.max_tokens,undefined);assert.equal(response.body.n,undefined);
});
test("video reserve includes most expensive resolution and reference-video 1.5x surcharge",()=>{
  const result=boundGatewayRequest('/v1/videos',{model:"video",seconds:"5",resolution:"480p"},{billing_expr:'(u("billing_resolution") == "720p" ? u("seconds") * .5 : u("seconds") * .39) * (u("billing_ref_video") == "true" ? 1.5 : 1)'},1);
  assert.equal(result.quota,1875000);
  assert.throws(()=>boundGatewayRequest('/v1/videos',{model:"video"},{model_price:2,quota_type:1},1));
});
test("flat image and speech expression use request quantity and actual characters",()=>{
  assert.equal(boundGatewayRequest('/v1/images/generations',{model:"img",n:2},{model_price:.2,quota_type:1},1).quota,200000);
  const audio=boundGatewayRequest('/v1/audio/speech',{model:"tts",input:"测试"},{billing_expr:'max(count(split(string(param("input") ?? ""), "")), 1) * 1000'},1);
  assert.equal(audio.quota,1000);
});
test("unknown costs, multimodal tokens, native tools, invalid amounts and oversized requests fail closed",()=>{
  const rate={model_ratio:1,completion_ratio:1};
  for (const body of [{model:"a",messages:[{content:[{type:"image_url",image_url:{url:"https://example.test"}}]}]},{model:"a",messages:[{content:[{type:"input_file",file_id:"fixture"}]}]},{model:"a",previous_response_id:"fixture"},{model:"a",tools:[{type:"web_search_preview"}]},{model:"a",input:"a".repeat(400000)},{model:"a",n:9},{model:"a",max_tokens:-1}]) assert.throws(()=>boundGatewayRequest('/v1/chat/completions',body,rate,1));
  assert.throws(()=>boundGatewayRequest('/v1/audio/transcriptions',{model:"a"},rate,1));
  assert.throws(()=>boundGatewayRequest('/v1/images/generations',{model:"a"},{model_price:NaN,quota_type:1},1));
});
test("free local models still get output and call-count limits",()=>{
  const result=boundGatewayRequest('/v1/chat/completions',{model:"agnes",messages:[],max_tokens:90000},{model_price:0,quota_type:1},1);
  assert.equal(result.quota,0);assert.equal(result.body.max_tokens,BUDGET_OUTPUT_TOKENS);
});
test("media cannot borrow the chat output bound or guess unknown audio duration as zero",()=>{
  assert.throws(()=>boundGatewayRequest('/v1/images/generations',{model:"img"},{billing_expr:'p * 10 + c * 20'},1));
  // 封顶解释器覆盖不全时不再拦截：降级为不预留放行（实际费用由预算令牌硬性约束）。
  assert.equal(boundGatewayRequest('/v1/audio/speech',{model:"tts",input:"hello"},{billing_expr:'u("seconds") * 2'},1).quota,0);
  assert.equal(boundGatewayRequest('/v1/chat/completions',{model:"a",messages:[]},{billing_expr:'pow(p, 2)'},1).quota,0);
  assert.throws(()=>boundGatewayRequest('/v1/audio/speech',{model:"tts",input:"hello"},{billing_expr:'p * 2 + c * 10'},1));
  assert.ok(boundGatewayRequest('/v1/audio/speech',{model:"tts",input:"hello"},{billing_expr:'p * 2'},1).quota>0);
  const image=boundGatewayRequest('/v1/images/generations',{model:"img",resolution:"1K",n:1},{billing_expr:'param("resolution") == "4k" ? 500000 : 100000'},1);
  assert.equal(image.quota,250000);
});
test("floor/ceil/round in per-image pricing expressions stay boundable",()=>{
  const image=boundGatewayRequest('/v1/images/generations',{model:"img",n:1},{billing_expr:'66080 * max(1, floor(float(param("n") ?? 1)))'},1);
  assert.equal(image.quota,33040);
  const batch=boundGatewayRequest('/v1/images/generations',{model:"img",n:3},{billing_expr:'tier("default", 66080 * max(1, floor(float(param("n") ?? 1))))'},1);
  assert.equal(batch.quota,33040*3);
});
test("deepseek keeps the full 8K output budget and never forwards reasoning_effort",()=>{
  const bounded=boundGatewayRequest('/v1/chat/completions',{model:"deepseek-v4-flash",messages:[{role:"user",content:"hi"}],max_tokens:8192,reasoning_effort:"high"},{model_ratio:1,completion_ratio:2,quota_type:0,model_name:"deepseek-v4-flash"},1);
  assert.equal(bounded.body.max_tokens,8192);
  assert.equal(bounded.body.reasoning_effort,undefined);
  const disabled=boundGatewayRequest('/v1/chat/completions',{model:"deepseek-v4-flash",messages:[],max_tokens:2048,thinking:{type:"disabled"},reasoning_effort:"high"},{model_ratio:1,completion_ratio:2,quota_type:0,model_name:"deepseek-v4-flash"},1);
  assert.deepEqual(disabled.body.thinking,{type:"disabled"});
  assert.equal(disabled.body.reasoning_effort,undefined);
  const other=boundGatewayRequest('/v1/chat/completions',{model:"glm-4",messages:[],max_tokens:999999,reasoning_effort:"high"},{model_ratio:1,completion_ratio:2,quota_type:0,model_name:"glm-4"},1);
  assert.equal(other.body.max_tokens,BUDGET_OUTPUT_TOKENS);
  assert.equal(other.body.reasoning_effort,"high");
});
test("persistent task guard refuses exhausted, stopped, expired and zero-cost infinite calls",()=>{
  const row={state:"active",expires_at:new Date(Date.now()+10000),reserved_quota:50,limit_quota:100,calls:1,max_calls:20};
  assert.equal(budgetDecision(row,50),undefined);assert.ok(budgetDecision(row,51));
  assert.ok(budgetDecision({...row,calls:20},0));assert.ok(budgetDecision({...row,state:"stopped"},0));
  assert.ok(budgetDecision({...row,expires_at:new Date(0)},0));assert.ok(budgetDecision(row,NaN));
  assert.equal(normalizeBudgetPath('/api/socket/scriptAgent?x=1'),'/socket/scriptagent');
});

test("director proposals authorize one model call, while explicit workflows retain bounded multiple calls",()=>{
  assert.equal(budgetCallLimit('/api/aiAssistant/director/plan'),1);
  assert.equal(budgetCallLimit('/API/AIASSISTANT/DIRECTOR/COMPOSE?test=1'),1);
  assert.equal(budgetCallLimit('/workflow/canvas-text'),20);
  assert.equal(budgetCallLimit('/production/workbench/batchGenerateVideo'),20);
});
