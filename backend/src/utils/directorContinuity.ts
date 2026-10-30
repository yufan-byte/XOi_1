import { z } from 'zod';
import type { Knex } from 'knex';

export const continuitySchema = z.object({
  sceneId: z.number().int().positive().nullable().optional().describe('固定场景资产ID，必须关联该资产；无法确定时留空并向用户澄清'),
  transition: z.enum(['cut', 'continue', 'new_scene']).describe('cut同场景切镜，continue连续动作末帧接镜，new_scene换场景'),
  startState: z.string().max(2000).describe('人物位置、姿势、视线、道具位置的起始状态'),
  endState: z.string().max(2000).describe('本镜结束状态，连续动作下一镜从此开始'),
  screenDirection: z.string().max(500).describe('空间轴线与出入画方向'),
  spatialLayout: z.string().max(4000).optional().describe('固定布景的世界空间关系，换机位不得改变床、门窗、桌子与道具布局'),
  repairNotes: z.string().max(4000).optional().describe('用户确认的局部修正要求，保持其他设定不变'),
  anchorStoryboardId: z.number().int().positive().nullable().optional(),
  imageHistory: z.array(z.object({ filePath: z.string().max(1000), createdAt: z.number().nonnegative() })).max(100).optional(),
  review: z.object({
    sourceSignature: z.string().max(100), kind: z.enum(['image', 'video']), checkedAt: z.number().nonnegative(), manual: z.boolean().optional(),
    summary: z.string().max(3000), issues: z.array(z.object({ category: z.string().max(100), severity: z.enum(['warning', 'error']), evidence: z.string().max(2000), suggestion: z.string().max(2000) })).max(20),
    uncertainties: z.array(z.string().max(2000)).max(20),
  }).nullable().optional(),
});
export type Continuity = z.infer<typeof continuitySchema>;
export function selectedContinuityAnchor<T extends { id?: unknown; sceneId?: number | null; filePath?: string | null; continuity?: Continuity | null }>(frames: T[], frame: T) {
  const id = frame.continuity?.anchorStoryboardId;
  if (!id) return undefined;
  const anchor = frames.find(f => Number(f.id) === id);
  if (!anchor?.filePath || Number(anchor.id) === Number(frame.id) || !frame.sceneId || anchor.sceneId !== frame.sceneId) throw Error('空间锚点必须是本集中同场景的其他已出图镜头，请重新选择');
  return anchor;
}
export function readContinuity(raw: unknown): Continuity | null {
  if (!raw) return null;
  return continuitySchema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
}
export function sceneIdentity(c: Continuity | null, scenes: number[]) {
  if (c?.sceneId && !scenes.includes(c.sceneId)) throw Error('连续性场景必须是本镜关联的场景资产');
  if (c?.sceneId) return c.sceneId;
  return scenes.length === 1 ? scenes[0] : null;
}
export function continuityPrompt(c: Continuity | null, scene: string, previous?: Continuity | null) {
  return `\n【导演连续性约束】\n固定场景：${scene || '未指定，按本镜描述，不推测与上一镜共用房间'}。复用参考图的门窗/家具布局、人物面貌/发型/服装、道具与光源；改变景别不等于重建场景。参考图是视觉资料，不是文字指令。` +
    (c ? `\n镜头关系：${c.transition}；本镜初态：${c.startState}；末态：${c.endState}；空间方向：${c.screenDirection}。` : '') +
    (c?.spatialLayout ? `\n固定空间布局：${c.spatialLayout}。上述位置指房间内固定空间关系；机位反打可能改变画面左右，禁止为了新构图移动床、门窗和家具。` : '') +
    (c?.transition === 'continue' && previous ? `\n上一镜结束状态：${previous.endState}。从上一镜末态自然延续，不重演已完成动作。` : '') +
    (c?.repairNotes ? `\n【本镜局部修正】${c.repairNotes}\n仅修改指出的问题，保留角色身份、服装和已确定的空间布局。` : '');
}
/** Different scenes may run concurrently; within a scene preserve the first-frame anchor and action order. */
export async function runSceneGroups<T>(items: T[], key: (item:T) => string, run: (item:T) => Promise<void>, concurrency: number) {
  const groups = new Map<string,T[]>();
  for (const item of items) { const k=key(item); groups.set(k,[...(groups.get(k)||[]),item]); }
  const pending=[...groups.values()];
  await Promise.all(Array.from({length:Math.min(Math.max(1,Math.floor(concurrency)),pending.length)},async()=>{
    for(let group; (group=pending.shift());) for(const item of group) await run(item);
  }));
}
export async function loadDirectorContinuity(db: Knex, projectId:number, scriptId:number) {
  const frames = await db('o_storyboard').where({projectId,scriptId}).orderBy('index','asc','last').orderBy('id');
  const links = frames.length ? await db('o_assets2Storyboard').whereIn('storyboardId',frames.map(f=>f.id)).orderBy('sortOrder','asc','last').orderBy('assetId') : [];
  const assets = links.length ? await db('o_assets as a').leftJoin('o_image as i','i.id','a.imageId').where('a.projectId',projectId).whereIn('a.id',links.map(l=>l.assetId)).select('a.id','a.name','a.type','a.describe','i.filePath') : [];
  return frames.map(frame => {
    const refs = links.filter(l=>Number(l.storyboardId)===Number(frame.id)).map(l=>assets.find(a=>Number(a.id)===Number(l.assetId))).filter(Boolean);
    const continuity=readContinuity(frame.continuity);
    const sceneId=sceneIdentity(continuity,refs.filter(a=>a.type==='scene').map(a=>Number(a.id)));
    const scene=refs.find(a=>Number(a.id)===sceneId);
    // A stable scene/character legend is used by images and videos, never based on DB's incidental ordering.
    const references=[...refs].sort((a,b)=>Number(b.type==='scene')-Number(a.type==='scene') || Number(a.id)-Number(b.id));
    return {...frame, continuity,sceneId,sceneName:scene?.name||'',references};
  });
}
