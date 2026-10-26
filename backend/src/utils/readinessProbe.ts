/** Probe-only cache. Never use this result as a billing/authentication decision. */
export function readinessProbe(check:()=>Promise<void>, options:{ttl?:number;now?:()=>number;warn?:(error:unknown)=>void}={}) {
  const now=options.now||Date.now,ttl=options.ttl??1500;
  let cached:{at:number;ok:boolean}|undefined,inflight:Promise<boolean>|undefined;
  return async()=>{
    if(cached&&now()-cached.at<ttl)return cached.ok;
    if(inflight)return inflight;
    inflight=(async()=>{
      let ok=true;
      try{await check();}catch(error){ok=false;options.warn?.(error);}
      cached={at:now(),ok};return ok;
    })();
    try{return await inflight;}finally{inflight=undefined;}
  };
}
