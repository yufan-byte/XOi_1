import test from "node:test";
import assert from "node:assert/strict";
import {
  compatibleStudioVideoMode,
  studioVideoModeChoices,
  videoReferenceAllowance,
  videoReferenceItems,
  videoReferenceError,
} from "./studioVideoInput";
const chosen = { id: 11, sources: "assets", src: "/chosen.jpg", fileType: "image" };
const storyboard = { id: 12, sources: "storyboard", src: "/storyboard.jpg", fileType: "image" };
test("text-to-video sends no references; changing mode leaves the reference draft intact", () => {
  const draft = [chosen, storyboard];
  assert.deepEqual(videoReferenceItems("text", draft), []);
  assert.deepEqual(draft, [chosen, storyboard]);
  assert.deepEqual(videoReferenceItems("singleImage", draft), [chosen]);
  assert.equal(videoReferenceError("text", []), "");
});
test("reference choice respects order and optional frame positions instead of filling a missing slot silently", () => {
  const empty = { id: null, sources: "storyboard", src: "", fileType: "image" };
  assert.deepEqual(videoReferenceItems("singleImage", [chosen, storyboard]), [chosen]);
  assert.match(videoReferenceError("startEndRequired", [empty, storyboard]), /首帧和尾帧/);
  assert.match(videoReferenceError("endFrameOptional", [empty, storyboard]), /首帧/);
  assert.match(videoReferenceError("startFrameOptional", [chosen, empty]), /尾帧/);
  assert.equal(videoReferenceError("startFrameOptional", [empty, storyboard]), "");
});
test("one-stop mode choices stay explicit and preserve the semantic mode when changing models", () => {
  const choices = studioVideoModeChoices(["text", "singleImage", "startEndRequired", ["imageReference:3", "videoReference:1"]]);
  assert.deepEqual(choices.map((item) => item.label), ["文生视频", "首帧", "首尾帧", "多素材"]);
  assert.equal(compatibleStudioVideoMode("singleImage", studioVideoModeChoices(["text", "multiReference"])), "multiReference");
  assert.equal(compatibleStudioVideoMode("text", studioVideoModeChoices(["singleImage", "textToVideo"])), "textToVideo");
});
test("reference limits use the model contract and never reorder selected material", () => {
  const video = { id: 13, sources: "assets", src: "/clip.mp4", fileType: "video" };
  const allowance = videoReferenceAllowance(JSON.stringify(["imageReference:1", "videoReference:1"]));
  assert.deepEqual(allowance, { image: 1, video: 1, audio: 0, total: 2 });
  assert.deepEqual(videoReferenceItems(JSON.stringify(["imageReference:1", "videoReference:1"]), [chosen, storyboard, video], allowance), [chosen, video]);
});
