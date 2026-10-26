import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPricingOptions, unsupportedNewTaskModel, referenceVideoBillingExpression } from "../lib/model-catalog/sync-options";
import { upstreamGroupForChannel } from "../lib/model-catalog/sync";
import { evaluateBillingExpression } from "../lib/model-catalog/expression";

test("sync removes token zero placeholders but preserves genuine free request models and other channels", () => {
  const options = { ModelPrice: JSON.stringify({ text: 0, agnes: 0, local: 2 }), ModelRatio: '{"local":3}', GroupRatio: '{"default":1.5}' };
  const maps = buildPricingOptions(options, [
    { model_name: "text", quota_type: 0, model_price: 0, model_ratio: 0.5, completion_ratio: 5 },
    { model_name: "agnes", quota_type: 1, model_price: 0 },
    { model_name: "request", quota_type: 1, model_price: 2 },
  ], 1.2);
  assert.equal("text" in maps.ModelPrice, false);
  assert.equal(maps.ModelPrice.agnes, 0);
  assert.equal(maps.ModelPrice.request, 2.4);
  assert.equal(maps.ModelPrice.local, 2);
  assert.equal(maps.ModelRatio.local, 3);
  assert.equal(maps.ModelRatio.text, 0.6);
  assert.equal(maps.CompletionRatio.text, 5);
  assert.equal("GroupRatio" in maps, false);
  assert.equal(options.GroupRatio, '{"default":1.5}');
});
test("expression token billing keeps mode/cache and scales final expression exactly once", () => {
  const row = { model_name: "gpt", quota_type: 0, model_price: 0, billing_expr: 'let rate = 2; p * rate + c * 8', billing_mode: "expression", cache_ratio: 0.1, create_cache_ratio: 1.25 };
  const first = buildPricingOptions({ ModelPrice: '{"gpt":0}' }, [row], 1.3);
  const second = buildPricingOptions(Object.fromEntries(Object.entries(first).map(([k,v]) => [k,JSON.stringify(v)])), [row], 1.3);
  assert.deepEqual(second, first);
  assert.equal("gpt" in first.ModelPrice, false);
  assert.equal(first.CacheRatio.gpt, 0.1);
  assert.equal(first.CreateCacheRatio.gpt, 1.25);
  assert.equal(first["billing_setting.billing_mode"].gpt, "expression");
  assert.equal(evaluateBillingExpression(first["billing_setting.billing_expr"].gpt, { p: 1, c: 1 }, {}, {}), 13);
});
test("invalid numeric prices are rejected before any options are written", () => {
  assert.throws(() => buildPricingOptions({}, [{ model_name: "bad", model_ratio: NaN }], 1));
  assert.throws(() => buildPricingOptions({}, [], 0));
});
test("excluded incompatible models retain their prior valid mode/expression pair", () => {
  const maps = buildPricingOptions({
    "billing_setting.billing_expr": '{"excluded":"tier(\\"default\\", 16)"}',
    "billing_setting.billing_mode": '{"excluded":"tiered_expr"}',
  }, [{model_name:"available",quota_type:1,model_price:2}], 1);
  assert.equal(maps["billing_setting.billing_expr"].excluded, 'tier("default", 16)');
  assert.equal(maps["billing_setting.billing_mode"].excluded, "tiered_expr");
});
test("only explicitly incompatible new task models may be quarantined", () => {
  const rows = [{ model_name: "seedance-new" }];
  const error = new Error("model seedance-new: expression references usage keys [seconds] but the model has no task plugin usage schema");
  assert.equal(unsupportedNewTaskModel(error, new Set(), rows), "seedance-new");
  assert.equal(unsupportedNewTaskModel(error, new Set(["seedance-new"]), rows), undefined);
  assert.equal(unsupportedNewTaskModel(error, new Set(["seedance-new"]), rows, true), "seedance-new");
  assert.equal(unsupportedNewTaskModel(error, new Set(), [], true), undefined);
  assert.equal(unsupportedNewTaskModel(new Error("timeout"), new Set(), rows, true), undefined);
  assert.equal(unsupportedNewTaskModel(new Error("timeout"), new Set(), rows), undefined);
});
test("promoted reference video contract is billed 1.5x even if public upstream expression omits it, never twice", () => {
  const row = { model_name: "seedance2.0-line1-fast", billing_expr: 'tier("default", u("seconds") * 0.5)' };
  const expression = referenceVideoBillingExpression(row)!;
  assert.equal(referenceVideoBillingExpression({ ...row, billing_expr: expression }), expression);
  const maps = buildPricingOptions({}, [row], 1.3);
  assert.equal(evaluateBillingExpression(maps["billing_setting.billing_expr"][row.model_name], {}, {}, { seconds: 5, billing_ref_video: "true" }), 4.875);
  assert.equal(evaluateBillingExpression(maps["billing_setting.billing_expr"][row.model_name], {}, {}, { seconds: 5, billing_ref_video: "false" }), 3.25);
  assert.equal(referenceVideoBillingExpression({ ...row, model_name: "other-video" }), row.billing_expr);
});
test("fixed upstream groups are derived from legacy channel names instead of their shared zaowu-all tag", () => {
  const previous = process.env.XOI_UPSTREAM_BILLING_GROUP;
  delete process.env.XOI_UPSTREAM_BILLING_GROUP;
  try {
    assert.equal(upstreamGroupForChannel({ tag: "zaowu-xoi", name: "zaowu-xoi" }), "xoi");
    assert.equal(upstreamGroupForChannel({ tag: "zaowu-all", name: "zaowu-claude-kiro" }), "claude-kiro");
    assert.equal(upstreamGroupForChannel({ tag: "zaowu-all", name: "zaowu-gpt-pro-enterprise" }), "gpt-pro-enterprise");
    assert.equal(upstreamGroupForChannel({ tag: "zaowu-all", name: "zaowu-default" }), "default");
    process.env.XOI_UPSTREAM_BILLING_GROUP = "custom-default";
    assert.equal(upstreamGroupForChannel({ tag: "zaowu-all", name: "zaowu-default" }), "custom-default");
  } finally {
    if (previous === undefined) delete process.env.XOI_UPSTREAM_BILLING_GROUP;
    else process.env.XOI_UPSTREAM_BILLING_GROUP = previous;
  }
});
