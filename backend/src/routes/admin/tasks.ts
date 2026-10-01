import express from "express";
import { boundedInteger, queryText } from "@/utils/adminQuery";
import { requireAdmin } from "@/middleware/requireAdmin";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";

const router = express.Router();
router.use(requireAdmin);
const stateAliases: Record<string, string[]> = {
  pending: ["pending", "等待中"],
  running: ["running", "processing", "进行中", "生成中"],
  success: ["success", "succeeded", "已完成", "生成成功"],
  failed: ["failed", "error", "生成失败"],
};
const normalizeState = (value: string) => Object.keys(stateAliases).find((key) => stateAliases[key].includes(value)) || value;

function adminOnly(req: express.Request, res: express.Response): boolean {
  const user = (req as any).user;
  if (!user?.id) {
    res.status(401).send(error("未登录"));
    return false;
  }
  if (user.role !== "admin") {
    res.status(403).send(error("无权限"));
    return false;
  }
  return true;
}

/** 管理员任务监控，读取统一任务中心的基础数据。 */
router.get("/", async (req, res) => {
  if (!adminOnly(req, res)) return;

  try {
    const page = boundedInteger(req.query.page, 1, 10000);
    const limit = boundedInteger(req.query.limit, 20, 100);
    const state = queryText(req.query.state);
    const search = queryText(req.query.search);

    const base = u.db("o_tasks")
      .leftJoin("o_project", "o_tasks.projectId", "o_project.id")
      .leftJoin("o_user", "o_project.userId", "o_user.id");

    const applyFilters = (query: any) => {
      if (state) query.whereIn("o_tasks.state", stateAliases[state] || [state]);
      if (search) {
        query.andWhere((builder: any) => {
          builder
            .where("o_tasks.taskClass", "like", `%${search}%`)
            .orWhere("o_tasks.model", "like", `%${search}%`)
            .orWhere("o_tasks.describe", "like", `%${search}%`)
            .orWhere("o_user.name", "like", `%${search}%`);
        });
      }
      return query;
    };

    const tasks = await applyFilters(base.clone())
      .select(
        "o_tasks.id", "o_tasks.projectId", "o_tasks.taskClass", "o_tasks.model", "o_tasks.state", "o_tasks.describe", "o_tasks.startTime",
        "o_project.name as project_name",
        "o_user.name as user_name",
      )
      .orderBy("o_tasks.startTime", "desc")
      .limit(limit)
      .offset((page - 1) * limit);

    const totalRow = await applyFilters(base.clone()).count("o_tasks.id as count").first();
    const stateRows = await u.db("o_tasks").select("state").count("id as count").groupBy("state");

    res.send(success({
      tasks: tasks.map((task: any) => ({ ...task, state: normalizeState(task.state) })),
      pagination: { page, limit, total: Number((totalRow as any)?.count || 0) },
      stateStats: Object.entries(stateRows.reduce((totals: Record<string, number>, row: any) => {
        const key = normalizeState(row.state);
        totals[key] = (totals[key] || 0) + Number(row.count || 0);
        return totals;
      }, {})).map(([state, count]) => ({ state, count })),
    }));
  } catch (e: any) {
    console.error("[admin/tasks]", e);
    res.status(500).send(error("任务列表加载失败"));
  }
});

export default router;
