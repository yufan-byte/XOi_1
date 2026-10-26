import test from "node:test";
import assert from "node:assert/strict";
import { normalizeShots, restoreShots, boardCandidates, videoCandidates, validateVideo, submitBoard, submitVideo, pollVideoOnce, generationQuoteLines, sumQuotes, type ReplicateShot, type WorkflowApi } from "./workflow";
const shot = (): ReplicateShot => ({ id: "s1", no: 1, seconds: 5, scene: "商品特写", camera: "推进", copy: "新品", status: "待生成", boardState: "idle", videoState: "idle" });
const checkpoint = async () => {};
const api = (overrides: Partial<WorkflowApi> = {}): WorkflowApi => ({ post: async () => { throw new Error("Unexpected POST: paid request prohibited"); }, get: async () => { throw new Error("Unexpected GET"); }, ...overrides });
test("LLM duration snaps to supported values, malformed/oversized plans are rejected", () => {
  assert.equal(normalizeShots([{ scene: "商品", seconds: 7 }], 5, [5, 10], () => "id")[0].seconds, 5);
  assert.equal(normalizeShots([{ scene: "商品", seconds: -4 }], 5, [5, 10], () => "id")[0].seconds, 5);
  assert.throws(() => normalizeShots(Array(9).fill({ scene: "商品" }), 5));
  assert.throws(() => normalizeShots([{ seconds: 5 }], 5));
});
test("completed and uncertain jobs are never selected for automatic regeneration", () => {
  const s = shot(); assert.equal(boardCandidates([s]).length, 1);
  s.boardState = "unknown"; assert.equal(boardCandidates([s]).length, 0);
  s.taskId = "task"; assert.equal(videoCandidates([s]).length, 0);
  s.taskId = undefined; s.videoState = "unknown"; assert.equal(videoCandidates([s]).length, 0);
});
test("refresh keeps task identifiers and marks interrupted submissions uncertain", () => {
  const [restored] = restoreShots([{ ...shot(), boardState: "submitting", videoState: "submitting", taskId: "paid-task" }]);
  assert.equal(restored.boardState, "unknown"); assert.equal(restored.videoState, "pending"); assert.equal(restored.taskId, "paid-task");
});
test("fee adds per-shot durations, excludes completed shots, preserves reference semantics", () => {
  const lines = generationQuoteLines("videos", [shot(), { ...shot(), id: "s2", no: 2, seconds: 10 }, { ...shot(), clip: "done" }], "newapi:fast", "480p");
  assert.deepEqual(lines.map(l => l.params.seconds), [5, 10]);
  assert.ok(lines.every(l => l.model === "fast" && l.params.hasReferenceVideo === false && l.params.resolution === "480p"));
  assert.deepEqual(sumQuotes([{ yuan: .39 * 5 }, { yuan: .39 * 10 }]), { yuan: 5.85, points: 58.5 });
  assert.throws(() => sumQuotes([{ yuan: NaN }])); assert.throws(() => sumQuotes([]));
});
test("unsupported specs, missing board and native local refs rejected before POST", () => {
  const model = { modelName: "seedance2.0-line1", type: "video", referenceLimits: { images: 9 }, enums: { duration: [5], resolution: ["720p"], aspect_ratio: ["9:16"] } };
  assert.throws(() => validateVideo(model, shot(), "720p", "9:16"));
  assert.throws(() => validateVideo(model, { ...shot(), board: "data:image/png;base64,eA==" }, "720p", "9:16"));
  assert.throws(() => validateVideo(model, { ...shot(), board: "https://fixture.invalid/image" }, "1080p", "9:16"));
  validateVideo(model, { ...shot(), board: "https://fixture.invalid/image" }, "720p", "9:16");
});
test("storage failure prevents any generation submission", async () => {
  let posted = 0;
  await assert.rejects(() => submitVideo(shot(), {}, api({ post: async () => { posted++; } }), async () => { throw new Error("disk full"); }));
  assert.equal(posted, 0);
});
test("board timeout stops stage and is not retried automatically", async () => {
  const s = shot(); let posted = 0;
  const mock = api({ post: async () => { posted++; throw new Error("timeout"); } });
  await assert.rejects(() => submitBoard(s, {}, mock, checkpoint)); assert.equal(s.boardState, "unknown");
  await assert.rejects(() => submitBoard(s, {}, mock, checkpoint)); assert.equal(posted, 1);
});
test("board intent is saved before request and result after request", async () => {
  const s = shot(); const states: string[] = [];
  await submitBoard(s, {}, api({ post: async () => { assert.deepEqual(states, ["submitting"]); return { data: [{ url: "image" }] }; } }), async () => { states.push(s.boardState!); });
  assert.deepEqual(states, ["submitting", "done"]); assert.equal(s.board, "image");
});
test("task ID persisted before polling and resuming never creates another job", async () => {
  const s = { ...shot(), board: "image" }; let posted = 0; let persisted = "";
  const mock = api({ post: async () => { posted++; return { data: { id: "paid-task" } }; }, get: async () => ({ data: { status: "completed", video_url: "clip.mp4" } }) });
  await submitVideo(s, { model: "newapi:fast" }, mock, async () => { persisted = s.taskId || ""; });
  assert.equal(persisted, "paid-task");
  await submitVideo(s, {}, mock, checkpoint); await pollVideoOnce(s, mock, checkpoint);
  assert.equal(posted, 1); assert.equal(s.clip, "clip.mp4"); assert.equal(s.videoState, "done");
});
test("polling 404/restart retains paid job ID and blocks a new submission", async () => {
  const s = { ...shot(), taskId: "existing-task", videoState: "pending" as const };
  await assert.rejects(() => pollVideoOnce(s, api({ get: async () => { throw { status: 404 }; } }), checkpoint));
  assert.equal(s.taskId, "existing-task"); assert.equal(videoCandidates([s]).length, 0);
});
test("known terminal failure enables only explicit newly quoted retry", async () => {
  const s = { ...shot(), board: "image", taskId: "failed-task" };
  await pollVideoOnce(s, api({ get: async () => ({ data: { status: "failed", error: { message: "upstream failed" } } }) }), checkpoint);
  assert.equal(s.taskId, undefined); assert.equal(s.videoState, "failed"); assert.equal(s.error, "upstream failed");
  assert.equal(videoCandidates([s]).length, 1);
});
test("completed state without download URL is not reported as delivered", async () => {
  const s = { ...shot(), taskId: "task" };
  await assert.rejects(() => pollVideoOnce(s, api({ get: async () => ({ data: { status: "completed" } }) }), checkpoint));
  assert.equal(s.clip, undefined); assert.equal(s.taskId, "task");
});
