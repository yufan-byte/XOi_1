import { createHash } from 'node:crypto';
import type { Knex } from 'knex';

export type DirectorStage = 'scriptPlan' | 'storyboardTable';
export function stageFingerprint(script: string, data: any, stage: DirectorStage) {
  return createHash('sha256').update(JSON.stringify([script || '', data.scriptPlan || '', stage === 'storyboardTable' ? data.storyboardTable || '' : '', data.reviewContext || null])).digest('hex');
}
export function directorReviewState(script: string, data: any) {
  const planReady = !!String(data.scriptPlan || '').trim();
  const tableReady = !!String(data.storyboardTable || '').trim();
  const planApproved = planReady && data.stageReviews?.scriptPlan?.fingerprint === stageFingerprint(script, data, 'scriptPlan');
  const tableApproved = planApproved && tableReady && data.stageReviews?.storyboardTable?.fingerprint === stageFingerprint(script, data, 'storyboardTable');
  return { planReady, tableReady, planApproved, tableApproved };
}
export async function readDirectorReview(db: Knex | Knex.Transaction, projectId: number, scriptId: number) {
  const script = await db('o_script').where({ id: scriptId, projectId }).first();
  if (!script) throw new Error('剧集不属于当前项目');
  const row = await db('o_agentWorkData').where({ projectId, episodesId: scriptId, key: 'productionAgent' }).first();
  let data: any = {};
  if (row?.data) data = JSON.parse(row.data);
  const project = await db('o_project').where({ id: projectId }).first();
  data.reviewContext = [project?.artStyle || '', project?.directorManual || '', project?.videoRatio || ''];
  return { script, row, data, state: directorReviewState(script.content || '', data) };
}
export async function requireDirectorReview(db: Knex, projectId: number, scriptId: number) {
  const { state } = await readDirectorReview(db, projectId, scriptId);
  if (!state.planApproved) return '请先完善并审核导演计划，再制作新镜头。已有作品可以继续预览和剪辑。';
  if (!state.tableApproved) return '请先完善并审核分镜表，再制作新镜头。已有作品可以继续预览和剪辑。';
  return '';
}
export async function approveDirectorStage(db: Knex, userId: number, input: { projectId: number; scriptId: number; stage: DirectorStage; content: string; scriptPlan: string; script: string }) {
  const { projectId, scriptId, stage } = input;
  return db.transaction(async trx => {
    const project = await trx('o_project').where({ id: projectId, userId }).forUpdate().first();
    if (!project) return { message: '无权审核此项目' };
    const { script, row, data, state } = await readDirectorReview(trx, projectId, scriptId);
    if (!row || !String(data[stage] || '').trim()) return { message: '请先补齐本阶段内容，再确认审核' };
    if (stage === 'storyboardTable' && !state.planApproved) return { message: '请先审核导演计划' };
    if (input.content !== data[stage] || input.scriptPlan !== data.scriptPlan || input.script !== (script.content || '')) return { message: '内容已经更新，请刷新核对后重新审核' };
    data.stageReviews = { ...data.stageReviews, [stage]: { fingerprint: stageFingerprint(script.content || '', data, stage), approvedAt: Date.now(), approvedBy: userId } };
    await trx('o_agentWorkData').where({ id: row.id }).update({ data: JSON.stringify(data) });
    return { state: directorReviewState(script.content || '', data) };
  });
}
