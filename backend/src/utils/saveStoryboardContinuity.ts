import type { Knex } from 'knex';
import { loadDirectorContinuity, readContinuity, type Continuity } from './directorContinuity';

export async function saveStoryboardContinuity(db: Knex, input: {
  projectId: number; scriptId: number; id: number; continuity: Continuity; expectedContinuity: Continuity | null; applySceneLayout?: boolean;
}) {
  const { projectId, scriptId, id } = input;
  const continuity = readContinuity(input.continuity)!;
  return db.transaction(async trx => {
    const frame = await trx('o_storyboard').where({ id, projectId, scriptId }).forUpdate().first();
    if (!frame) throw Error('镜头不属于当前剧集');
    if (JSON.stringify(readContinuity(frame.continuity)) !== JSON.stringify(readContinuity(input.expectedContinuity))) throw Error('衔接设置已被其他操作更新，请重新打开检查后再保存');
    const frames = await loadDirectorContinuity(trx, projectId, scriptId);
    const current = frames.find(f => Number(f.id) === id)!;
    if (continuity.sceneId && !current.references.some((a: { type: string; id: unknown }) => a.type === 'scene' && Number(a.id) === continuity.sceneId)) throw Error('请选择本镜已关联的场景资产');
    if (continuity.anchorStoryboardId) {
      const anchor = frames.find(f => Number(f.id) === continuity.anchorStoryboardId);
      if (!anchor?.filePath || Number(anchor.id) === id || !continuity.sceneId || anchor.sceneId !== continuity.sceneId) throw Error('空间锚点必须是本集中同场景的其他已出图镜头');
    }
    if (continuity.transition === 'continue') {
      const previous = frames[frames.findIndex(f => Number(f.id) === id) - 1];
      if (!previous || !continuity.sceneId || previous.sceneId !== continuity.sceneId) throw Error('连续动作接镜必须与上一镜关联同一个场景');
    }
    // Only generation/restore code may author file references in image history.
    continuity.imageHistory = readContinuity(frame.continuity)?.imageHistory;
    await trx('o_storyboard').where({ id, projectId, scriptId }).update({ continuity: JSON.stringify(continuity) });
    const updates: { id: number; continuity: Continuity }[] = [];
    if (input.applySceneLayout) {
      if (!continuity.sceneId || !continuity.spatialLayout?.trim()) throw Error('请先选择场景并填写固定布局');
      for (const other of frames.filter(f => Number(f.id) !== id && f.sceneId === continuity.sceneId)) {
        const row = await trx('o_storyboard').where({ id: other.id, projectId, scriptId }).forUpdate().first();
        const next = { ...(readContinuity(row.continuity) || { transition: 'cut' as const, startState: '', endState: '', screenDirection: '' }), sceneId: continuity.sceneId, spatialLayout: continuity.spatialLayout };
        await trx('o_storyboard').where({ id: other.id, projectId, scriptId }).update({ continuity: JSON.stringify(next) });
        updates.push({ id: Number(other.id), continuity: next });
      }
    }
    return { continuity, updates };
  });
}
