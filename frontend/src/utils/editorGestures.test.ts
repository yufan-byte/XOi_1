import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineWheel } from './editorGestures';
const event = { deltaX: 0, deltaY: -30, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false };
test('mouse zoom preserves time under pointer', () => {
  const r = timelineWheel(event, 1, .1, 10, 200, 350);
  assert.ok(r.scale > 1); assert.ok(Math.abs((r.scroll + 350) / r.scale - 550) < .00001);
});
test('trackpad pinch zooms, horizontal and shift gestures pan', () => {
  assert.ok(timelineWheel({ ...event, ctrlKey: true }, 1, .1, 10, 0, 100).scale > 1);
  assert.deepEqual(timelineWheel({ ...event, deltaX: 40, deltaY: 1 }, 2, .1, 10, 100, 300), { scale: 2, scroll: 140 });
  assert.deepEqual(timelineWheel({ ...event, shiftKey: true, deltaY: 40 }, 2, .1, 10, 100, 300), { scale: 2, scroll: 140 });
});
test('wheel modes and limits never produce negative scroll or unbounded zoom', () => {
  assert.equal(timelineWheel({ ...event, deltaMode: 1 }, 9, .1, 10, 0, 100).scale, 10);
  const r = timelineWheel({ ...event, deltaY: 1e6, deltaMode: 2 }, .1, .1, 10, 0, 100);
  assert.equal(r.scale, .1); assert.equal(r.scroll, 0);
});
