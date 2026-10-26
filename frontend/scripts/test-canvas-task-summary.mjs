import assert from 'node:assert/strict';
import { build } from '../atelier/node_modules/esbuild/lib/main.js';
const root = new URL('..', import.meta.url).pathname;
async function moduleAt(file) {
  const result = await build({ entryPoints: [file], absWorkingDir: root, bundle: true, format: 'esm', platform: 'node', write: false });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const { summarizeCanvasTasks, newlyFinishedTasks, taskReceiptStorageKey } = await moduleAt('atelier/upstream/src/app/(user)/canvas/utils/canvas-task-summary.ts');
const { formatAccountPointsFromYuan } = await moduleAt('src/utils/points.ts');
const node = (id, type, metadata) => ({ id, type, title: id, metadata, position: { x: 0, y: 0 }, width: 200, height: 150 });
const nodes = [
  node('reference', 'image', { status: 'success', content: '/reference.png' }),
  node('note', 'text', { status: 'success', content: 'User brief' }),
  node('config', 'config', { status: 'success', startedAt: 100 }),
  node('image', 'image', { status: 'success', imageTaskId: 'request-1', startedAt: 100 }),
  node('video', 'video', { status: 'loading', videoTaskId: 'request-2', startedAt: 50, progress: 150 }),
  node('audio', 'audio', { status: 'error', audioTaskId: 'request-3', startedAt: 200, errorDetails: 'Provider unavailable' }),
];
const before = JSON.stringify(nodes);
const tasks = summarizeCanvasTasks(nodes);
assert.deepEqual(tasks.map(t => t.nodeId), ['video', 'audio', 'image']);
assert.equal(tasks[0].progress, 100);
assert.equal(tasks[1].detail, 'Provider unavailable');
assert.equal(JSON.stringify(nodes), before, 'Task UI must not mutate generation state');
assert.deepEqual(newlyFinishedTasks(new Map(), tasks), [], 'Loading a saved canvas does not replay historical toasts');
const done = summarizeCanvasTasks([node('video', 'video', { ...nodes[4].metadata, status: 'success' })]);
assert.equal(newlyFinishedTasks(new Map(tasks.map(t => [t.key, t.status])), done).length, 1);
assert.equal(newlyFinishedTasks(new Map(done.map(t => [t.key, t.status])), done).length, 0);
const retry = summarizeCanvasTasks([node('video', 'video', { ...nodes[4].metadata, startedAt: 300 })]);
assert.notEqual(retry[0].key, tasks[0].key, 'Retry must have a fresh unread identity');
assert.notEqual(taskReceiptStorageKey('account-A', 'canvas-1'), taskReceiptStorageKey('account-B', 'canvas-1'));
assert.notEqual(taskReceiptStorageKey('account-A', 'canvas-1'), taskReceiptStorageKey('account-A', 'canvas-2'));
assert.deepEqual(summarizeCanvasTasks([]), [], 'Another empty canvas cannot inherit tasks');
assert.equal(summarizeCanvasTasks([node('bad-date', 'image', { status: 'error', imageTaskId: 'id', startedAt: 1e99 })])[0].startedAt, 0);
assert.equal(formatAccountPointsFromYuan(12.3), '123 积分');
assert.equal(formatAccountPointsFromYuan(-2), '-20 积分');
console.log('PASS: canvas task isolation, read-only state, retries, completion transitions, reference exclusion, invalid timestamps and balance units');
