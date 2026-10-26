import test from "node:test";
import assert from "node:assert/strict";
import { usageQuery, usageSource, usageAttributionQuery, usageRequestIds } from "./usageAttribution";
import { usageTitle, usageState, usageSign, usageCsvCell } from "../../../frontend/console/src/lib/usage-record";

test("usage filters survive proxying, without forwarding user IDs or injection", () => {
  const q = new URLSearchParams(usageQuery({ p: "2", page_size: "200", type: "2", model_name: "gpt&user_id=9", start_timestamp: "1790000000", end_timestamp: "1790010000", user_id: "9", token_name: ["bad"] }));
  assert.equal(q.get("p"), "2"); assert.equal(q.get("page_size"), "100");
  assert.equal(q.get("model_name"), "gpt&user_id=9"); assert.equal(q.get("user_id"), null);
  assert.equal(q.get("start_timestamp"), "1790000000"); assert.equal(q.has("token_name"), false);
  assert.equal(new URLSearchParams(usageQuery({p:"2"},true)).has("p"),false);
});
test("provenance SQL requires exact user/request/budget links and bounded IDs", () => {
  const sql = usageAttributionQuery(2);
  assert.match(sql, /b.request_id=l.request_id AND b.user_id=l.user_id/);
  assert.match(sql, /m.user_id=b.user_id AND m.billing_id=b.billing_id/);
  assert.match(sql, /WHERE l.user_id=\? AND l.request_id IN \(\?,\?\)/);
  assert.doesNotMatch(sql, /UPDATE|DELETE|INSERT|prompt|token_name/i);
  assert.throws(()=>usageAttributionQuery(101)); assert.throws(()=>usageAttributionQuery(0));
});
test("gateway page ordinals cannot be used as ledger IDs", () => {
  assert.deepEqual(usageRequestIds([{id:1,request_id:"request-A"},{id:2,request_id:"request-A"},{id:3,request_id:"request-B"},{id:4},{id:5,request_id:""},{id:6,request_id:"x".repeat(181)}]),["request-A","request-B"]);
});
test("only one unambiguous server-recorded feature is attributed", () => {
  const record = {billing_id:"test-id",operation_path:"/socket/productionAgent"};
  assert.equal(usageSource([record]).label,"导演 AI 助手");
  assert.equal(usageSource([]).status,"unknown");
  assert.equal(usageSource([record,record]).status,"unknown");
  assert.equal(usageSource([{...record,operation_path:"/not-allowlisted"}]).status,"unknown");
});
test("zero, refund, legacy and CSV display never invent a charge or feature", () => {
  assert.equal(usageState({type:2,quota:0}),"未扣积分"); assert.equal(usageSign({type:2,quota:0}),"");
  assert.equal(usageSign({type:2,quota:-5}),"+"); assert.equal(usageState({type:2,quota:-5}),"已退款");
  assert.match(usageTitle({type:2}),/来源未记录/);
  assert.equal(usageCsvCell('=HYPERLINK("secret")'),'"\'=HYPERLINK(""secret"")"');
  assert.equal(usageCsvCell('a,b\nc'),'"a,b\nc"');
});
