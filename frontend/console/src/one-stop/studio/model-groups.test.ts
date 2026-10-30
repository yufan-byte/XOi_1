import { test } from "node:test";
import assert from "node:assert/strict";
import { studioModelGroup } from "./model-groups";
import type { CatalogModel } from "../../lib/models";

const model = (id: string, billingUnit = "per_second") => ({ id, name: id, series: "即梦 Seedance", category: "video", billingUnit }) as CatalogModel;

test("Seedance lines keep versions, billing units, Fast and official variants separate", () => {
  const a = studioModelGroup(model("seedance2.0-line1-xoi")).key;
  assert.equal(a, studioModelGroup(model("seedance2.0-line1")).key);
  assert.notEqual(a, studioModelGroup(model("seedance2.5-line1-xoi")).key);
  assert.notEqual(a, studioModelGroup(model("seedance2.0-line1-fast-xoi")).key);
  assert.notEqual(a, studioModelGroup(model("seedance2.0-full", "per_request")).key);
  assert.notEqual(a, studioModelGroup(model("seedance2.0-gz-special")).key);
  assert.notEqual(studioModelGroup(model("seedance2.0-gz-special")).key, studioModelGroup(model("seedance2.5-gz-special")).key);
});
