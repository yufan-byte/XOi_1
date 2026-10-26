import crypto from 'node:crypto';
import type {Pool} from 'pg';
import {OneStopError,encodeOneStopPayload,validateOneStopPage,validateOneStopRevision,validateOneStopScope} from './documents';
import {validateProject} from './generationPolicy';

const stageFor:Record<string,string>={bible:'bible',intent:'intent',direction:'direction',outline:'outline',novel:'novel',script:'script',assets:'assets','asset-image':'assets',shots:'storyboard','storyboard-image':'storyboard','scene-video':'video','motion-video':'video',speech:'video','speech-part':'video','speech-join':'video',render:'video'};
const paths={premium:['input','intent','direction','outline','novel','script','assets','storyboard','video'],batch:['bible','script','assets','storyboard','video']};
export function historyStage(operation:string,snapshot:any){return operation==='restore'?snapshot?.scope:stageFor[operation];}
export function historyValue(p:any,operation:string,scope?:string){
  const stage=scope||stageFor[operation];
  if(operation==='render')return p.finalMovie??null;
  if(stage==='assets')return p.assets;
  if(['storyboard','video'].includes(stage))return p.script??null;
  if(stage==='direction')return {direction:p.direction??null,directions:p.directions??null};
  return p[stage]??null;
}
/** Stage-only recovery: no model call, no file deletion, preserve a reversible backup. */
export function restoreStage(current:any,entry:any){
  const snapshot=entry.before_payload,stage=historyStage(entry.operation,snapshot);
  const operation=entry.operation==='restore'?snapshot?.sourceOperation:entry.operation;
  if(!stage||!Object.hasOwn(snapshot||{},'value'))throw new OneStopError('这个历史记录没有可恢复的阶段内容');
  const next=structuredClone(current),value=structuredClone(snapshot.value);
  if(operation==='render'){if(value)next.finalMovie=value;else delete next.finalMovie;}
  else if(stage==='assets')next.assets=value??[];
  else if(['storyboard','video'].includes(stage)){
    const fields=stage==='storyboard'?['shotPrompt','shotSize','camera','videoSeconds','imageUrl','altImages','imageStatus','imageError']:['videoPrompt','videoUrl','videoStatus','videoError','videoTaskId','videoProgress','videoSeconds','videoSource','chainFrom','speechUrl','speechStatus','speechSource','speechError','speechTake','speechParts'];
    const oldScenes=new Map((value?.episodes||[]).flatMap((e:any)=>e.scenes||[]).map((s:any)=>[s.id,s]));
    for(const ep of next.script?.episodes||[])for(const scene of ep.scenes||[]){const old:any=oldScenes.get(scene.id);for(const field of fields){if(old&&Object.hasOwn(old,field))scene[field]=old[field];else delete scene[field];}}
  }
  else if(stage==='direction'){next.direction=value?.direction??undefined;next.directions=value?.directions??undefined;}
  else {if(value===null)delete next[stage];else next[stage]=value;}
  for(const ep of next.script?.episodes||[])for(const s of ep.scenes||[]){
    for(const [state,url] of [['imageStatus','imageUrl'],['videoStatus','videoUrl'],['speechStatus','speechUrl']])if(s[state]==='running')s[state]=s[url]?'done':'idle';
  }
  const path=current.kind==='batch'?paths.batch:paths.premium,index=path.indexOf(stage);
  next.done={...next.done};for(const key of path.slice(Math.max(0,index)))next.done[key]=false;
  next.stage=stage;next.status='进行中';
  if(next.finalMovie&&operation!=='render')next.finalMovie.source='';
  validateProject(next);encodeOneStopPayload(current.id,next);
  return next;
}
/** The existing generation-history table is authoritative. No parallel user-data store. */
export class OneStopHistory{
  constructor(private pool:Pool){}
  private async owned(user:number,id:string){
    validateOneStopScope(user,'comic',id);
    const found=await this.pool.query("SELECT revision FROM xoi_one_stop_documents WHERE user_id=$1 AND collection='comic' AND document_id=$2 AND deleted_at IS NULL",[user,id]);
    if(!found.rows.length)throw new OneStopError('项目不存在或已删除',404);
  }
  async list(user:number,id:string,page=1){
    await this.owned(user,id);validateOneStopPage(page,20);
    const found=await this.pool.query(`SELECT revision,operation,task_id,created_at,before_payload->>'scope' AS scope
      FROM xoi_one_stop_generation_history WHERE user_id=$1 AND project_id=$2
      ORDER BY revision DESC LIMIT 21 OFFSET $3`,[user,id,(page-1)*20]);
    return {items:found.rows.slice(0,20).map(r=>({revision:Number(r.revision),operation:r.operation,stage:stageFor[r.operation]||r.scope,createdAt:Number(r.created_at)})),page,hasMore:found.rows.length>20};
  }
  async get(user:number,id:string,version:number){
    await this.owned(user,id);validateOneStopRevision(version,1);
    const found=await this.pool.query('SELECT revision,operation,created_at,before_payload FROM xoi_one_stop_generation_history WHERE user_id=$1 AND project_id=$2 AND revision=$3',[user,id,version]);
    if(!found.rows.length)throw new OneStopError('历史版本不存在',404);
    const row=found.rows[0];return {revision:Number(row.revision),operation:row.operation,sourceOperation:row.operation==='restore'?row.before_payload.sourceOperation:row.operation,stage:historyStage(row.operation,row.before_payload),createdAt:Number(row.created_at),value:row.before_payload?.value??null};
  }
  async restore(user:number,id:string,version:number,revision:number,clientId:string){
    validateOneStopScope(user,'comic',id);validateOneStopRevision(version,1);validateOneStopRevision(revision,1);
    if(!/^[A-Za-z0-9_-]{16,100}$/.test(clientId))throw new OneStopError('恢复操作编号无效');
    const client=await this.pool.connect(),lease=crypto.randomUUID(),now=Date.now();
    try{
      await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
      // Same admission row as generation submission: restore and generation cannot cross.
      const admitted=await client.query(`INSERT INTO xoi_one_stop_admissions(user_id,project_id,lease_token,expires_at) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id,project_id) DO UPDATE SET lease_token=excluded.lease_token,expires_at=excluded.expires_at
        WHERE xoi_one_stop_admissions.expires_at<$5 RETURNING lease_token`,[user,id,lease,now+30000,now]);
      if(!admitted.rows.length)throw new OneStopError('项目正在提交任务，请稍后再恢复',409);
      const doc=await client.query("SELECT payload,revision FROM xoi_one_stop_documents WHERE user_id=$1 AND collection='comic' AND document_id=$2 AND deleted_at IS NULL FOR UPDATE",[user,id]);
      if(!doc.rows.length)throw new OneStopError('项目不存在或已删除',404);
      const previous=await client.query('SELECT before_payload FROM xoi_one_stop_generation_history WHERE user_id=$1 AND project_id=$2 AND task_id=$3',[user,id,'restore_'+clientId]);
      if(previous.rows.length){if(Number(previous.rows[0].before_payload.restoreOf)!==version)throw new OneStopError('操作编号已用于其他版本',409);}
      else{
        if(Number(doc.rows[0].revision)!==revision)throw new OneStopError('项目已被修改，请重新查看当前版本再恢复',409);
        const active=await client.query("SELECT task_id FROM xoi_generation_tasks WHERE user_id=$1 AND kind='one-stop' AND status IN ('queued','running','unknown') AND payload::jsonb->>'projectId'=$2 LIMIT 1",[user,id]);
        if(active.rows.length)throw new OneStopError('请先完成或核对当前任务，再恢复历史版本',409);
        const found=await client.query('SELECT operation,before_payload FROM xoi_one_stop_generation_history WHERE user_id=$1 AND project_id=$2 AND revision=$3',[user,id,version]);
        if(!found.rows.length)throw new OneStopError('历史版本不存在',404);
        const entry=found.rows[0],current=doc.rows[0].payload,next=restoreStage(current,entry),stage=historyStage(entry.operation,entry.before_payload),sourceOperation=entry.operation==='restore'?entry.before_payload.sourceOperation:entry.operation;
        next.log=[...(current.log||[]).slice(-199),`${new Date(now).toISOString()} 已恢复 ${stage} 的生成前版本 #${version}；恢复不调用模型、不扣积分`];
        await client.query(`INSERT INTO xoi_one_stop_generation_history(user_id,project_id,revision,task_id,operation,before_payload,created_at)
          VALUES($1,$2,$3,$4,'restore',$5::jsonb,$6)`,[user,id,revision,'restore_'+clientId,JSON.stringify({stage:current.stage,scope:stage,sourceOperation,value:historyValue(current,sourceOperation,stage),restoreOf:version}),now]);
        const saved=await client.query("UPDATE xoi_one_stop_documents SET payload=$3::jsonb,revision=revision+1,updated_at=GREATEST($4,updated_at+1) WHERE user_id=$1 AND collection='comic' AND document_id=$2 AND revision=$5 RETURNING revision",[user,id,encodeOneStopPayload(id,next),now,revision]);
        if(saved.rows.length!==1)throw new OneStopError('项目版本已变化，原内容保留',409);
      }
      await client.query('DELETE FROM xoi_one_stop_admissions WHERE user_id=$1 AND project_id=$2 AND lease_token=$3',[user,id,lease]);
      await client.query('COMMIT');return {restored:true};
    }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }
}
