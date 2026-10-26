import test from "node:test";
import assert from "node:assert/strict";
import { canUnderstandImages, canUseReferenceImages, referenceImageLimit } from "../../../frontend/src/utils/modelCapabilities";

test("unknown/test names and image output alone do not imply visual input", () => {
  assert.equal(canUnderstandImages({ type: "text", capabilities: [] }), false);
  assert.equal(canUnderstandImages({ type: "image", capabilities: ["vision"] }), false);
  assert.equal(canUseReferenceImages({ type: "image", mode: ["text"] }), false);
  assert.equal(canUseReferenceImages({ type: "video", mode: ["videoReference"] }), false);
});
test("vision is recognized from capabilities or explicit input schemas", () => {
  for (const capability of ["vision", "image_input", "image input", "multimodal", "图像理解"])
    assert.equal(canUnderstandImages({ type: "text", capabilities: [capability] }), true);
  assert.equal(canUnderstandImages({ type: "text", paramSchema: { images: { type: "array" } } }), true);
  assert.equal(canUnderstandImages({ type: "text", paramSchema: { images: { enabled: false } } }), false);
});
test("single-image models cannot be used for two-image product replacement", () => {
  const single = { type: "image", mode: ["singleImage"] };
  assert.equal(canUseReferenceImages(single), true);
  assert.equal(referenceImageLimit(single), 1);
  assert.equal(canUseReferenceImages(single, 2), false);
  assert.equal(canUseReferenceImages({ type: "image", capabilities: ["参考图"] }, 2), false);
  assert.equal(canUseReferenceImages({ type: "image", mode: ["multiReference"] }, 2), true);
});
test("limits in capability cards and schemas are enforced consistently", () => {
  const model = { type: "image", paramSchema: { images: { type: "array", max_items: 2 } } };
  assert.equal(canUseReferenceImages(model, 2), true);
  assert.equal(canUseReferenceImages(model, 3), false);
  assert.equal(canUseReferenceImages({ type: "video", referenceLimits: { images: 1 } }), true);
  assert.equal(canUseReferenceImages({ type: "text", referenceLimits: { images: 3 } }), false);
});
