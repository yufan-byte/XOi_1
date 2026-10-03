import express from "express";
import { membershipOf, records, teamOfOwner, TeamError } from "@/lib/team/store";

const router = express.Router();

router.get("/", async (req, res) => {
  const userId = Number((req as any).user?.id || 0);
  if (!userId) return res.status(401).json({ success: false, message: "请先登录" });
  try {
    const own = await teamOfOwner(userId);
    const membership = own ? null : await membershipOf(userId);
    const team = own ?? membership?.team;
    if (!team) return res.json({ success: true, data: { items: [], total: 0 } });
    const onlyUserId = own || membership?.member.can_view_all ? undefined : userId;
    const data = await records(
      team,
      String(req.query.month ?? ""),
      String(req.query.category ?? "all"),
      Number(req.query.page) || 1,
      onlyUserId,
    );
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof TeamError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("[team/records]", error);
    return res.status(500).json({ success: false, message: "团队消费记录加载失败" });
  }
});

export default router;
