import {allScenes,patchScene,type ComicProject} from './types';

/** A frame change preserves every prior frame and flags derived video for review. */
export function selectKeyframe(p:ComicProject,id:string,url:string):ComicProject{
  const s=allScenes(p).find(s=>s.id===id);
  if(!s||!url||s.imageUrl===url)return p;
  return patchScene(p,id,{
    imageUrl:url,imageStatus:'done',imageError:undefined,
    altImages:[...new Set([...(s.altImages??[]),...(s.imageUrl?[s.imageUrl]:[])])].filter(u=>u!==url),
    videoStatus:s.videoUrl||s.videoTaskId?'stale':s.videoStatus,
  });
}
export function updateShotPrompt(p:ComicProject,id:string,prompt:string):ComicProject{
  const s=allScenes(p).find(s=>s.id===id);
  if(!s||s.shotPrompt===prompt)return p;
  // Do not discard media; retain it and require review before a new video is made.
  return patchScene(p,id,{shotPrompt:prompt,videoStatus:s.videoUrl||s.videoTaskId?'stale':s.videoStatus});
}
