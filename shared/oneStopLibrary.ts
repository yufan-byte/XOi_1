import {movieCurrent} from './oneStopMedia';

export type LibraryKind='image'|'video'|'movie'|'audio';
export type LibraryState='ready'|'pending'|'running'|'review';
export interface ProjectMedia {
  id:string; kind:LibraryKind; origin:'asset'|'keyframe'|'clip'|'movie'|'speech';
  title:string; description:string; url?:string; poster?:string; state:LibraryState;
  label:string; assetId?:string; sceneId?:string; seconds?:number;
}
const mediaUrl=(value:unknown):string|undefined=>typeof value==='string'&&/^(?:\/oss\/|https:\/\/)/i.test(value)?value:undefined;
const imageUrl=(value:unknown):string|undefined=>mediaUrl(value)||(typeof value==='string'&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)?value:undefined);
const stateOf=(status:unknown,url?:string):LibraryState=>status==='stale'||status==='error'?'review':status==='running'?'running':url?'ready':'pending';
/** Read-through projection of existing project records. Never creates, copies or deletes media. */
export function projectMedia(p:any):ProjectMedia[]{
  if(!p)return [];
  const out:ProjectMedia[]=[],seen=new Set<string>();
  const add=(entry:ProjectMedia)=>{if(!seen.has(entry.id)){seen.add(entry.id);out.push(entry);}};
  if(mediaUrl(p.finalMovie?.url))add({id:'movie:main',kind:'movie',origin:'movie',title:p.script?.title||p.name||'项目成片',description:movieCurrent(p)?'已合成并归档到服务器':'镜头或配音有更新，旧成片保留，可重新合成',url:mediaUrl(p.finalMovie.url),poster:mediaUrl(p.cover),state:movieCurrent(p)?'ready':'review',label:'MP4 成片',seconds:p.finalMovie.duration});
  const episodes=Array.isArray(p.script?.episodes)?p.script.episodes:[];
  episodes.forEach((e:any,ei:number)=>(Array.isArray(e.scenes)?e.scenes:[]).forEach((s:any,si:number)=>{
    const title=`${String(ei+1).padStart(2,'0')}-${String(si+1).padStart(2,'0')} · ${s.location||'未命名镜头'}`;
    const description=[s.time,s.action||s.videoPrompt||s.shotPrompt].filter(Boolean).join(' · ');
    const poster=imageUrl(s.imageUrl);
    if(mediaUrl(s.videoUrl)||s.videoStatus==='running'||s.videoStatus==='error')add({id:`clip:${s.id}`,kind:'video',origin:'clip',title,description,url:mediaUrl(s.videoUrl),poster,state:stateOf(s.videoStatus,mediaUrl(s.videoUrl)),label:s.videoSource==='image-motion'?'图片运镜镜头':'AI 视频镜头',sceneId:s.id,seconds:s.videoSeconds||p.fixedShotSec});
    if(poster)add({id:`frame:${s.id}`,kind:'image',origin:'keyframe',title,description,url:poster,poster,state:stateOf(s.imageStatus,poster),label:'分镜关键帧',sceneId:s.id});
    [...new Set(Array.isArray(s.altImages)?s.altImages:[])].forEach((value,i)=>{
      const url=imageUrl(value);if(!url||url===poster)return;
      add({id:`candidate:${s.id}:${i}`,kind:'image',origin:'keyframe',title:`${title} · 候选 ${i+1}`,description:'补图与替换前的旧主图；进入分镜的「补图 / 换图」可设为主图。',url,poster:url,state:'ready',label:'候选关键帧',sceneId:s.id});
    });
    if(mediaUrl(s.speechUrl)||s.speechStatus==='running'||s.speechStatus==='error')add({id:`speech:${s.id}`,kind:'audio',origin:'speech',title,description:s.dialogue||'镜头配音',url:mediaUrl(s.speechUrl),state:stateOf(s.speechStatus,mediaUrl(s.speechUrl)),label:'台词配音',sceneId:s.id});
  }));
  const labels:Record<string,string>={character:'角色',scene:'场景',prop:'道具',special:'特效'};
  for(const a of Array.isArray(p.assets)?p.assets:[])add({id:`asset:${a.id}`,kind:'image',origin:'asset',assetId:a.id,title:a.name||'未命名资产',description:a.description||'',url:imageUrl(a.imageUrl),poster:imageUrl(a.imageUrl),state:stateOf(a.status,imageUrl(a.imageUrl)),label:labels[a.kind]||'图片资产'});
  return out;
}
export function filterProjectMedia(items:ProjectMedia[],kind:LibraryKind|'all',state:'all'|'ready'|'pending'|'review',query:string){
  const kw=query.trim().toLocaleLowerCase();
  return items.filter(m=>{
    const matchesState=state==='all'||(state==='pending'?(m.state==='pending'||m.state==='running'):m.state===state);
    return (kind==='all'||m.kind===kind)&&matchesState&&(!kw||[m.title,m.description,m.label].some(s=>s.toLocaleLowerCase().includes(kw)));
  });
}
