import type { Knex } from 'knex';

export function extractDirectorDraft(text: string) {
  const result: Record<string, string> = {};
  for (const stage of ['scriptPlan', 'storyboardTable']) {
    const matches = [...text.matchAll(new RegExp(`<${stage}>([\\s\\S]*?)<\\/${stage}>`, 'g'))];
    const content = matches.at(-1)?.[1]?.trim();
    if (content && content.length <= 200_000) result[stage] = content;
  }
  return result;
}

/** Only completed assistant responses can write these stages. Browser layout saves cannot overwrite them. */
export type DraftSource = { script: string; artStyle: string; directorManual: string; videoRatio: string };
export async function saveDirectorDraft(db: Knex, projectId: number, scriptId: number, text: string, model: string, source?: DraftSource) {
  const drafts = extractDirectorDraft(text);
  if (!Object.keys(drafts).length) return false;
  await db.transaction(async trx => {
    const project = await trx('o_project').where({ id: projectId }).forUpdate().first();
    const script = await trx('o_script').where({ id: scriptId, projectId }).first();
    if (!project || !script) throw Error('剧集不属于当前项目');
    if (source && (source.script !== (script.content || '') || source.artStyle !== (project.artStyle || '') || source.directorManual !== (project.directorManual || '') || source.videoRatio !== (project.videoRatio || ''))) throw Error('生成期间剧本或创作要求已更新，本次草案未覆盖工作区，请让助理基于最新内容调整');
    const key = { projectId, episodesId: scriptId, key: 'productionAgent' };
    const row = await trx('o_agentWorkData').where(key).first();
    const stored = row?.data ? JSON.parse(row.data) : {};
    const data = { ...stored, ...drafts, assistantDraft: { model, savedAt: Date.now() } };
    if (row) await trx('o_agentWorkData').where({ id: row.id }).update({ data: JSON.stringify(data), updateTime: Date.now() });
    else await trx('o_agentWorkData').insert({ ...key, data: JSON.stringify(data), createTime: Date.now() });
  });
  return true;
}
