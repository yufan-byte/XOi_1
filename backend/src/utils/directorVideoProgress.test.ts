import test from "node:test";
import assert from "node:assert/strict";
import { directorVideoProgress } from "./directorVideoProgress";

test("counts playable tracks, rather than attempts, and ignores videos from other tracks", () => {
  const progress = directorVideoProgress([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], [
    { videoTrackId: 1, state: "生成失败", filePath: null },
    { videoTrackId: 1, state: "生成成功", filePath: "first.mp4" },
    { videoTrackId: 1, state: "生成成功", filePath: "alternate.mp4" },
    { videoTrackId: 2, state: "生成失败", filePath: null },
    { videoTrackId: 2, state: "生成中", filePath: null },
    { videoTrackId: 3, state: "生成失败", filePath: null },
    { videoTrackId: 99, state: "生成成功", filePath: "unrelated.mp4" },
  ]);
  assert.deepEqual(progress, { total: 4, done: 1, generating: 1, failed: 1, pending: 1, trackStates: { 1: "已完成", 2: "生成中", 3: "生成失败", 4: "未生成" } });
});

test("missing result files and an empty episode cannot be marked complete", () => {
  assert.equal(directorVideoProgress([{ id: 1 }], [{ videoTrackId: 1, state: "生成成功", filePath: "" }]).done, 0);
  assert.equal(directorVideoProgress([], []).total, 0);
});
