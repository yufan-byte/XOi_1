/**
 * GET  /api/user/topup/info —— 充值通道开关（是否开启在线充值 / 各渠道 / 是否可用卡密）
 * POST /api/user/topup      —— 卡密兑换（网关侧受「兑换码合规确认」闸门控制）
 *
 * 与 pay.ts 同样的取舍：**原样代理网关**，形状不变（控制台 api() 会自行解包 data）。
 * 卡密兑换走网关意味着：站长得先在网关后台确认合规条款
 * （option `payment_setting.compliance_confirmed`）才放行 —— 这不是 XOi 该代劳的事，
 * 网关返回的提示文案原样带给用户即可。
 */
import express from "express";
import { backendRaw, currentUser } from "@/lib/reseller/auth";

const router = express.Router();

router.get("/info", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });
  try {
    const { status, body } = await backendRaw(req, "/api/user/topup/info");
    res.status(status).json(body);
  } catch (e) {
    res.status(502).json({ success: false, message: `读取充值配置失败：${(e as Error).message}` });
  }
});

router.post("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });

  const key = String((req.body ?? {}).key ?? "").trim();
  if (!key) return res.status(400).json({ success: false, message: "请填写兑换码" });

  try {
    const { status, body } = await backendRaw(req, "/api/user/topup", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
    res.status(status).json(body);
  } catch (e) {
    res.status(502).json({ success: false, message: `兑换失败：${(e as Error).message}` });
  }
});

export default router;
