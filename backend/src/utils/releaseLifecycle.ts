import type {Request,Response,NextFunction} from "express";

/** Process-local activity, not an authorization cache. Accepted work must finish before retirement. */
export class ReleaseLifecycle {
  private draining=false;
  private http=0;
  private socket=0;
  setDraining(value:boolean){this.draining=value;}
  isDraining(){return this.draining;}
  snapshot(){return {http:this.http,socket:this.socket};}
  /** Work can outlive its HTTP response. Count it until settlement, not just until res.send(). */
  beginBackground(){
    this.http++;
    let done=false;return ()=>{if(!done){done=true;this.http--;}};
  }
  beginSocket(){
    if(this.draining)throw Object.assign(new Error("服务正在更新，本条消息尚未调用模型，请稍后重试"),{code:"RELEASE_DRAINING"});
    this.socket++;
    let done=false;return ()=>{if(!done){done=true;this.socket--;}};
  }
  socketHandler<T extends unknown[]>(handler:(...args:T)=>Promise<void>,reject:(message:string)=>void){
    return async(...args:T)=>{
      let finish:()=>void;
      try{finish=this.beginSocket();}catch{reject("服务正在更新，本条消息尚未调用模型，请稍后重试");return;}
      try{await handler(...args);}catch{reject("实时任务结果待核对，请检查任务与积分明细，避免重复生成");}finally{finish();}
    };
  }
  admission=(req:Request,res:Response,next:NextFunction)=>{
    const pathname=req.originalUrl.split("?")[0];
    // Payment callbacks must still settle; count them, do not reject or replay them.
    const callback=/^\/api\/pay\/callback\//i.test(pathname);
    const identityRead=["GET","HEAD"].includes(req.method)&&/^\/api\/(?:reseller\/me|login\/(?:self|media-session)|auth\/me)$/i.test(pathname);
    if(identityRead||/^\/api\/(?:admin\/releases(?:\/|$)|healthz$|readyz$|version$)/i.test(pathname))return next();
    if(this.draining&&!callback)return res.set("Retry-After","3").status(503).json({code:"RELEASE_DRAINING",message:"服务正在更新，请稍后重试；本次尚未开始新的模型调用"});
    this.http++;
    let done=false;const finish=()=>{if(!done){done=true;this.http--;}};
    res.once("finish",finish);res.once("close",finish);next();
  };
  async waitForIdle(extraIdle:()=>boolean,timeoutMs:number){
    const end=Date.now()+timeoutMs;
    do {
      if(!this.http&&!this.socket&&extraIdle())return true;
      await new Promise(resolve=>setTimeout(resolve,100));
    }while(Date.now()<end);
    return false;
  }
}
export const releaseLifecycle=new ReleaseLifecycle();
