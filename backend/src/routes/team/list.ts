import express from "express";
import { listTeams, TeamError } from "@/lib/team/store";

const router = express.Router();

/** GET /api/team/list —— 管理员的团队列表（名称搜索 + 分页）。 */
router.get("/", async (req, res) => {
  const userId = Number((req as any).user?.id || 0);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  res.setHeader("Cache-Control", "no-store");
  try {
    const data = await listTeams(userId, String(req.query.q ?? ""), Number(req.query.page) || 1, Number(req.query.size) || 12);
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof TeamError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("[team/list]", error);
    return res.status(500).json({ success: false, message: "团队列表加载失败，请稍后重试" });
  }
});

export default router;
