/** Keep user isolation in SQL, not in a frontend filter. No balance-difference inference. */
export const BILLING_RECEIPT_QUERY = `SELECT l.id,l.quota,l.model_name,l.created_at,l.request_id FROM logs l
  JOIN xoi_billing_links b ON b.request_id=l.request_id AND b.user_id=l.user_id
  WHERE b.user_id=? AND b.billing_id=? AND l.type=2 ORDER BY l.id`;
