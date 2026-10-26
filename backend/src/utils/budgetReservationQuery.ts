/** Defense-in-depth atomic quota admission; values are all server-derived, never a debit. */
export const BUDGET_RESERVATION_QUERY = `UPDATE xoi_model_budgets
 SET reserved_quota=reserved_quota+$1,calls=calls+1,pricing_hash=$2,token_id=$3
 WHERE user_id=$4 AND billing_id=$5 AND claimed_at IS NOT NULL
   AND state='active' AND expires_at>now() AND calls<max_calls
   AND $1>=0 AND reserved_quota+$1<=limit_quota
 RETURNING billing_id`;
