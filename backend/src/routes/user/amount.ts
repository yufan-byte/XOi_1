/**
 * POST /api/user/amount —— 按充值档位算出「实付金额」（网关会叠加手续费/折扣）。
 * 控制台充值弹窗在展示支付方式前调它拿真实金额，拿不到就回落档位原价。
 * 同样原样代理网关（返回体 {success,message,data:number}）。
 */
import express from "express";
import { backendRaw, currentUser } from "@/lib/reseller/auth";

const router = express.Router();

router.post("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });

  const b = (req.body ?? {}) as { amount?: unknown; top_up_code?: unknown };
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: "请填写正确的充值金额" });
  }

  try {
    const { status, body } = await backendRaw(req, "/api/user/amount", {
      method: "POST",
      body: JSON.stringify({ amount, top_up_code: String(b.top_up_code ?? "") }),
    });
    res.status(status).json(body);
  } catch (e) {
    res.status(502).json({ success: false, message: `金额计算失败：${(e as Error).message}` });
  }
});

export default router;
