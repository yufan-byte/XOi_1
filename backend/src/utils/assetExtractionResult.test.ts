import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAssetExtraction } from "./assetExtractionResult";
const asset = { name: "阿禾", desc: "咖啡店店员", type: "role" };
test("missing scriptIds is repaired only for a single owned script", () => {
  assert.deepEqual(normalizeAssetExtraction({newAssets:[asset],existingAssetRefs:[]},[2]).newAssets[0].scriptIds,[2]);
  assert.throws(()=>normalizeAssetExtraction({newAssets:[asset],existingAssetRefs:[]},[2,3]),/结构不完整/);
});
test("invalid and cross-batch model output is rejected before any write",()=>{
  for (const scriptIds of ["2",[],[null],[999]]) assert.throws(()=>normalizeAssetExtraction({newAssets:[{...asset,scriptIds}],existingAssetRefs:[]},[2]));
  assert.throws(()=>normalizeAssetExtraction({newAssets:[{...asset,type:"invalid"}],existingAssetRefs:[]},[2]));
  assert.deepEqual(normalizeAssetExtraction({newAssets:[{...asset,scriptIds:[2,2]}],existingAssetRefs:[]},[2]).newAssets[0].scriptIds,[2]);
});
