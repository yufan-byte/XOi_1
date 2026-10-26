import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { POINTS_PER_YUAN, QUOTA_PER_YUAN, yuanToPoints, yuanToSignedPoints, formatPoints, formatPointsFromYuan, formatAccountPointsFromYuan, formatCatalogPrice, formatYuan, isValidYuan } from "./points";
import { creationCategories } from "../views/aiAssistant/creationPresets";
test("one yuan equals ten points, including small text quotes and per-second video", () => {
  assert.equal(POINTS_PER_YUAN, 10); assert.equal(QUOTA_PER_YUAN, 500000);
  for (const [yuan, points] of [[1,10], [.006,.06], [.1854,1.854], [.39,3.9], [.75,7.5], [1.09,10.9]]) assert.ok(Math.abs(yuanToPoints(yuan) - points) < 1e-12);
  assert.equal(formatPointsFromYuan(.006), "0.06 积分");
  assert.equal(formatPointsFromYuan(.39 * 5 * 1.5), "29.25 积分");
  assert.equal(formatPoints(10), "10 积分");
  assert.equal(yuanToSignedPoints(-.5), -5);
  assert.equal(formatAccountPointsFromYuan(-.5), "-5 积分");
  assert.equal(formatAccountPointsFromYuan(NaN), "—");
});
test("unknown prices cannot become free, precision does not erase small fees", () => {
  for (const value of [NaN, Infinity, undefined, null, -1, "0.5"]) assert.equal(isValidYuan(value), false);
  assert.equal(formatPointsFromYuan(NaN), "暂无报价");
  assert.equal(formatPointsFromYuan(0), "0 积分");
  assert.equal(formatPointsFromYuan(.00001), "<0.001 积分");
  assert.equal(formatYuan(.00001), "<¥0.0001");
});
test("catalog labels recompute from yuan, ignoring stale points/display strings", () => {
  assert.equal(formatCatalogPrice({ price: { yuan: .75, unit: "秒" }, displayPrice: "0.75 积分" }), "7.5 积分 / 秒（¥0.75）");
  assert.equal(formatCatalogPrice({ price: { yuan: 2, unit: "百万 Token" }, outputPrice: { yuan: 4 } }), "输入 20 / 输出 40 积分 / 百万 Token（¥2 / ¥4）");
  assert.equal(formatCatalogPrice({ rates: [{ resolution: "720p", yuan: .5, unit: "秒" }] }), "720p 5 积分/秒（¥0.5）");
  assert.equal(formatCatalogPrice({ displayPrice: "0.75 积分" }), "按实际用量计费 · 暂无预估");
});
test("all five categories have distinct, usable presets", () => {
  assert.equal(creationCategories.length, 5);
  const prompts = creationCategories.flatMap(category => category.examples.map(example => example.prompt));
  assert.equal(prompts.length, 15); assert.equal(new Set(prompts).size, 15);
  for (const category of creationCategories) assert.ok(category.examples.every(example => example.title && example.brief && example.prompt.length > 20));
});
test("Vue, React canvas and account surfaces share the same conversion implementation", () => {
  for (const path of ["../components/ModelCostHint.vue", "../components/modelSelect.vue", "../../atelier/src/xoi/model-quote.tsx", "../../atelier/src/xoi/model-pricing.ts", "../../console/src/lib/utils.ts"]) assert.match(fs.readFileSync(new URL(path, import.meta.url), "utf8"), /utils\/points/);
  const canvas = fs.readFileSync(new URL("../../atelier/src/xoi/model-quote.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(canvas, /format\(quote\.points\)|format\(quote\.referenceVideoAdjustment\.basePoints\)/);
  const catalog = fs.readFileSync(new URL("../../atelier/src/xoi/model-pricing.ts", import.meta.url), "utf8");
  assert.match(catalog, /points: yuanToPoints\(rate\.yuan\)/);
});
