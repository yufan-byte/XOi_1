import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import u from '@/utils';
import { success, error } from '@/lib/responseFormat';
import { requireDirectorReview } from './directorStageReview';
import { directorTailFrame, videoContinuityPlans, validateVideoContinuity, continuityVideoInput, runDependentVideoJobs } from './directorVideoContinuity';
import { capturePoints, pricingContextFromModel, releasePoints, reservePoints, type BillingReservation } from './billing';
import {releaseLifecycle} from './releaseLifecycle';

type TrackInput={trackId:number;prompt:string;duration:number;uploadData:Array<{id:number;sources:string}>};
type Input={projectId:number;scriptId:number;model:string;mode:string;resolution:string;audio?:boolean;trackData:TrackInput[]};
export async function submitDirectorVideos(userId:number,input:Input,res:Response,single=false) {
  const finishBackground=releaseLifecycle.beginBackground();
  try {
  const {projectId,scriptId,model,mode,resolution,audio,trackData}=input;
  const review=await requireDirectorReview(u.db,projectId,scriptId);
  if(review)return res.status(409).send(error(review));
  if(!trackData.length||trackData.length>100||new Set(trackData.map(t=>t.trackId)).size!==trackData.length)return res.status(400).send(error('请选择1–100个不同的视频轨道'));
  const textOnly = mode === 'text' || mode === 'textToVideo';
  if (textOnly && trackData.some(t => t.uploadData.length)) return res.status(400).send(error('文生视频不接收参考素材，请切换参考图生视频或清除本次参考'));
  const plans=await videoContinuityPlans(u.db,projectId,scriptId,!textOnly);
  const project=await u.db('o_project').where({id:projectId,userId}).first();
  if(!project)return res.status(404).send(error('项目不存在'));
  const requested=new Set(trackData.map(t=>t.trackId));
  const imageCache=new Map<string,Promise<string>>();
  const readImage=(p:string)=>{let cached=imageCache.get(p);if(!cached){cached=u.oss.getImageBase64(p);imageCache.set(p,cached);}return cached;};
  // Everything that can be validated without a generation happens before reservations or task creation.
  let prepared;
  try {
    prepared=await Promise.all(trackData.map(async track=>{
      const plan=plans.find(p=>p.trackId===track.trackId);
      if(!plan)throw Error('视频轨道不属于当前剧集');
      if (!textOnly) validateVideoContinuity(plan);
      const references:Array<{type:'image'|'audio';base64:string}>=[];
      for(const ref of track.uploadData){
        let file:any;
        if(ref.sources==='storyboard')file=await u.db('o_storyboard').where({id:ref.id,projectId,scriptId}).first();
        else if(ref.sources==='assets')file=await u.db('o_assets as a').join('o_image as i','i.id','a.imageId').where({'a.id':ref.id,'a.projectId':projectId}).select('i.filePath','a.type').first();
        if(!file?.filePath)throw Error('参考素材未完成或不属于当前项目，请核对参考资料');
        references.push({type:file.type==='audio'?'audio':'image',base64:await readImage(file.filePath)});
      }
      let tail:string|undefined;
      const dependency=!textOnly&&plan.continues&&plan.previousTrackId!==null&&requested.has(plan.previousTrackId)?plan.previousTrackId:null;
      if(!textOnly&&plan.continues&&dependency===null){
        if (!plan.previousVideoId) throw Error('请先采用上一片段的视频版本，再执行连续动作接镜');
        const previous=await u.db('o_video').where({id:plan.previousVideoId,projectId,scriptId,videoTrackId:plan.previousTrackId!}).whereIn('state',['生成成功','已完成']).first();
        if(!previous?.filePath)throw Error('上一镜视频尚未完成，连续动作需要先完成上一镜');
        tail=await directorTailFrame(u.getPath('oss'),projectId,previous.filePath);
      }
      // Read canonical assets now, not half-way through the paid batch.
      const images=new Map<string,string>();
      if (!textOnly && plan.anchor?.filePath) images.set(plan.anchor.filePath, await readImage(plan.anchor.filePath));
      const image=async(p:string)=>{const value=images.get(p);if(!value)throw Error('参考素材已失效');return value;};
      await continuityVideoInput(plan,model,track.prompt,references,image,tail || (dependency ? 'pending-local-predecessor-frame' : undefined),mode);
      return {...track,plan,index:plan.index,dependency,references,images,tail};
    }));
  } catch(e) {return res.status(400).send(error(u.error(e).message));}
  const batchId=randomUUID(),reservations: Array<BillingReservation|null>=[];
  try {
    for(const [i,track] of trackData.entries()){
      const reservation=userId?await reservePoints({userId,requestId:`drama-video:${batchId}:${i}`,scene:'drama.video',action:'video_generate',description:single?'漫剧视频生成':'漫剧批量视频生成',pricingCtx:pricingContextFromModel(model),referenceType:'video_task',referenceId:batchId,metadata:{duration:track.duration,resolution,audio:Boolean(audio)}}):null;
      if(reservation&&!reservation.success)throw Error(reservation.message||'积分不足');
      reservations.push(reservation);
    }
    const tasks=await u.db.transaction(async trx=>{
      const result=[];
      for(const [i,track] of prepared.entries()){
        const videoPath=`/${projectId}/video/${randomUUID()}.mp4`;
        const [row]=await trx('o_video').insert({filePath:videoPath,time:Date.now(),state:'生成中',projectId,scriptId,videoTrackId:track.trackId}).returning('*');
        result.push({...track,videoId:Number(row.id),videoPath,reservation:reservations[i]});
      }
      return result;
    });
    const pointsDeducted=reservations.reduce((n,r)=>n+Number(r?.deducted||0),0);
    const balance=Number((await u.db('o_user').where('id',userId).first())?.points||0);
    res.status(200).send(success(single?tasks[0].videoId:{tasks:tasks.map(t=>({videoId:t.videoId,trackId:t.trackId})),pointsDeducted,balance}));
    let modeData:any=mode;
    try{if(mode.startsWith('['))modeData=JSON.parse(mode);}catch{}
    const completed=new Map<number,string>();
    await runDependentVideoJobs(tasks,async task=>{
      let tail=task.tail;
      if(task.dependency!==null){
        const previousPath=completed.get(task.dependency);
        if(!previousPath)throw Error('上一镜本轮未交付，本镜未提交模型');
        tail=await directorTailFrame(u.getPath('oss'),projectId,previousPath);
      }
      const media=await continuityVideoInput(task.plan,model,task.prompt,task.references,async p=>task.images.get(p)!,tail,mode);
      const ai=u.Ai.Video(model as `${string}:${string}`);
      await ai.run({...media,mode:modeData,duration:task.duration,resolution,audio,aspectRatio:(project.videoRatio as '16:9'|'9:16')||'16:9'}, {projectId,taskClass:'视频生成',describe:!textOnly&&task.plan.continues?'连续动作末帧接镜':'根据提示词生成视频',relatedObjects:JSON.stringify({projectId,scriptId,videoId:task.videoId,continuity:task.plan.first.continuity,sceneId:task.plan.first.sceneId,predecessorTrack:task.plan.previousTrackId,referenceCount:media.referenceList.length})});
      await ai.save(task.videoPath);
      await u.db('o_video').where({id:task.videoId}).update({state:'生成成功'});
      completed.set(task.trackId,task.videoPath);
      // A settlement error must never turn a delivered clip into a failure/refund.
      if(task.reservation)try{await capturePoints(task.reservation);}catch(e){console.error('[director-video] settlement pending',task.videoId,u.error(e).message);}
    },async(task,e)=>{
      await u.db('o_video').where({id:task.videoId}).update({state:'生成失败',errorReason:u.error(e).message});
      if(task.reservation)try{await releasePoints(task.reservation,'视频未交付，释放本任务预留');}catch(e){console.error('[director-video] refund pending',task.videoId,u.error(e).message);}
    });
  } catch(e) {
    if(!res.headersSent){
      for(const r of reservations)if(r)await releasePoints(r,'批量任务未提交，释放预留');
      return res.status(400).send(error(u.error(e).message));
    }
    console.error('[director-video] background job error',u.error(e).message);
  }
  } finally {finishBackground();}
}
