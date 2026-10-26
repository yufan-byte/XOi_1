import crypto from 'node:crypto';
import {planSpeech} from '../../../../shared/oneStopSpeech';
import {OneStopError} from './documents';
import {scenes,type Project,type GenerationRequest} from './generationPolicy';
export function speechPlan(p:Project,target:string,model:any,take?:string){
  const scene=scenes(p).find(s=>s.id===target);if(!scene)throw new OneStopError('目标镜头不存在');
  try{
    const parts=planSpeech(p,scene,model),nonce=take??scene.speechTake??'';
    return {scene,take:nonce,parts:parts.map(x=>({...x,key:crypto.createHash('sha256').update(JSON.stringify([target,model.modelName||model.id,x.voice,x.text,nonce])).digest('hex')}))};
  }catch(e){throw new OneStopError((e as Error).message);}
}
export function nextSpeechStep(p:Project,target:string,model:any,take?:string):GenerationRequest{
  const plan=speechPlan(p,target,model,take),index=plan.parts.findIndex(part=>!plan.scene.speechParts?.some((old:any)=>old.key===part.key&&old.url));
  return {projectId:p.id,operation:index<0?'speech-join':'speech-part',target,index:index<0?undefined:index,take:plan.take};
}
