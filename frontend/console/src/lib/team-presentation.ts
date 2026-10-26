import {POINTS_PER_YUAN,QUOTA_PER_YUAN,formatAccountPointsFromYuan} from "../../../src/utils/points";
export {CREDIT_RULE_LABEL,POINTS_PER_YUAN} from "../../../src/utils/points";
export const TEAM_WORKSPACE_PATH="/reseller/team-space";
export function teamQuotaPoints(quota:number){return quota/QUOTA_PER_YUAN*POINTS_PER_YUAN;}
export function formatTeamQuota(quota:number){return formatAccountPointsFromYuan(quota/QUOTA_PER_YUAN);}
/** UI uses points; the existing API still expects yuan. Never relabel points as yuan. */
export function teamPointsToYuan(input:string):number|null{
  const s=input.trim();if(!/^\d+(?:\.\d{1,6})?$/.test(s))return null;
  const points=Number(s),yuan=points/POINTS_PER_YUAN;
  const quota=Math.round(yuan*QUOTA_PER_YUAN);
  if(!Number.isFinite(points)||!Number.isSafeInteger(quota)||(points>0&&quota===0))return null;
  return yuan;
}
export function teamMemberRole(canViewAll:boolean){return canViewAll?"消费查看者":"团队成员";}
export function teamMonths(now=Date.now()){
  const date=new Date(now+8*3600_000);
  return Array.from({length:12},(_,i)=>new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-i,1)).toISOString().slice(0,7));
}
export function teamResetText(period:"day"|"month"|"total",now=Date.now()){
  if(period==="total")return "不自动重置";
  if(period==="day")return "次日 00:00（北京时间）";
  const date=new Date(now+8*3600_000),next=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));
  return `${next.getUTCFullYear()}年${next.getUTCMonth()+1}月1日（北京时间）`;
}
export function csvTeamCell(value:string|number){
  const s=String(value);
  // Spreadsheet exports must not execute a member-controlled name as a formula.
  return typeof value==="string"&&/^[\s\u0000-\u001f]*[=+@-]/.test(s)?"'"+s:s;
}
