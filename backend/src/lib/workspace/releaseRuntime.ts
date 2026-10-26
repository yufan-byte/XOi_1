import crypto from "node:crypto";
import {db} from "@/utils/db";
import {releaseLifecycle} from "@/utils/releaseLifecycle";
import {serviceIdentity} from "@/utils/serviceConfig";
import {ReleaseControl,ensureReleaseControl} from "./releaseControl";
import {mediaQueueActivity,pauseMediaQueue,resumeMediaQueue} from "./mediaQueueRuntime";
import {taskWorkerId} from "./tasks";

export const releaseInstanceId=crypto.randomUUID();
export const releaseControl=new ReleaseControl(db,process.env.XOI_RELEASE_ROLLOUT_ENABLED==="1",Date.now,process.env.XOI_RELEASE_CLUSTER||"local");
let timer:ReturnType<typeof setInterval>|undefined,busy=false,forced=false,ended=false,current:Promise<void>|undefined;
let lastHealthy=0;
export function releaseControlHealthy(){return !ended&&Date.now()-lastHealthy<15000;}
export function forceReleaseDrain(){forced=true;releaseLifecycle.setDraining(true);pauseMediaQueue();}
export async function startReleaseRuntime(ready:()=>Promise<boolean>){
  await ensureReleaseControl(db);
  const label=process.env.XOI_INSTANCE_LABEL||releaseInstanceId.slice(0,8);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(label))throw Error("XOI_INSTANCE_LABEL 只能使用60位以内的字母、数字、点、下划线或短横线");
  await releaseControl.register(releaseInstanceId,serviceIdentity().release,label,process.env.XOI_RELEASE_START_MODE==="standby");
  const tick=async()=>{
    if(busy||ended)return;busy=true;
    try{
      const desired=await releaseControl.desired(releaseInstanceId);
      const draining=forced||desired;
      releaseLifecycle.setDraining(draining);
      if(draining)pauseMediaQueue();else resumeMediaQueue();
      const [pending,legacy]=await Promise.all([
        db("xoi_generation_tasks").where({worker_id:taskWorkerId}).whereIn("status",["running","unknown"]).count("id as count").first(),
        // Legacy tasks have no instance ownership: block rather than guess which node owns them.
        db("o_tasks").whereIn("state",["running","processing","进行中","生成中"]).count("id as count").first(),
      ]);
      const readyValue=await ready();
      if(!ended){await releaseControl.heartbeat(releaseInstanceId,{...releaseLifecycle.snapshot(),...mediaQueueActivity(),ready:!forced&&readyValue,postgres:process.env.XOI_CANVAS_STORAGE==="postgres",pending:Number(pending?.count||0),legacyPending:Number(legacy?.count||0)},forced||draining);lastHealthy=Date.now();}
    }catch{console.error("[release-control] 节点状态暂未同步，不报告可安全退出");}
    finally{busy=false;}
  };
  await tick();timer=setInterval(()=>{if(!busy&&!ended)current=tick();},2000);timer.unref();
}
export async function stopReleaseRuntime(){
  if(timer)clearInterval(timer);timer=undefined;
  ended=true;
  forceReleaseDrain();
  await current;
  await db("xoi_release_instances").where({instance_id:releaseInstanceId}).update({heartbeat_at:0,observed_draining:true});
}
