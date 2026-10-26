import type {Knex} from 'knex';
import {creativeIds} from './creativeIds';
import {withSecuritySchemaLock} from './securitySchema';
import { readContinuity, type Continuity } from './directorContinuity';

/** Additive migration. Legacy references are retained with deterministic assetId fallback. */
export async function ensureStoryboardReferenceOrder(db:Knex){
  await withSecuritySchemaLock(db,async trx=>{
    if(!await trx.schema.hasColumn('o_assets2Storyboard','sortOrder'))await trx.schema.alterTable('o_assets2Storyboard',t=>t.integer('sortOrder'));
    if(!await trx.schema.hasColumn('o_storyboard','continuity'))await trx.schema.alterTable('o_storyboard',t=>t.text('continuity'));
    if(await trx.schema.hasTable('o_agentWorkData')){
      const info=await trx('o_agentWorkData').columnInfo('data');
      if(info?.type==='character varying')await trx.schema.alterTable('o_agentWorkData',t=>t.text('data').alter());
    }
  });
}
/** SQLite accepts 64-bit integers; PostgreSQL integer does not hold Date.now(). */
export async function ensureVideoTimestampWidth(db:Knex){
  await withSecuritySchemaLock(db,async trx=>{
    if(!await trx.schema.hasTable('o_video'))return;
    const info=await trx('o_video').columnInfo('time');
    if(info?.type==='integer')await trx.schema.alterTable('o_video',t=>t.bigInteger('time').alter());
  });
}
export interface NewStoryboard {
  continuity?: Continuity | null;
  prompt:string;duration:number;track:string;state:string;videoDesc:string;shouldGenerateImage:number;associateAssetsIds:number[];
}
/** Revise existing shots without deleting images/videos or duplicating their tracks. */
export function updateStoryboardContinuity(db:Knex,projectId:number,scriptId:number,id:number,continuity:Continuity,associateAssetsIds:number[]) {
  return db.transaction(async trx=>{
    await trx('o_project').where({id:projectId}).forUpdate().first();
    const frame=await trx('o_storyboard').where({id,projectId,scriptId}).first();
    if(!frame)throw Error('镜头不属于当前剧集');
    const ids=[...new Set(associateAssetsIds)];
    const assets=ids.length?await trx('o_assets').where({projectId}).whereIn('id',ids).select('id','type'):[];
    if(assets.length!==ids.length)throw Error('参考资产不属于当前项目');
    const c=readContinuity(continuity)!;
    // Agent edits cannot author restorable file history or overwrite a human review record.
    const stored = readContinuity(frame.continuity);
    c.imageHistory = stored?.imageHistory;
    c.review = stored?.review;
    if(c.sceneId&&!assets.some(a=>Number(a.id)===c.sceneId&&a.type==='scene'))throw Error('连续性场景必须关联当前项目的场景资产');
    await trx('o_storyboard').where({id,projectId,scriptId}).update({continuity:JSON.stringify(c),reason:'衔接方案已更新，已有图片/视频仍为历史结果；重新生成后应用新方案'});
    await trx('o_assets2Storyboard').where({storyboardId:id}).delete();
    if(ids.length)await trx('o_assets2Storyboard').insert(ids.map((assetId,sortOrder)=>({storyboardId:id,assetId,sortOrder})));
  });
}
/** Relational records remain visible even if the optional Agent layout cache was never saved. */
export async function readStoryboards(db:Knex,projectId:number,scriptId:number,imageUrl:(path:string)=>Promise<string>=async p=>p){
  const rows=await db('o_storyboard').where({projectId,scriptId}).orderBy('index','asc','last').orderBy('id');
  const links=await db('o_assets2Storyboard').whereIn('storyboardId',rows.map(f=>f.id)).orderBy('sortOrder','asc','last').orderBy('assetId');
  return Promise.all(rows.map(async f=>({id:Number(f.id),trackId:Number(f.trackId),index:f.index,duration:Number(f.duration||0),prompt:f.prompt,continuity:readContinuity(f.continuity),associateAssetsIds:links.filter(l=>Number(l.storyboardId)===Number(f.id)).map(l=>Number(l.assetId)),src:f.filePath?await imageUrl(f.filePath).catch(()=>''):'',state:f.state,videoDesc:f.videoDesc,shouldGenerateImage:f.shouldGenerateImage,reason:f.reason||'',flowId:f.flowId})));
}
/** Frames, ordered references, tracks and response data commit together or not at all. */
export async function saveStoryboardBatch(db:Knex,projectId:number,scriptId:number,data:NewStoryboard[]){
  const allocator=creativeIds(db);await allocator.ensure();
  return db.transaction(async trx=>{
    const p=await trx('o_project').where('id',projectId).forUpdate().first();
    if(!p||!await trx('o_script').where({id:scriptId,projectId}).first())throw Error('剧本不属于当前项目');
    for(const item of data){
      const continuity=readContinuity(item.continuity);
      if (continuity) { delete continuity.imageHistory; delete continuity.review; }
      if(continuity?.sceneId){
        if(!item.associateAssetsIds.includes(continuity.sceneId)||!await trx('o_assets').where({id:continuity.sceneId,projectId,type:'scene'}).first())throw Error('连续性场景必须关联当前项目的场景资产');
      }
      const [row]=await trx('o_storyboard').insert({continuity:continuity?JSON.stringify(continuity):null,prompt:item.prompt,duration:String(item.duration),state:item.state,scriptId,projectId,track:item.track,videoDesc:item.videoDesc,shouldGenerateImage:item.shouldGenerateImage,createTime:Date.now()}).returning('*');
      const references=[...new Set(item.associateAssetsIds)];
      if(references.length){
        const owned=await trx('o_assets').where('projectId',projectId).whereIn('id',references).select('id');
        if(owned.length!==references.length)throw Error('参考资产不属于当前项目');
        await trx('o_assets2Storyboard').insert(references.map((assetId,sortOrder)=>({storyboardId:row.id,assetId,sortOrder})));
      }
    }
    const frames=await trx('o_storyboard').where({projectId,scriptId}).orderBy('id');
    for(const track of new Set(frames.map(f=>f.track))){
      const group=frames.filter(f=>f.track===track),duration=group.reduce((n,f)=>n+Number(f.duration),0);
      let trackId=group.find(f=>f.trackId)?.trackId;
      if(trackId)await trx('o_videoTrack').where({id:trackId,projectId,scriptId}).update({duration});
      else{
        trackId=await allocator.next(trx);
        await trx('o_videoTrack').insert({id:trackId,projectId,scriptId,duration});
      }
      await trx('o_storyboard').whereIn('id',group.map(f=>f.id)).where({projectId,scriptId}).update({trackId});
    }
    const stored=await trx('o_storyboard').where({projectId,scriptId}).orderBy('id');
    const links=await trx('o_assets2Storyboard').whereIn('storyboardId',stored.map(f=>f.id)).orderBy('sortOrder','asc','last').orderBy('assetId');
    return stored.map(f=>({...f,associateAssetsIds:links.filter(l=>Number(l.storyboardId)===Number(f.id)).map(l=>Number(l.assetId))}));
  });
}

/** Serialized row locks make concurrent double-clicks idempotent without deleting existing media. */
export async function createUnlinkedStoryboardTracks(db:Knex,projectId:number,scriptId:number,storyboardIds:number[],duration=8){
  const allocator=creativeIds(db);await allocator.ensure();
  return db.transaction(async trx=>{
    const frames=await trx('o_storyboard').where({projectId,scriptId}).whereIn('id',storyboardIds).whereNull('trackId').orderBy('id').forUpdate();
    const result=[];
    for(const frame of frames){
      const trackId=await allocator.next(trx);
      await trx('o_videoTrack').insert({id:trackId,projectId,scriptId,duration});
      await trx('o_storyboard').where({id:frame.id,projectId,scriptId}).update({trackId});
      result.push({trackId,storyboardId:Number(frame.id)});
    }
    return result;
  });
}
