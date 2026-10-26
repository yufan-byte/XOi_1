// All paid work runs as owner-scoped durable server jobs, never browser retry loops.
import type {CatalogModel} from '@/lib/models';
import {collection} from '../adapters/collections';
import {runProjectGeneration,observeGenerationText} from '../adapters/generation';
import {videoReferences} from '../../../../../shared/oneStopMedia';
import {sceneSpeechSource} from '../../../../../shared/oneStopSpeech';
import {defaultShotVideoPrompt} from '../../../../../shared/oneStopPrompts';
import {sameName} from './caps';
import {shotsFor,type ComicProject,type ComicAsset,type ComicScene,type ComicBible,type ComicIntent,type ComicDirection,type ComicOutline,type ComicScript} from './types';
import type {MfVideoCaps} from '../multiframe/video-caps';
export function customStyleDesc(style:string){return collection<{id:string;name:string;prompt?:string}>('comic-styles').list().find(s=>s.name===style)?.prompt;}
export const styleLabel=(style:string)=>{const d=customStyleDesc(style);return d?style+'（'+d+'）':style;};
export const sceneCountFor=(seconds:number)=>Math.min(24,Math.max(2,shotsFor(seconds)));
export const storyContext=(p:ComicProject)=>p.idea;
const latest=(p:ComicProject)=>collection<ComicProject>('comic').get(p.id)!;
export async function generateBible(p:ComicProject):Promise<ComicBible>{await runProjectGeneration(p,'bible');return latest(p).bible!;}
export async function extractIntent(p:ComicProject):Promise<ComicIntent>{await runProjectGeneration(p,'intent');return latest(p).intent!;}
export async function proposeDirections(p:ComicProject):Promise<ComicDirection[]>{await runProjectGeneration(p,'direction');return latest(p).directions!;}
export async function generateOutline(p:ComicProject,_episodeCount:number):Promise<ComicOutline>{await runProjectGeneration(p,'outline');return latest(p).outline!;}
export async function writeNovelChapter(p:ComicProject,index:number,onDelta?:(text:string)=>void,signal?:AbortSignal):Promise<string>{signal?.throwIfAborted();const stop=observeGenerationText(p.id,text=>onDelta?.(text));try{await runProjectGeneration(p,'novel',{index});const text=latest(p).novel!.chapters[index].text;onDelta?.(text);return text;}finally{stop();}}
export async function generateScript(p:ComicProject):Promise<ComicScript>{await runProjectGeneration(p,'script');return latest(p).script!;}
export async function extractAssets(p:ComicProject):Promise<ComicAsset[]>{await runProjectGeneration(p,'assets');return latest(p).assets.filter(a=>!a.custom);}
export async function generateAssetImage(p:ComicProject,a:ComicAsset,signal?:AbortSignal,_model?:CatalogModel):Promise<string>{signal?.throwIfAborted();return (await runProjectGeneration(p,'asset-image',{target:a.id})).url;}
export interface ShotSpec{prompt:string;shotSize:string;camera:string}
export async function writeShotPrompts(p:ComicProject,target:ComicScene[],_caps?:MfVideoCaps):Promise<Record<string,ShotSpec>>{const r=await runProjectGeneration(p,'shots',target.length===1?{target:target[0].id}:{});return Object.fromEntries(r.shots.map((s:any)=>[s.id,{prompt:s.prompt,shotSize:s.shotSize,camera:s.camera}]));}
export function sceneRefs(p:ComicProject,s:ComicScene){return p.assets.filter(a=>a.imageUrl&&(a.kind==='character'?s.characters.some(c=>sameName(a.name,c)):a.kind==='scene'&&sameName(a.name,s.location)));}
export async function generateStoryboard(p:ComicProject,s:ComicScene,prompt:string,signal?:AbortSignal,_model?:CatalogModel,variant:'main'|'extra'='main'):Promise<string>{signal?.throwIfAborted();return (await runProjectGeneration(p,'storyboard-image',{target:s.id,prompt,variant})).url;}
export function defaultVideoPrompt(p:ComicProject,s:ComicScene){return defaultShotVideoPrompt(p,s,styleLabel(p.style));}
export function sceneVideoRefCount(p:ComicProject,s:ComicScene,model?:CatalogModel){if(!model)return 0;try{return Math.max(0,videoReferences(p,s.id,model).images.length-1);}catch{return 0;}}
export async function generateSceneVideo(p:ComicProject,s:ComicScene,prompt:string,seconds:number,onProgress?:(n:number)=>void,signal?:AbortSignal,_model?:CatalogModel,onSubmitted?:(id:string)=>void){signal?.throwIfAborted();const r=await runProjectGeneration(p,p.videoProduction==='image-motion'?'motion-video':'scene-video',{target:s.id,prompt,seconds});onProgress?.(100);if(r.upstreamId)onSubmitted?.(r.upstreamId);return {url:r.url,taskId:r.upstreamId||''};}
export async function generateSceneSpeech(p:ComicProject,s:ComicScene,_model?:CatalogModel):Promise<string>{return (await runProjectGeneration(p,'speech',{target:s.id,replace:!!s.speechUrl&&s.speechStatus==='done'&&(!s.speechSource||s.speechSource===sceneSpeechSource(p,s))})).url;}
export async function generateVoiceSample(p:ComicProject,text:string,voice:string,_model?:CatalogModel):Promise<string>{return (await runProjectGeneration(p,'voice-sample',{prompt:text,voice})).url;}
