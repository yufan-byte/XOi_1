/**
 * POST /api/user/pay —— 在线充值下单（**原样代理网关**）。
 *
 * 为什么是代理而不是接 XOi 自己的 routes/pay：
 *   XOi 的余额是 **new-api 的 quota**（旧积分/会员体系已按造物方案下线，见 WorkbenchLayout 注释），
 *   而控制台的充值弹窗（console/src/components/shell/dialogs/topup-dialog.tsx）本来就是按
 *   **网关语义**写的：`POST /api/user/pay {amount, payment_method, top_up_code}` →
 *   `{ message, data: 表单参数, url: 收银台 }`。routes/pay/index.ts 属于旧积分体系
 *   （o_points_package / o_order / 积分与会员权益），把它挂上来只会让废弃链路复活。
 *   所以这里只做「登录校验 + 原样透传」，不翻译、不改形状 —— 与造物直连网关时行为一致。
 *
 * 鉴权：全局 XOi JWT 中间件（core.ts 自动挂载链）已写 req.user；本路由再用
 *      currentUser 确认真实登录态（含 session_version 踢下线），未登录 401。
 * 服务端 → 网关：管理员令牌 + `New-Api-User: <uid>`（站点级单一令牌铁律，绝不下发子令牌）。
 */
import express from "express";
import { backendRaw, currentUser } from "@/lib/reseller/auth";

const router = express.Router();

router.post("/", async (req, res) => {
  const me = await currentUser(req);
  if (!me) return res.status(401).json({ success: false, message: "请先登录" });

  const b = (req.body ?? {}) as { amount?: unknown; payment_method?: unknown; top_up_code?: unknown };
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: "请填写正确的充值金额" });
  }
  const payment_method = String(b.payment_method || "").trim();
  if (!payment_method) {
    return res.status(400).json({ success: false, message: "请选择支付方式" });
  }

  try {
    const { status, body } = await backendRaw(req, "/api/user/pay", {
      method: "POST",
      body: JSON.stringify({
        amount,
        payment_method,
        top_up_code: String(b.top_up_code ?? ""),
      }),
    });

    /**
     * 形状规整（只动失败分支）：
     * new-api 未配置支付渠道时返回 `{"data":"当前管理员未配置支付信息","message":"error"}` ——
     * 原因在 data、message 是无意义字面量 "error"，而控制台的 requestPay 会把 message 当成
     * 报错文案抛给用户，于是弹窗上只显示一个 "error"。
     * 这里把失败分支改写成控制台期待的形状 `{success:false, message: 真实原因}`；
     * 成功分支保持原样（收银台地址 url 在顶层，任何改动都会让前端拿不到）。
     */
    const b2 = body as { message?: unknown; data?: unknown; url?: unknown } | null;
    const failed = !b2 || b2.message === "error";
    if (failed) {
      const reason = typeof b2?.data === "string" && b2.data ? b2.data : "当前环境暂未开启在线支付，请联系客服";
      return res.status(status === 200 ? 200 : status).json({ success: false, message: reason });
    }
    res.status(status).json(body);
  } catch (e) {
    res.status(502).json({ success: false, message: `支付服务不可用：${(e as Error).message}` });
  }
});

export default router;
