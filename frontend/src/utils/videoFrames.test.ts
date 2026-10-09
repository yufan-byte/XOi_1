import test from "node:test";
import assert from "node:assert/strict";
import { sampleVideoTimes, formatFrameTime } from "./videoFrames";

test("samples the entire duration, including videos longer than three minutes", () => {
  for (const duration of [0.03, 3, 600, 1800]) {
    const times = sampleVideoTimes(duration);
    assert.equal(times.length, 12);
    assert.ok(times[0] >= 0 && times[0] < duration * 0.1);
    assert.ok(times.at(-1)! > duration * 0.9 && times.at(-1)! < duration);
    assert.ok(times.every((time, i) => i === 0 || time > times[i - 1]));
  }
});

test("rejects invalid metadata and bounds frame counts", () => {
  for (const duration of [0, -1, NaN, Infinity, 1801]) assert.throws(() => sampleVideoTimes(duration));
  assert.throws(() => sampleVideoTimes(10, NaN));
  assert.equal(sampleVideoTimes(10, 100).length, 16);
  assert.equal(sampleVideoTimes(10, 1).length, 2);
  assert.equal(formatFrameTime(59.96), "01:00.0");
  assert.equal(formatFrameTime(600.2), "10:00.2");
});
