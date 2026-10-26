import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateBillingExpression } from "@/lib/model-catalog/expression";
import { buildCatalog, quoteModel, publicModel, inferKind, isAgnesModel, selectCatalogModel } from "@/lib/model-catalog";
import { metadataFromCards } from "@/lib/model-catalog/cards";

test("video floors, parameter tiers and upstream cost use lazy expression evaluation", () => {
  const expr = 'let cost = u("upstream_cost") ?? 0; let ours = u("billing_resolution") == "1080p" ? tier("hd", u("seconds") < 5 ? 10 : u("seconds") * 2) : tier("default", u("seconds") * 1); cost > ours ? tier("actual", cost) : ours';
  assert.equal(evaluateBillingExpression(expr, {}, {}, { seconds: 3, billing_resolution: "1080p", upstream_cost: 0 }), 10);
  assert.equal(evaluateBillingExpression(expr, {}, {}, { seconds: 8, billing_resolution: "1080p", upstream_cost: 20 }), 20);
  assert.equal(evaluateBillingExpression(expr, {}, {}, { seconds: 8, billing_resolution: "720p", upstream_cost: 0 }), 8);
});
test("quote uses the selected image tier, count and retail factor exactly once", () => {
  const [model] = buildCatalog([{ model_name: "gpt-image-2", billing_expr: 'param("size") in ["2K","4K"] ? tier("hd", 200000 * param("n")) : tier("default", 100000 * param("n"))' }]);
  const quote = quoteModel(model, { size: "4K", n: 3 }, 1.3);
  assert.ok(Math.abs(quote.yuan - 0.78) < 1e-9);
  assert.ok(Math.abs(quote.points - 7.8) < 1e-9);
  assert.equal(quote.pointsPerYuan, 10);
});
test("per-request video prices do not multiply by seconds", () => {
  const [model] = buildCatalog([{ model_name: "sora-test", quota_type: 1, model_price: 2 }]);
  assert.equal(quoteModel(model, { seconds: 10 }, 1.2).points, 24);
  const [text] = buildCatalog([{ model_name: "gpt-per-request", quota_type: 1, model_price: 2 }]);
  assert.equal(publicModel(text, 1.2).price?.points, 24);
  assert.equal(publicModel(text, 1.2).price?.unit, "次");
  const [expressionText] = buildCatalog([{ model_name: "gpt-expression", quota_type: 1, model_price: 2, billing_expr: 'p * 2 + c * 8' }]);
  assert.equal(publicModel(expressionText, 1).price?.yuan, 2);
  assert.equal(publicModel(expressionText, 1).outputPrice?.yuan, 8);
});
test("token input and output rates differ, zero price remains zero", () => {
  const [model] = buildCatalog([{ model_name: "deepseek-test", model_ratio: 2, completion_ratio: 4 }]);
  assert.equal(quoteModel(model, { inputTokens: 1000, outputTokens: 500 }).yuan, 0.012);
  const [free] = buildCatalog([{ model_name: "agnes-test", model_ratio: 0 }]);
  assert.equal(quoteModel(free).points, 0);
});
test("unknown expressions cannot silently become free; public catalog contains no cost formula", () => {
  const [model] = buildCatalog([{ model_name: "gpt-test", billing_expr: 'unknown("price")' }]);
  assert.throws(() => quoteModel(model));
  const visible = publicModel(model, 1.3);
  assert.equal(visible.price, null);
  assert.equal("pricing" in visible, false);
  assert.throws(() => evaluateBillingExpression('globalThis.process.exit()', {}, {}, {}));
});
test("a zero estimate depending on upstream actual cost is unknown, not free", () => {
  const [model] = buildCatalog([{model_name:"video-cost-based",billing_expr:'tier("actual", u("upstream_cost"))'}]);
  assert.throws(()=>quoteModel(model),/上游实际成本/);
  assert.equal(publicModel(model,1).price,null);
});
test("audio character minimum is interpreted, video and image models are classified", () => {
  const [audio] = buildCatalog([{ model_name: "tts-1", billing_expr: 'p * 1000' }]);
  assert.equal(quoteModel(audio, { input: "甲乙丙", outputTokens: 0 }).yuan, 0.003);
  assert.equal(evaluateBillingExpression('tier("default", max(float(count(split(string(param("input") ?? ""), ""), true)), 15) * 1440)', {}, { input: "短句" }, {}), 21600);
  assert.equal(inferKind("gemini-3.1-flash-tts"), "audio");
  assert.equal(inferKind("agnes-video-2.5"), "video");
  assert.equal(inferKind("wan2.7-image"), "image");
});
test("video recommendations prioritize the three promoted families, never overwrite prices", () => {
  const rows = [
    { model_name: "seedance-2.0-720p-discount", billing_expr: 'tier("default", 6)' },
    { model_name: "seedance2.0-line1-xoi", billing_expr: 'u("seconds") * (u("billing_resolution") == "480p" ? 0.64 : 0.75)' },
    { model_name: "seedance2.5-line1-xoi", billing_expr: 'u("seconds") * 1.09' },
    { model_name: "seedance2.0-line1-fast-xoi", billing_expr: 'u("seconds") * 0.50' },
    { model_name: "seedance2.0-full", billing_expr: 'tier("default", 7.5)' },
    { model_name: "kling-3.0-turbo", model_price: 1 },
  ];
  const models = buildCatalog(rows);
  assert.deepEqual(models.filter(m => m.recommended).map(m => m.modelName), ["seedance2.0-line1-xoi", "seedance2.5-line1-xoi", "seedance2.0-line1-fast-xoi", "seedance2.0-full"]);
  const promoted = publicModel(models[0], 1.3);
  assert.equal(promoted.name, "即梦 2.0 · 专线");
  assert.deepEqual(promoted.rates.map(r => r.resolution), ["480p", "720p"]);
  assert.ok(Math.abs(promoted.rates[0].points - 8.32) < 1e-9);
  assert.equal(models[0].pricing.billing_expr, rows[1].billing_expr);
  const flat = publicModel(buildCatalog([{ model_name: "seedance2.0-line1", billing_expr: 'tier("default", 5)' }])[0], 1);
  assert.deepEqual(flat.rates, []);
});
test("reference video adjustment is derived from billing, includes retail markup once, and clears when removed", () => {
  const [model] = buildCatalog([{ model_name: "seedance2.0-line1", billing_expr: 'u("seconds") * (u("billing_resolution") == "720p" ? 0.75 : 0.583333) * (u("billing_ref_video") == "true" ? 1.5 : 1)' }]);
  const base = quoteModel(model, { seconds: 5, resolution: "720" }, 1.3);
  const ref = quoteModel(model, { seconds: 5, resolution: "720p", hasReferenceVideo: true }, 1.3);
  assert.equal(base.points, 48.75);
  assert.equal(ref.points, 73.125);
  assert.deepEqual(ref.referenceVideoAdjustment, { multiplier: 1.5, baseYuan: 4.875, basePoints: 48.75 });
  assert.equal(base.referenceVideoAdjustment, null);
  assert.equal(publicModel(model, 1.3).referenceVideoMultiplier, 1.5);
  assert.equal(quoteModel(model, { seconds: 5, resolution: "720p", hasReferenceVideo: "false" }).points, 37.5);
  const [flat] = buildCatalog([{ model_name: "seedance2.0-full", billing_expr: 'tier("default", 7.5)' }]);
  assert.equal(quoteModel(flat, { seconds: 15, hasReferenceVideo: true }).referenceVideoAdjustment, null);
  assert.equal(publicModel(flat, 1).billingUnit, "per_request");
});
test("dynamic capability cards supply real defaults, durations and reference limits without leaking upstream cost", () => {
  const allowed = new Set(["seedance2.5-line1"]);
  const cards = metadataFromCards({ models: [{ id: "seedance2.5-line1", display_name_zh: "上游名", category: "video", unit_price_micro_usd: 12345,
    param_schema: { duration: { default: "15", enum: ["4", "5", "15", "30"] }, resolution: { default: "480p", enum: ["480p", "720p", "1080p"] }, images: { max_items: 30 }, videos: { max_items: 10 }, audios: { max_items: 10 } } }, { id: "inaccessible", category: "video" }] }, allowed);
  const [model] = buildCatalog([{ model_name: "seedance2.5-line1", billing_expr: 'u("seconds") * 0.7' }], [], cards);
  assert.equal(model.defaults.resolution, "480p");
  assert.equal(model.defaults.duration, "15");
  assert.deepEqual(model.durationResolutionMap[0].duration, [4, 5, 15, 30]);
  assert.deepEqual(model.referenceLimits, { images: 30, videos: 10, audios: 10 });
  assert.ok(model.mode.includes("multiReference"));
  assert.equal(JSON.stringify(publicModel(model, 1)).includes("unit_price_micro_usd"), false);
  assert.equal("inaccessible" in cards, false);
});
test("persisted model preferences fall back without selecting Agnes and return when the preferred line exists", () => {
  const live = buildCatalog([
    { model_name: "agnes-video-v2.0", quota_type: 1, model_price: 0 },
    { model_name: "seedance2.0-line1", model_price: 1 },
    { model_name: "seedance2.5-line1-xoi", model_price: 2 },
  ]);
  assert.equal(selectCatalogModel(live, "seedance2.0-line1-xoi", "video")?.modelName, "seedance2.0-line1");
  assert.equal(selectCatalogModel(live, "missing-video", "video")?.modelName, "seedance2.5-line1-xoi");
  assert.equal(selectCatalogModel(live, "agnes-video-missing", "video"), undefined);
  assert.equal(isAgnesModel("newapi:agnes-image-2.1-flash"), true);
  const restored = buildCatalog([...live.map(m => m.pricing), { model_name: "seedance2.0-line1-xoi", model_price: 1 }]);
  assert.equal(selectCatalogModel(restored, "seedance2.0-line1-xoi", "video")?.modelName, "seedance2.0-line1-xoi");
});
test("upstream primary metadata is recommended but local XOi merchandising keeps higher priority", () => {
  const models = buildCatalog([
    { model_name: "seedance2.0-line1-xoi", model_price: 1 },
    { model_name: "video-upstream-primary", model_price: 1 },
  ], [], { "video-upstream-primary": { type: "video", featured: true, recommendationRank: 35 } });
  assert.equal(models[0].modelName, "seedance2.0-line1-xoi");
  assert.equal(models.find(m => m.modelName === "video-upstream-primary")?.recommendation, "上游重点推荐");
});
