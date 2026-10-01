import express from "express";
import { db } from "@/utils/db";
import { requireAdmin } from "@/middleware/requireAdmin";
import { getPlatformPolicy, invalidatePolicy, policySchema } from "@/utils/platformPolicy";
import { success } from "@/lib/responseFormat";

const router = express.Router();
router.use(requireAdmin);
router.get("/", async (_req, res) => res.send(success(await getPlatformPolicy())));
router.put("/", async (req, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "配置不合法：赠送积分须为 0–100000 的整数" });
  await db("o_setting").insert({ key: "platformPolicy", value: JSON.stringify(parsed.data) })
    .onConflict("key").merge();
  invalidatePolicy();
  res.send(success(parsed.data));
});
export default router;
