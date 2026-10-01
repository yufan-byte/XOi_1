import express from "express";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";

const u = database;
const router = express.Router();

// 获取当前用户会员等级（普通用户可用）
router.get("/level", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).send(error("未登录"));

  try {
    const user = await u.db("o_user").where("id", userId).select("member_level").first();
    res.send(success({ level: user?.member_level || "free" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

// 管理员更新用户会员等级（仅管理员）
router.post("/adminUpdateMember", async (req, res) => {
  const userId = (req as any).user?.id;
  const role = (req as any).user?.role;
  if (!userId) return res.status(401).send(error("未登录"));
  if (role !== "admin") return res.status(403).send(error("无权限"));
  if (process.env.NODE_ENV === "prod" && process.env.XOI_ALLOW_MEMBER_OVERRIDE !== "true") {
    return res.status(403).send(error("生产环境禁止直接修改会员权益，请通过订单或客服补单流程处理"));
  }

  const { user_id, level } = req.body;
  if (!user_id || !["free", "standard", "premium"].includes(level)) {
    return res.status(400).send(error("参数错误"));
  }

  try {
    const targetUser = await u.db("o_user").where("id", user_id).first();
    if (!targetUser) return res.status(404).send(error("用户不存在"));

    await u.db("o_user").where("id", user_id).update({ member_level: level });
    res.send(success({ message: "更新成功" }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

export default router;
