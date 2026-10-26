import test from "node:test";
import assert from "node:assert/strict";
import { editorTimelineSize, fitEditorScale, adjacentEditPoint, canSplitEditorClip, editorDraftSerializer } from "./editorWorkspace";
test("timeline resizing reserves preview space and adapts to short screens", () => {
  for (const height of [480, 600, 746, 900, 1400]) {
    const initial = editorTimelineSize(height);
    assert.ok(initial.value >= initial.min && initial.value <= initial.max);
    assert.equal(editorTimelineSize(height, 9999).value, initial.max);
    assert.equal(editorTimelineSize(height, -100).value, initial.min);
    assert.ok(height - initial.value >= 300);
  }
  assert.equal(editorTimelineSize(Number.NaN).value, 264);
});
test("fit to film changes only zoom, bounds the scale and rejects invalid geometry", () => {
  assert.equal(fitEditorScale(45, 936, 100, 0.1, 10), 0.2);
  assert.equal(fitEditorScale(100000, 900, 100, 0.1, 10), 0.1);
  assert.equal(fitEditorScale(0.1, 900, 100, 0.1, 10), 10);
  assert.equal(fitEditorScale(0, 900, 100, 0.1, 10), null);
  assert.equal(fitEditorScale(45, 0, 100, 0.1, 10), null);
  assert.equal(fitEditorScale(Number.NaN, 900, 100, 0.1, 10), null);
});
test("edit-point navigation follows real clip boundaries, including gaps and overlapping layers", () => {
  const clips = [
    { startTime: 0, endTime: 5 },
    { startTime: 8, endTime: 12 },
    { startTime: 2, endTime: 9 },
  ];
  assert.equal(adjacentEditPoint(clips, 5, 1), 8);
  assert.equal(adjacentEditPoint(clips, 5, -1), 2);
  assert.equal(adjacentEditPoint(clips, 8, -1), 5);
  assert.equal(adjacentEditPoint(clips, 12, 1), 12);
  assert.equal(adjacentEditPoint(clips, 0, -1), 0);
  assert.equal(adjacentEditPoint([], 0, 1), 0);
});

test("splitting excludes boundaries, tiny slivers and transition clips", () => {
  assert.equal(canSplitEditorClip({ startTime: 0, endTime: 3 }, 1.5), true);
  for (const time of [0, 0.01, 2.999999999, 3, Number.NaN]) assert.equal(canSplitEditorClip({ startTime: 0, endTime: 3 }, time), false);
  assert.equal(canSplitEditorClip({ startTime: 0, endTime: 3, type: "transition" }, 1.5), false);
});

test("timeline storage round-trips nested clips with a null default instead of coercing arrays to strings", () => {
  const tracks = [{ id: "main", clips: [{ id: "clip", startTime: 0, endTime: 3, text: "镜头内容" }] }];
  const raw = editorDraftSerializer.write(tracks);
  assert.deepEqual(editorDraftSerializer.read(raw), tracks);
  assert.ok(Array.isArray(editorDraftSerializer.read(raw)));
  assert.deepEqual(editorDraftSerializer.read("[]"), []);
  assert.equal(editorDraftSerializer.read("null"), null);
  assert.equal(editorDraftSerializer.read("[object Object],[object Object]"), null);
  assert.equal(editorDraftSerializer.read('{"clips":[]}'), null);
});
