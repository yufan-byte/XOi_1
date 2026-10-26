import assert from 'node:assert/strict';
import { build } from '../atelier/node_modules/esbuild/lib/main.js';
const result = await build({
  entryPoints: [new URL('../atelier/upstream/src/app/(user)/canvas/utils/canvas-task-attempt.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const { matchesCanvasTaskAttempt } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
for (const [kind, field] of [['image', 'imageTaskId'], ['video', 'videoTaskId'], ['audio', 'audioTaskId']]) {
  let metadata = { status: 'loading', [field]: 'attempt-A' };
  let finishOld;
  const oldPoll = new Promise(resolve => { finishOld = resolve; }).then(response => {
    if (matchesCanvasTaskAttempt(metadata, kind, 'attempt-A')) metadata = { ...metadata, ...response };
  });
  metadata = { status: 'loading', [field]: 'attempt-B' };
  finishOld({ status: 'success', content: '/old-result' });
  await oldPoll;
  assert.equal(metadata[field], 'attempt-B');
  assert.equal(metadata.content, undefined, `${kind}: late old result must not replace retry`);
  assert.ok(matchesCanvasTaskAttempt(metadata, kind, 'attempt-B'));
  metadata = { ...metadata, status: 'success', content: '/new-result' };
  assert.equal(matchesCanvasTaskAttempt(metadata, kind, 'attempt-B'), false, 'late processing response cannot downgrade success');
  assert.equal(matchesCanvasTaskAttempt(undefined, kind, 'attempt-B'), false, 'deleted node cannot receive result');
}
assert.ok(matchesCanvasTaskAttempt({ status: 'loading', videoTaskId: 'local', videoTaskVideoId: 'upstream' }, 'video', 'upstream'));
assert.equal(matchesCanvasTaskAttempt({ status: 'loading', videoTaskId: 'local', videoTaskVideoId: 'upstream' }, 'video', 'local'), false);
console.log('PASS: delayed image/video/audio results cannot overwrite retries, completed or deleted nodes; video poll identity preserved');
