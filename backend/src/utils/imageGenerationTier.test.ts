import {test} from "node:test";
import assert from "node:assert/strict";
import {imageGenerationTier} from "./imageGenerationTier";
test("image generation honors requested tier rather than forcing 2K",()=>{
  assert.equal(imageGenerationTier("1024x1024",1024,1024),"1K");
  assert.equal(imageGenerationTier("1920x1088",1920,1088),"1K");
  assert.equal(imageGenerationTier("2048x2048",2048,2048),"2K");
  assert.equal(imageGenerationTier("4K",1024,1024),"4K");
  assert.equal(imageGenerationTier("2880x2880",2880,2880),"4K");
});
