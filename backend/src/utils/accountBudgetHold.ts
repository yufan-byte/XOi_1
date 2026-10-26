import type {Knex} from "knex";
/** With asynchronous gateway wallet writes, never release reservations just because a log appeared. */
export function budgetHold(row:{state:string;expires_at:string|Date;limit_quota:number|string;reserved_quota:number|string;calls?:number;recorded_calls?:number;pending_tasks?:number},settled:number,synchronousWallet:boolean,now=Date.now()){
  if(row.state==="active"&&new Date(row.expires_at).getTime()>now)return Number(row.limit_quota);
  if(synchronousWallet&&Number(row.calls)>0&&Number(row.recorded_calls)>=Number(row.calls)&&Number(row.pending_tasks)===0)return 0;
  return Math.max(0,Number(row.reserved_quota)-(synchronousWallet?Math.max(0,settled):0));
}
export async function accountBudgetHold(db:Knex|Knex.Transaction,userId:number,synchronousWallet:boolean){
  const result=await db.raw(`SELECT b.state,b.expires_at,b.limit_quota,b.reserved_quota,
    b.calls,COALESCE((SELECT SUM(l.quota) FROM logs l JOIN xoi_billing_links x ON x.request_id=l.request_id AND x.user_id=l.user_id
      WHERE x.user_id=b.user_id AND x.billing_id=b.billing_id AND l.type=2),0) AS settled,
    (SELECT count(DISTINCT l.request_id) FROM logs l JOIN xoi_billing_links x ON x.request_id=l.request_id AND x.user_id=l.user_id
      WHERE x.user_id=b.user_id AND x.billing_id=b.billing_id AND l.type=2) AS recorded_calls,
    (SELECT count(*) FROM xoi_generation_tasks t WHERE t.user_id=b.user_id AND t.status IN ('queued','running','unknown') AND t.payload::jsonb->>'billingId'=b.billing_id::text) AS pending_tasks
    FROM xoi_model_budgets b WHERE b.user_id=? AND b.automatic=false AND (b.reserved_quota>0 OR (b.state='active' AND b.expires_at>now() AND b.free_only=false))`,[userId]);
  return result.rows.reduce((sum:number,row:any)=>sum+budgetHold(row,Number(row.settled),synchronousWallet),0);
}
