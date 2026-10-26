import test from "node:test";
import assert from "node:assert/strict";
import { initialStudioStage, studioStageFor, studioStageStatus, storyboardTrackCode, editorProductionReturn } from "./studioWorkflow";
import type { FlowData } from "./flowBuilder";
const ready: FlowData = {
  script: "剧本",
  scriptPlan: "导演计划",
  storyboardTable: "分镜表",
  assets: [],
  storyboard: [{ id: 1, prompt: "床边坐起", videoDesc: "缓缓坐起", duration: 5, src: "frame.jpg", state: "已完成", shouldGenerateImage: 1 }],
  workbench: { videoList: [] },
  reviewState: { planReady: true, tableReady: true, planApproved: true, tableApproved: true },
  videoProgress: { total: 1, done: 1, pending: 0, generating: 0, failed: 0 },
  output: [{ id: 1, name: "成片", url: "film.mp4", duration: 5, resolution: "720p", size: 1, createTime: 1 }],
};
test("legacy entry links resolve to one of the four workflow stages", () => {
  assert.equal(studioStageFor("preview"), "frames");
  assert.equal(studioStageFor("generate"), "video");
  assert.equal(studioStageFor("playback"), "edit");
  assert.equal(studioStageFor("storyboardTable"), "planning");
  assert.equal(studioStageFor(["video"]), undefined);
  assert.equal(studioStageFor("canvas"), undefined);
});
test("existing pictures, videos and output cannot bypass an unconfirmed plan or table", () => {
  assert.equal(initialStudioStage({ ...ready, reviewState: { ...ready.reviewState!, planApproved: false } }), "planning");
  assert.equal(initialStudioStage({ ...ready, reviewState: { ...ready.reviewState!, tableApproved: false } }), "planning");
  assert.match(studioStageStatus({ ...ready, reviewState: { ...ready.reviewState!, tableApproved: false } }).planning, /分镜表待确认/);
});
test("explicit navigation and editor returns can inspect existing media while approval is pending", () => {
  const pending = { ...ready, reviewState: undefined };
  assert.equal(initialStudioStage(pending, "video"), "video");
  assert.equal(initialStudioStage(pending, "edit"), "edit");
  assert.equal(initialStudioStage(pending, "unknown"), "planning");
});
test("missing shot records or invalid shot details return to planning; optional images do not block inspection", () => {
  assert.equal(initialStudioStage({ ...ready, storyboard: [] }), "planning");
  assert.equal(initialStudioStage({ ...ready, storyboard: [{ ...ready.storyboard[0], duration: -1 }] }), "planning");
  assert.equal(initialStudioStage({ ...ready, storyboard: [{ ...ready.storyboard[0], prompt: "", videoDesc: "" }] }), "planning");
  assert.equal(initialStudioStage({ ...ready, storyboard: [{ ...ready.storyboard[0], shouldGenerateImage: 0, src: null }] }), "frames");
});
test("image completion is never presented as continuity approval, nor does it jump straight to editing", () => {
  assert.equal(initialStudioStage(ready), "frames");
  assert.match(studioStageStatus(ready).frames, /逐镜核对衔接/);
  assert.doesNotMatch(studioStageStatus(ready).frames, /已通过|一致性已完成/);
});

test("video groups retain all source shot numbers and never renumber around an unlinked shot", () => {
  const frames = [{ trackId: 11 }, { trackId: 22 }, { trackId: null }, { trackId: 22 }];
  assert.equal(storyboardTrackCode(frames, 22, 1), "S02 / S04");
  assert.equal(storyboardTrackCode(frames, 99, 2), "独立片段 3");
  assert.match(studioStageStatus({ ...ready, storyboard: [{ ...ready.storyboard[0], trackId: undefined }] }).video, /1 镜未关联/);
});

test("editor returns preserve the originating stage and actual episode", () => {
  assert.deepEqual(editorProductionReturn("/production?projectId=7&stage=video&episode=old", "7", "11"), {
    path: "/production",
    query: { projectId: "7", episode: "11", stage: "video" },
  });
  assert.equal(editorProductionReturn(undefined, "7", "11").query.stage, "edit");
});
test("editor returns reject external, cross-project and unrelated paths", () => {
  for (const path of [
    "https://evil.invalid/production?projectId=7&stage=planning",
    "//evil.invalid/production?projectId=7&stage=planning",
    "/production?projectId=8&stage=planning",
    "/canvas?projectId=7&stage=planning",
  ])
    assert.deepEqual(editorProductionReturn(path, "7", "11"), { path: "/production", query: { projectId: "7", episode: "11", stage: "edit" } });
});
