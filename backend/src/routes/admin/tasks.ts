import express from "express";
import { boundedInteger, queryText } from "@/utils/adminQuery";
import { requireAdmin } from "@/middleware/requireAdmin";
import { success, error } from "@/lib/responseFormat";
import { db } from "@/utils/db";
const router = express.Router();
router.use(requireAdmin);
const source = `SELECT 'legacy:'||t.id::text AS id,t."projectId",t."taskClass",t.model,
 CASE WHEN t.state IN ('success','succeeded','已完成','生成成功') THEN 'success'
 WHEN t.state IN ('failed','error','生成失败') THEN 'failed'
 WHEN t.state IN ('running','processing','进行中','生成中') THEN 'running'
 WHEN t.state IN ('pending','等待中') THEN 'pending' ELSE t.state END AS state,
 t.describe,t."startTime",p.name AS project_name,u.name AS user_name
 FROM o_tasks t LEFT JOIN o_project p ON t."projectId"=p.id LEFT JOIN o_user u ON p."userId"=u.id
 UNION ALL
 SELECT 'media:'||g.kind||':'||g.task_id AS id,NULL::bigint AS "projectId",'画布 '||g.kind AS "taskClass",
 g.payload::jsonb->>'modelKey' AS model,
 CASE WHEN g.status='succeeded' THEN 'success' WHEN g.status='unknown' THEN 'unknown' WHEN g.status='queued' THEN 'pending' ELSE g.status END AS state,
 COALESCE(g.payload::jsonb->>'error','') AS describe,g.updated_at AS "startTime",
 NULL::text AS project_name,u.name AS user_name
 FROM xoi_generation_tasks g LEFT JOIN o_user u ON g.user_id=u.id`;
router.get("/", async (req, res) => {
  try {
    const page = boundedInteger(req.query.page, 1, 10000),
      limit = boundedInteger(req.query.limit, 20, 100),
      state = queryText(req.query.state),
      search = queryText(req.query.search);
    const conditions: string[] = [],
      values: any[] = [];
    if (state) {
      conditions.push("state=?");
      values.push(state);
    }
    if (search) {
      conditions.push(
        "(COALESCE(\"taskClass\",'') ILIKE ? OR COALESCE(model,'') ILIKE ? OR COALESCE(describe,'') ILIKE ? OR COALESCE(user_name,'') ILIKE ?)",
      );
      for (let i = 0; i < 4; i++) values.push("%" + search + "%");
    }
    const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
    const [tasks, total, stats] = await Promise.all([
      db.raw(
        "SELECT * FROM (" +
          source +
          ") unified" +
          where +
          ' ORDER BY "startTime" DESC NULLS LAST LIMIT ? OFFSET ?',
        [...values, limit, (page - 1) * limit],
      ),
      db.raw(
        "SELECT count(*) AS count FROM (" + source + ") unified" + where,
        values,
      ),
      db.raw(
        "SELECT state,count(*) AS count FROM (" +
          source +
          ") unified GROUP BY state",
      ),
    ]);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(
      success({
        tasks: tasks.rows,
        pagination: { page, limit, total: Number(total.rows[0].count) },
        stateStats: stats.rows.map((r: any) => ({
          state: r.state,
          count: Number(r.count),
        })),
      }),
    );
  } catch (e) {
    console.error("[admin/tasks]", e);
    res.status(503).send(error("任务监控暂不可用，请稍后重试"));
  }
});
export default router;
