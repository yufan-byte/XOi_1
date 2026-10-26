import {requireDb} from "@/lib/agent/db";
import {TeamManagement,type TeamOperation} from "./management";
let instance:TeamManagement|undefined;
export const teamManagement=()=>instance??=new TeamManagement(requireDb());
/** A durable intent exists before a gateway action. Ambiguous outcomes remain visible, never guessed successful. */
export async function trackedTeamOperation<T>(ownerId:number,action:TeamOperation,target:number|undefined,details:Record<string,unknown>,run:()=>Promise<T>){
  return teamManagement().track(ownerId,action,target,details,run);
}
