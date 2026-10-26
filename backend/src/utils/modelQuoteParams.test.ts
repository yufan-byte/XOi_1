import { test } from "node:test";
import assert from "node:assert/strict";
import { modelQuoteParams } from "../../../frontend/atelier/src/xoi/quote-params";
import { catalogVideoInput } from "../../../frontend/atelier/src/xoi/video-input";

test("canvas quote uses resolution, not aspect ratio; video ignores the image batch count", () => {
  const params = modelQuoteParams({ vquality: "720", size: "9:16", videoSeconds: "10", canvasImageCount: "4" }, "video", "镜头", true);
  assert.equal(params.resolution, "720p");
  assert.equal(params.aspect_ratio, "9:16");
  assert.equal(params.seconds, 10);
  assert.equal(params.n, 1);
  assert.equal(params.hasReferenceVideo, true);
  assert.equal(modelQuoteParams({ canvasImageCount: "4" }, "image", "图", false).n, 4);
});

test("native Seedance submission keeps the same resolution and duration as its quote", () => {
  const config = { vquality: "1080", size: "9:16", videoSeconds: "30", canvasImageCount: "4" };
  const refs = { images: ["https://example.test/image.png"], videos: ["https://example.test/reference.mp4"], audios: ["https://example.test/audio.mp3"] };
  const body = catalogVideoInput(config, "seedance2.5-line1", "镜头", refs);
  assert.equal(body.seconds, 30);
  assert.equal(body.resolution, "1080p");
  assert.equal(body.aspect_ratio, "9:16");
  assert.deepEqual(body.videos, refs.videos);
  assert.equal("mode" in body, false);
  assert.equal(catalogVideoInput({ ...config, size: "720x1280" }, body.model, "镜头", refs).aspect_ratio, "9:16");
});
