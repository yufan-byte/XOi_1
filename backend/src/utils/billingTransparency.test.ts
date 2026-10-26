import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { billableOperation, billableRoutes, BILLING_ID_PATTERN } from "../../../shared/billableOperations";
import { billingPreviewText, pricingBody } from "../../../frontend/src/utils/billingGate";
import { runWithGatewayUser, getGatewayRequestContext } from "../lib/gateway/context";
import { productionBillingBlockers, productionPricingBlockers } from "./productionBillingPolicy";
import { BILLING_RECEIPT_QUERY } from "./billingReceiptQuery";
test("all declared generation operations require a billing entry, but reads and local tools do not", () => {
  assert.ok(Object.keys(billableRoutes).length >= 35);
  for (const path of Object.keys(billableRoutes)) {
    assert.ok(billableOperation(`/api${path}?t=1`, "POST"));
    assert.ok(billableOperation(`/API${path.toUpperCase()}?t=1`, "POST"));
    assert.equal(billableOperation(`/api${path}`, "GET"), undefined);
  }
  assert.ok(billableOperation("http://localhost:10588/api/v1/images/generations","POST"));
  for (const path of ["/api/model-catalog/quote","/api/billing/preview","/api/canvas-files","/api/v1/canvas/image-tasks/status","/api/production/output/saveOutput","/api/viral/resolve","/api/v1/videos/123"]) assert.equal(billableOperation(path), undefined);
  for (const path of ["/novel/addNovel","/cornerScape/batchBindAudio","/aiAssistant/chat/stream","/aiAssistant/director/plan","/socket/scriptAgent","/socket/productionAgent"]) assert.ok(billableOperation(path));
});
test("preview uses yuan times ten and never relabels missing costs as free", () => {
  assert.match(billingPreviewText({ label:"生成",model:"即梦",count:1,quote:{yuan:.75} }), /7.5 积分（¥0.75）/);
  assert.match(billingPreviewText({ label:"生成",model:"即梦",count:1,quote:null }), /暂无可靠完整预估，不代表免费/);
  assert.match(billingPreviewText({ label:"批量",model:"模型",count:12,multiple:true,quote:{yuan:2} }), /单次调用参考/);
});
test("preview strips binary data, credentials and actual chapter contents", () => {
  const result = pricingBody({ model:"newapi:test",prompt:"hello",apiKey:"secret",images:["data:image/png;base64,secret"],videos:["private"],items:[{content:"private"}] });
  assert.equal(result.inputLength,5); assert.equal(result.hasReferenceVideo,true); assert.deepEqual(result.items,[0]);
  assert.equal(JSON.stringify(result).includes("secret"),false); assert.equal(JSON.stringify(result).includes("private"),false);
});
test("receipt context stays account scoped across concurrent asynchronous invocations", async () => {
  const ids = ["fe5a3ab2-23d6-41b5-8a66-57eb8e432a8e","05da3ab2-23d6-41b5-8a66-57eb8e432a8e"];
  await Promise.all(ids.map((id,index) => runWithGatewayUser(index+1, async () => { await Promise.resolve(); assert.deepEqual(getGatewayRequestContext(),{userId:index+1,billingId:id}); }, id)));
  assert.equal(getGatewayRequestContext(),undefined); assert.ok(BILLING_ID_PATTERN.test(ids[0])); assert.equal(BILLING_ID_PATTERN.test("../../other-user"),false);
});
test("receipt joins logs by BOTH request id and user, never by balance difference", () => {
  const source = fs.readFileSync(path.resolve(__dirname,"../lib/gateway/receipts.ts"),"utf8");
  assert.match(BILLING_RECEIPT_QUERY,/b\.request_id=l\.request_id AND b\.user_id=l\.user_id/);
  assert.match(BILLING_RECEIPT_QUERY,/WHERE b\.user_id=\? AND b\.billing_id=\?/);
  assert.match(source,/x-oneapi-request-id/);
  assert.doesNotMatch(source,/UPDATE.*quota|beforeBalance|afterBalance/);
});
test("automatic billable POST retries are disabled in shared SDK and inherited image services", () => {
  const ai = fs.readFileSync(path.resolve(__dirname,"./ai.ts"),"utf8");
  assert.equal((ai.match(/maxRetries: 0/g)||[]).length,2);
  const image = fs.readFileSync(path.resolve(__dirname,"../../../frontend/atelier/upstream/src/services/api/image.ts"),"utf8");
  assert.match(image,/requestWithTransientRetry\(run: \(\) => Promise<Response>, retries = 0\)/);
});
test("production gate rejects Agnes as a business default but permits an admin-only Agnes channel", () => {
  const agents = [{key:"scriptAgent",modelName:"newapi:agnes-test"}];
  const channels = [{status:1,models:"agnes-test,good-model"}];
  assert.equal(productionBillingBlockers(agents,channels).length,1);
  assert.deepEqual(agents,[{key:"scriptAgent",modelName:"newapi:agnes-test"}]);
  assert.deepEqual(productionBillingBlockers([{key:"scriptAgent",modelName:"newapi:good-model"}],[{status:1,models:"good-model"}]),[]);
});
test("production gate rejects failed/latest or stale price sync, not just a last good snapshot", () => {
  const now = Date.now();
  const good = {synced_at:new Date(now),snapshot:{status:"synced",rows:[{}]}};
  assert.deepEqual(productionPricingBlockers(good,now),[]);
  assert.ok(productionPricingBlockers({...good,snapshot:{...good.snapshot,lastAttemptStatus:"failed"}},now).length);
  assert.ok(productionPricingBlockers({...good,synced_at:new Date(now-3_600_001)},now).length);
  assert.ok(productionPricingBlockers(undefined,now).length);
});
