import test from "node:test";
import assert from "node:assert/strict";
import { canvasImageRequest } from "./canvasImageRequest";
import { queueRequest } from "../lib/workspace/queueRequest";
test("canvas image envelopes preserve model, pixel size, references and idempotency identity", () => {
  const parsed = canvasImageRequest({
    endpoint: "/images/generations",
    clientTaskId: "same",
    nodeId: "node",
    sourceId: "canvas",
    request: {
      model: "agnes-image",
      prompt: "fixture",
      size: "1024x1024",
      extra_body: { image: ["data:image/png;base64,fixture"] },
    },
  });
  assert.equal(parsed.model, "agnes-image");
  assert.equal(parsed.clientTaskId, "same");
  assert.equal(parsed.size, "1024x1024");
  assert.equal(parsed.source_id, "canvas");
  assert.deepEqual(parsed.reference_images, [
    { url: "data:image/png;base64,fixture" },
  ]);
  const queued = queueRequest("image", {
    ...parsed,
    headers: { Authorization: "secret" },
    apiKey: "secret",
    reference_images: [
      {
        url: "/fixture.png",
        headers: { Authorization: "secret" },
        apiKey: "secret",
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(queued), /secret|apiKey|Authorization/);
});
test("unsupported image protocols, multi-image counts and malformed references fail before dispatch", () => {
  for (const body of [
    { endpoint: "/responses", request: {} },
    { endpoint: "/chat/completions", request: {} },
    {
      endpoint: "/images/generations",
      request: { model: "fixture", prompt: "fixture", n: 2 },
    },
    {
      endpoint: "/images/edits",
      request: { model: "fixture", prompt: "fixture", image: [{}] },
    },
  ])
    assert.throws(
      () => canvasImageRequest(body),
      (e: any) => e.status === 400,
    );
  const flat = { model: "fixture", prompt: "fixture" };
  assert.equal(canvasImageRequest(flat), flat);
});
