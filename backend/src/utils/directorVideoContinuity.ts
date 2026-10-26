import type { Knex } from 'knex';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mediaCommand } from '../lib/oneStop/mediaProduction';
import { loadDirectorContinuity, continuityPrompt, selectedContinuityAnchor } from './directorContinuity';
import { orderedDirectorTrackIds } from './directorTrackOrder';

/** Local project archives only: FFmpeg never opens a client URL or a file from another project. */
export async function directorTailFrame(root:string, projectId:number, relative:string) {
  const normalized=relative.replace(/^\/oss\//,'/');
  if(!Number.isSafeInteger(projectId)||projectId<1||!new RegExp(`^/${projectId}/video/[a-f0-9-]+\\.(mp4|webm)$`).test(normalized))throw Error('上一镜视频尚未归档到本项目');
  const realRoot=await fs.realpath(root), folder=path.join(realRoot,String(projectId),'video');
  const file=await fs.realpath(path.join(realRoot,normalized.slice(1)));
  if(await fs.realpath(folder)!==folder||!file.startsWith(folder+path.sep))throw Error('上一镜视频路径无效');
  const stat=await fs.stat(file);
  if(!stat.isFile()||stat.size<1||stat.size>256*1024*1024)throw Error('上一镜视频文件无效或超过256MB');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'xoi-director-tail-'));
  try {
    const output=path.join(temp,'tail.jpg');
    await mediaCommand('ffmpeg',['-nostdin','-v','error','-threads','2','-filter_threads','1','-protocol_whitelist','file','-format_whitelist','mov,matroska,webm','-sseof','-0.12','-i',file,'-frames:v','1','-vf',"scale='min(1600,iw)':-2",'-q:v','3',output],undefined,30_000);
    return 'data:image/jpeg;base64,'+(await fs.readFile(output)).toString('base64');
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
}

export async function videoContinuityPlans(db:Knex,projectId:number,scriptId:number,useReferences=true) {
  const frames=await loadDirectorContinuity(db,projectId,scriptId);
  const standalone=await db('o_videoTrack').where({projectId,scriptId}).orderBy('id');
  const tracks=orderedDirectorTrackIds(frames, standalone);
  return tracks.map((trackId,index)=>{
    const group=frames.filter(f=>Number(f.trackId)===trackId),first=group[0] || {continuity:null,sceneId:null,sceneName:'',references:[],trackId};
    const previous=frames[frames.indexOf(first)-1];
    // Validate every frame in a grouped clip, not only its opening storyboard.
    if (useReferences) for (const frame of group) selectedContinuityAnchor(frames, frame);
    const anchor = useReferences ? selectedContinuityAnchor(frames, first as typeof frames[number]) : undefined;
    return {trackId,index,first,group,previous,anchor,previousVideoId:previous?Number(standalone.find(t => Number(t.id) === Number(previous.trackId))?.videoId || 0):0,previousTrackId:previous?Number(previous.trackId):null,continues:first.continuity?.transition==='continue'};
  });
}
export type VideoContinuityPlan=Awaited<ReturnType<typeof videoContinuityPlans>>[number];
export function validateVideoContinuity(plan:VideoContinuityPlan) {
  if(plan.continues&&(!plan.previous||!plan.first.sceneId||plan.first.sceneId!==plan.previous.sceneId))throw Error('连续动作接镜必须与上一镜关联同一个场景，请先核对分镜表');
}

export async function continuityVideoInput(plan:VideoContinuityPlan,model:string,prompt:string,refs:Array<{type:any;base64:string}>,image:(p:string)=>Promise<string>,tail?:string,mode='singleImage') {
  const textOnly = mode === 'text' || mode === 'textToVideo';
  if (!textOnly) validateVideoContinuity(plan);
  const nativeSeedance=/^newapi:seedance2\.(?:0|5)(?:-fast)?-line\d+(?:-xoi)?$/i.test(model);
  let references=textOnly?[]:[...refs];
  const legend=references.map((_,i)=>`参考${i+1}：本镜画面或用户选择的资产`);
  if(!textOnly && plan.continues){
    if(!tail)throw Error('上一镜视频尚未完成，本镜未提交模型，请完成上一镜后继续');
    references=nativeSeedance?[{type:'image',base64:tail},...references]:[{type:'image',base64:tail}];
    legend.length=0;
    legend.push('参考1：上一镜真实视频的末帧，必须以此作为起始画面，自然延续动作');
    if(nativeSeedance)for(let i=1;i<references.length;i++)legend.push(`参考${i+1}：本镜目标构图/资产，不要突然跳变到该构图`);
  }
  // Only explicitly selected references enter a video request. A pinned layout is an explicit continuity setting.
  if (!textOnly && nativeSeedance && plan.anchor?.filePath) {
    references.push({type:'image',base64:await image(plan.anchor.filePath)});
    legend.push(`参考${references.length}：用户固定的空间布局锚点，保留床、门窗、家具的位置关系`);
  }
  if(references.length>32)throw Error('本镜参考资料超过模型上限，请减少参考图后重试');
  const scene = plan.first.references.find((a: { type: string; id: unknown; describe?: string }) => a.type === 'scene' && Number(a.id) === plan.first.sceneId);
  const internal = (plan.group || []).slice(1).map((frame, i) => `\n本片段内部第${i + 2}张分镜：` + continuityPrompt(frame.continuity, frame.sceneName, plan.group[i]?.continuity)).join('');
  return {referenceList:references,prompt:prompt+continuityPrompt(plan.first.continuity,plan.first.sceneName,plan.previous?.continuity)+internal+(scene?.describe?'\n固定场景设定：'+scene.describe:'')+(legend.length?'\n参考图对应关系：'+legend.join('；'):'')};
}

/** Wait for the current batch predecessor, never fall back to an older successful render after its retry failed. */
export async function runDependentVideoJobs<T extends {trackId:number;dependency:number|null;index:number}>(jobs:T[],run:(job:T)=>Promise<void>,failed:(job:T,error:unknown)=>Promise<void>,limit=2) {
  const outcomes=new Map<number,Promise<boolean>>();
  let active=0;
  const waiting:Array<()=>void>=[];
  async function slot(fn:()=>Promise<void>) {
    if(active>=limit)await new Promise<void>(resolve=>waiting.push(resolve));
    active++;
    try{await fn();}finally{active--;waiting.shift()?.();}
  }
  for(const job of [...jobs].sort((a,b)=>a.index-b.index)){
    const dependency=job.dependency===null?undefined:outcomes.get(job.dependency);
    const result=(async()=>{
      try{
        if(dependency&&!await dependency)throw Error('上一镜本轮生成失败，本镜未提交模型；修复上一镜后再继续');
        await slot(()=>run(job));return true;
      }catch(e){await failed(job,e);return false;}
    })();
    outcomes.set(job.trackId,result);
  }
  await Promise.all(outcomes.values());
}
