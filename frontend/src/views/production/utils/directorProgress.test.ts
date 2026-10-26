import test from "node:test";
import assert from "node:assert/strict";
import { getDirectorProgress } from "./directorProgress";
import type { FlowData } from "./flowBuilder";

const empty: FlowData = { script: "", scriptPlan: "", storyboardTable: "", assets: [], storyboard: [], workbench: { videoList: [] }, output: [] };

test("empty boards report their next task, rather than completion", () => {
  for (const progress of Object.values(getDirectorProgress(empty))) {
    assert.equal(progress.tone, "todo");
    assert.ok(progress.next.length > 0);
  }
});

test("failed or pending images stay visible and optional image generation does not block progress", () => {
  const frames = [
    { id: 1, prompt: "", videoDesc: "", src: "ready.jpg", state: "已完成", shouldGenerateImage: 1 },
    { id: 2, prompt: "", videoDesc: "", src: null, state: "生成失败", shouldGenerateImage: 1 },
    { id: 3, prompt: "", videoDesc: "", src: null, state: "未生成", shouldGenerateImage: 0 },
  ] as FlowData["storyboard"];
  const pending = getDirectorProgress({ ...empty, storyboard: frames });
  assert.equal(pending.storyboard.tone, "warn");
  assert.equal(pending.storyboard.label, "图片 1/2");
  assert.match(pending.storyboard.next, /1 张生成失败/);
  frames[1] = { ...frames[1], src: "second.jpg", state: "已完成" };
  assert.equal(getDirectorProgress({ ...empty, storyboard: frames }).storyboard.tone, "done");
});

test("ready originals can continue without creating derived assets; exported films are distinguished from video production", () => {
  const data: FlowData = { ...empty, script: "第 1 场", assets: [{ id: 1, name: "主角", prompt: "", desc: "", src: "actor.jpg", type: "role", state: "已完成", derive: [] }], videoProgress: { total: 2, done: 1, pending: 1, generating: 0, failed: 0 } };
  const progress = getDirectorProgress(data);
  assert.equal(progress.script.tone, "done");
  assert.equal(progress.assets.tone, "done");
  assert.equal(progress.workbench.label, "视频 1/2");
  assert.match(progress.workbench.next, /还需制作 1/);
  assert.equal(progress.output.tone, "todo");
});
