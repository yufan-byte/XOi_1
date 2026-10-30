import type {Work} from "./history-types";
export function mergeHistory(local:Work[],incoming:Work[],hidden=new Set<string>()) {
  const result=[...local];
  for(const cloud of incoming){
    if(cloud.taskId&&hidden.has(`${cloud.kind}:${cloud.taskId}`))continue;
    const index=result.findIndex(w=>w.kind===cloud.kind&&((w.taskId&&w.taskId===cloud.taskId)||w.id===cloud.id||(!w.taskId&&cloud.meta?.source!=="canvas"&&w.id===cloud.meta?.clientWorkId)));
    if(index<0)result.push(cloud);
    else {const old=result[index];result[index]={...old,...cloud,id:old.id,error:cloud.status==="done"?undefined:cloud.error,prompt:cloud.meta?.promptMissing&&old.prompt?old.prompt:cloud.prompt,meta:{...old.meta,...cloud.meta,params:{...(old.meta?.params as object||{}),...(cloud.meta?.params as object||{})}}};}
  }
  return result.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
}
export function historyCache(works:Work[]) {
  const confirmed=works.filter(w=>w.taskId).slice(-200),pending=works.filter(w=>!w.taskId);
  return [...confirmed,...pending].map(w=>{
    const meta={...w.meta};
    for(const name of ["refs","videoRefs","audioRefs"]){
      const refs=meta[name];if(!Array.isArray(refs))continue;
      const safe=refs.filter(r=>typeof r==="string"&&!/^(data:|blob:)/i.test(r)&&r.length<4096);
      if(safe.length!==refs.length)meta.refsOmitted=true;meta[name]=safe;
    }
    return {...w,meta};
  });
}
