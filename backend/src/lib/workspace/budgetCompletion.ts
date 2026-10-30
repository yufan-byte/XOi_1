import type { Knex } from "knex";
/** Close unused authorization, NOT a refund: never change reserved quota or wallet. */
export const COMPLETE_MEDIA_BUDGETS_SQL = `UPDATE xoi_model_budgets AS b
 SET state='stopped',stop_reason='本次媒体任务已结束，后续调用已停止；实际费用以积分明细为准'
 WHERE b.state='active' AND b.operation_path IN ('/canvas-image-tasks','/canvas-video','/v1/canvas/image-tasks','/v1/canvas/audio-tasks','/v1/videos','/workflow/one-stop','/aiassistant/director/scene-tasks')
 AND EXISTS(SELECT 1 FROM xoi_media_queue q WHERE q.user_id=b.user_id AND q.billing_id=b.billing_id::text AND q.state IN ('succeeded','failed','cancelled','unknown'))
 AND NOT EXISTS(SELECT 1 FROM xoi_media_queue q WHERE q.user_id=b.user_id AND q.billing_id=b.billing_id::text AND q.state IN ('queued','running'))`;
export async function completeMediaBudgets(
  db: Knex,
  userId?: number,
  billingId?: string,
) {
  return db.raw(
    COMPLETE_MEDIA_BUDGETS_SQL +
      (userId !== undefined && billingId
        ? " AND b.user_id=? AND b.billing_id=?"
        : ""),
    userId !== undefined && billingId ? [userId, billingId] : [],
  );
}
