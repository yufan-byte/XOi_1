import test from 'node:test';
import assert from 'node:assert/strict';
import { directorReviewState, stageFingerprint } from './directorStageReview';
const script = 'A suspense scene.';
const draft = () => ({ scriptPlan: 'Plan: slow reveal.', storyboardTable: '| 1 | 15s | Reveal |', stageReviews: {} as any });
function approved() {
  const data = draft();
  for (const stage of ['scriptPlan', 'storyboardTable'] as const) data.stageReviews[stage] = { fingerprint: stageFingerprint(script, data, stage) };
  return data;
}
test('content existence alone never counts as human approval', () => {
  assert.deepEqual(directorReviewState(script, draft()), { planReady: true, tableReady: true, planApproved: false, tableApproved: false });
  assert.equal(directorReviewState(script, {}).tableApproved, false);
});
test('table review depends on plan review and exact script/content snapshot', () => {
  const data = approved();
  assert.equal(directorReviewState(script, data).tableApproved, true);
  delete data.stageReviews.scriptPlan;
  assert.equal(directorReviewState(script, data).tableApproved, false);
});
test('script or plan changes invalidate both; table changes only invalidate table', () => {
  const data = approved();
  assert.equal(directorReviewState(script + ' edited', data).planApproved, false);
  assert.equal(directorReviewState(script, { ...data, scriptPlan: 'new plan' }).tableApproved, false);
  const changedTable = directorReviewState(script, { ...data, storyboardTable: 'new table' });
  assert.equal(changedTable.planApproved, true); assert.equal(changedTable.tableApproved, false);
});
test('empty content cannot be approved even with a matching hash', () => {
  const data = approved(); data.scriptPlan = ' ';
  data.stageReviews.scriptPlan.fingerprint = stageFingerprint(script, data, 'scriptPlan');
  assert.equal(directorReviewState(script, data).planApproved, false);
});
