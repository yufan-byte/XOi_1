import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import knex from 'knex';
import { approveDirectorStage, requireDirectorReview, readDirectorReview } from './directorStageReview';
import { saveDirectorDraft } from './directorStageDraft';

test('director approvals persist, isolate users and invalidate changed plans in PostgreSQL', async t => {
  const url = process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL;
  if (!url) { t.skip('Local PostgreSQL not configured'); return; }
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
  const schema = 'xoi_review_test_' + crypto.randomBytes(8).toString('hex');
  const db = knex({ client: 'pg', connection: url, searchPath: [schema], pool: { min: 0, max: 3 } });
  let created = false;
  try {
    await db.raw('CREATE SCHEMA ??', [schema]); created = true;
    await db.schema.createTable('o_project', t => { t.bigInteger('id').primary(); t.integer('userId'); t.text('artStyle'); t.text('directorManual'); t.text('videoRatio'); });
    await db.schema.createTable('o_script', t => { t.integer('id').primary(); t.bigInteger('projectId'); t.text('content'); });
    await db.schema.createTable('o_agentWorkData', t => { t.increments('id'); t.bigInteger('projectId'); t.integer('episodesId'); t.text('key'); t.text('data'); t.bigInteger('createTime'); t.bigInteger('updateTime'); });
    await db('o_project').insert({ id: 9, userId: 7 });
    await db('o_script').insert({ id: 11, projectId: 9, content: 'script' });
    await db('o_agentWorkData').insert({ projectId: 9, episodesId: 11, key: 'productionAgent', data: JSON.stringify({ scriptPlan: 'plan', storyboardTable: 'shots' }) });
    const input = { projectId: 9, scriptId: 11, stage: 'scriptPlan' as const, content: 'plan', scriptPlan: 'plan', script: 'script' };
    assert.match(await requireDirectorReview(db, 9, 11), /导演计划/);
    assert.match((await approveDirectorStage(db, 8, input)).message!, /无权/);
    assert.match((await approveDirectorStage(db, 7, { ...input, content: 'stale' })).message!, /更新/);
    assert.match((await approveDirectorStage(db, 7, { ...input, stage: 'storyboardTable', content: 'shots' })).message!, /先审核/);
    assert.equal((await approveDirectorStage(db, 7, input)).state?.planApproved, true);
    assert.match(await requireDirectorReview(db, 9, 11), /分镜表/);
    assert.equal((await approveDirectorStage(db, 7, { ...input, stage: 'storyboardTable', content: 'shots' })).state?.tableApproved, true);
    assert.equal(await requireDirectorReview(db, 9, 11), '');
    assert.equal((await readDirectorReview(db, 9, 11)).data.stageReviews.scriptPlan.approvedBy, 7);
    await db('o_project').where('id',9).update({artStyle:'changed-style'});
    assert.equal((await readDirectorReview(db,9,11)).state.planApproved,false);
    await saveDirectorDraft(db,9,11,'<scriptPlan>assistant new plan</scriptPlan>','offline');
    const stored=await readDirectorReview(db,9,11);
    assert.equal(stored.data.scriptPlan,'assistant new plan');
    assert.equal(stored.data.storyboardTable,'shots');
    assert.equal(stored.state.planApproved,false);
    assert.equal(stored.data.assistantDraft.model,'offline');
    await assert.rejects(saveDirectorDraft(db,9,11,'<scriptPlan>stale draft</scriptPlan>','offline',{script:'outdated script',artStyle:'changed-style',directorManual:'',videoRatio:''}),/已更新/);
    assert.equal((await readDirectorReview(db,9,11)).data.scriptPlan,'assistant new plan');
    await assert.rejects(saveDirectorDraft(db,999,11,'<scriptPlan>x</scriptPlan>','offline'),/不属于/);
    await db('o_script').where('id', 11).update({ content: 'changed' });
    assert.equal((await readDirectorReview(db, 9, 11)).state.tableApproved, false);
    await assert.rejects(readDirectorReview(db, 999, 11), /不属于/);
  } finally {
    if (created && /^xoi_review_test_[a-f0-9]{16}$/.test(schema)) await db.raw('DROP SCHEMA ?? CASCADE', [schema]);
    await db.destroy();
  }
});
