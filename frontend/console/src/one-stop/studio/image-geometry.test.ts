import test from "node:test";
import assert from "node:assert/strict";
import { imageGeometry } from "./image-geometry";

test("wide and portrait sizes use the provider whitelist instead of rounded ratios", () => {
  assert.deepEqual(imageGeometry("21:9", "2K"), { width: 2688, height: 1152, size: "2688x1152", exact: false });
  assert.equal(imageGeometry("16:9", "1K").size, "1920x1088");
  assert.equal(imageGeometry("9:16", "4k").size, "2160x3840");
  assert.equal(imageGeometry("1:1", "4K").size, "2880x2880");
});

test("fixed pixel sizes survive without being interpreted as an aspect ratio", () => {
  assert.deepEqual(imageGeometry("1792x1024", "4K"), { width: 1792, height: 1024, size: "1792x1024", exact: true });
});
