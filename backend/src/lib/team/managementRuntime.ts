import {requireDb} from "@/lib/agent/db";
import {TeamManagement,type TeamOperation} from "./management";
let instance:TeamManagement|undefined;
export const teamManagement=()=>instance??=new TeamManagement(requireDb());
/** A durable intent exists before a gateway action. Ambiguous outcomes remain visible, never guessed successful. */
export async function trackedTeamOperation<T>(ownerId:number,action:TeamOperation,target:number|undefined,details:Record<string,unknown>,run:()=>Promise<T>,teamId?:number){
  return teamManagement().track(ownerId,action,target,details,run,teamId);
}
/** 只写一条已完成的审计记录（导出/下载这类无需回滚的动作）。 */
export async function recordTeamAudit(ownerId:number,action:TeamOperation,target:number|undefined,details:Record<string,unknown>,teamId?:number){
  return teamManagement().record(ownerId,action,target,details,teamId);
}
