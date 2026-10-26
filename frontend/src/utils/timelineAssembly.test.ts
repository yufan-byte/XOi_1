import test from 'node:test';
import assert from 'node:assert/strict';
import { requestedClipDuration, missingShotCount } from './timelineAssembly';
test('15-second shots discard container padding, never invent frames', () => {
  assert.equal(requestedClipDuration(15, 15.104), 15);
  assert.equal(requestedClipDuration(15, 12), 12);
  assert.equal(requestedClipDuration(0, 8), 8);
  assert.equal(requestedClipDuration(15, 0), 15);
  assert.equal([15.104, 15.104, 15.104].reduce(n => n + requestedClipDuration(15, 15.104), 0), 45);
});
test('repeating the first video does not count as having inserted other shots', () => {
  assert.equal(missingShotCount(['/oss/1.mp4', '/oss/2.mp4', '/oss/3.mp4'], ['/oss/1.mp4', '/oss/1.mp4', '/oss/1.mp4']), 2);
  assert.equal(missingShotCount(['/oss/1.mp4'], ['http://localhost:12121/oss/1.mp4?v=1']), 0);
});
