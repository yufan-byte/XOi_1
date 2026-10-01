import express from "express";
import crypto from "node:crypto";
import { success, error } from "@/lib/responseFormat";
import database from "@/utils";
import { getChannel, listChannels } from "@/utils/pay";
import { fulfillPaidOrder } from "@/utils/pay/delivery";
import type { NotifyVerifyResult, PayChannel } from "@/utils/pay/types";
import { isOrderExpired, isPaymentAmountMatch } from "@/utils/pay/guards";

const u = database;
const router = express.Router();

/** 商户单号生成:XOI+北京时间戳14位+随机8位hex */
function genOutTradeNo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `XOI${stamp}${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * 枚举当前可选用的扫码方式(含启用状态)，供前端选择面板呈现真实渠道而非写死列表
 * GET /api/pay/channels
 */
router.get("/channels", async (_req, res) => {
  try {
    res.send(success(await listChannels()));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

/**
 * 创建待支付订单
 * POST /api/pay/create-order  {packageId, channel='simulate'}
 *
 * 全程以「商户单号 out_trade_no」作为对外订单标识贯穿下单/状态/结果页，
 * 不依赖数据库自增 id，规避 better-sqlite3 回填 lastInsertRowid 的繁琐与跨进程竞态。
 */
router.post("/create-order", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).send(error("未登录"));

  const { packageId, channel } = req.body || {};
  const pkgIdNum = Number(packageId);
  const channelIdStr = String(channel || "simulate");

  if (!pkgIdNum || isNaN(pkgIdNum) || pkgIdNum <= 0) {
    return res.status(400).send(error("请选择有效的套餐"));
  }
  if (process.env.NODE_ENV === "prod" && channelIdStr === "simulate") {
    return res.status(400).send(error("生产环境不允许使用模拟支付，请选择已配置的真实支付渠道"));
  }
  if (!["simulate", "alipay", "wechat", "aggr"].includes(channelIdStr)) {
    return res.status(400).send(error("无效的支付渠道"));
  }

  try {
    const pkg = await u.db("o_points_package").where("id", pkgIdNum).first();
    if (!pkg) return res.status(404).send(error("套餐不存在"));
    const price = Number(pkg.price);
    if (!(price > 0)) return res.status(400).send(error("该套餐价格异常，请联系管理员"));

    const outTradeNo = genOutTradeNo();
    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(nowIso).getTime()
      ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
      : new Date(nowIso);

    // 快照落库:即便后续运营改了套餐也不影响已成交订单的应发权益
    await u.db("o_order").insert({
      out_trade_no: outTradeNo,
      user_id: Number(userId),
      package_id: Number(pkg.id),
      amount: price,
      points_snapshot: Number(pkg.points) || 0,
      bonus_snapshot: Number(pkg.bonus) || 0,
      grant_level_snapshot: (pkg.grant_level ?? null) as unknown as string | null,
      grant_vip_days_snapshot: Number(pkg.grant_vip_days) || 0,
      channel: channelIdStr,
      status: "pending",
      client_ip: String(
        ((req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim())
          ? ((req.headers["x-forwarded-for"] as string).split(",")[0].trim())
          : "",
      ),
      created_at: nowIso,
      expires_at: typeof expiresAtIso === "string" ? expiresAtIso : null,
    });

    const chan: PayChannel = await getChannel(channelIdStr);
    const subject = pkg.grant_level ? `${pkg.name} · 会员开通` : `${pkg.name} 积分充值`;
    const coResult = await chan.createOrder({ outTradeNo, amount: price, subject });

    console.log(`[pay] 用户 ${userId} 下单 ${outTradeNo} 套餐#${pkg.id} via ${channelIdStr}`);

    res.send(success({
      outTradeNo,
      qrContent: coResult.qrContent,
      channel: channelIdStr,
      expiresAt: typeof expiresAtIso === "string" ? expiresAtIso : null,
      amount: price,
      packageName: pkg.name,
      pointsTotal: (Number(pkg.points) || 0) + (Number(pkg.bonus) || 0),
      grantLevel: pkg.grant_level ?? null,
      grantVipDays: Number(pkg.grant_vip_days) || 0,
    }));
  } catch (e: any) {
    console.error("[pay/create-order]", e.message);
    res.status(500).send(error(e.message));
  }
});

/**
 * 订单状态查询 — 前端二维码弹窗的轮询兜底(socket 断线也能拿到最终态)
 * GET /api/pay/status/:trade
 */
router.get("/status/:trade", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).send(error("未登录"));

  try {
    const order = await u.db("o_order")
      .where("out_trade_no", String(req.params.trade))
      .first();
    if (!order) return res.status(404).send(error("订单不存在"));

    // 仅本人或管理员可见，防跨用户窥探他人订单
    if (
      Number(order.user_id) !== Number(userId) &&
      (req as any).user?.role !== "admin"
    ) {
      return res.status(403).send(error("无权查看此订单"));
    }

    // 轮询时顺便收敛超时订单状态，避免 pending 长期堆积并干扰运营统计。
    if (
      isOrderExpired(order.status, order.expires_at)
    ) {
      await u.db("o_order")
        .where("out_trade_no", order.out_trade_no)
        .where("status", "pending")
        .update({ status: "expired" });
      order.status = "expired";
    }

    res.send(success({
      outTradeNo: order.out_trade_no,
      status: order.status,
      paidAt: order.paid_at,
      expiresAt: order.expires_at,
      amount: Number(order.amount),
      channel: order.channel,
    }));
  } catch (e: any) {
    res.status(500).send(error(e.message));
  }
});

/**
 * 第三方异步回调入口(JWT 已由 app.ts 在白名单放行，此处匿名访问；
 * 来源合法性完全交由各渠道自身的 parseAndVerify 验签把关)
 * 支持 POST 与 GET(PayJS 类常以 GET 推送)
 */
async function handleCallback(req: express.Request, res: express.Response): Promise<void> {
  const channelName = req.params.channel as string;
  if (!["alipay", "wechat", "aggr"].includes(channelName)) {
    res.status(404).send("unknown channel");
    return;
  }

  let chan: PayChannel | null = null;
  try {
    chan = await getChannel(channelName);
    const vr: NotifyVerifyResult = await chan.parseAndVerify(req);
    if (!vr.ok || !vr.outTradeNo || (typeof vr.paid === "boolean" && !vr.paid)) {
      console.warn(`[pay/${channelName}] 回调拒收 reason=${vr.reason}`, vr.payload ?? "");
      // 中间态/非法请求一律 ACK 成功让三方停止重投(否则反复推送造成日志噪音),
      // 只有「合法但尚未到 SUCCESS」才需要重试——这类极少见,留作后续 phase D 细化
      sendAck(res, false, chan);
      return;
    }

    // 回调验签只证明通知来自渠道，金额校验才证明它对应本平台这笔订单。
    const order = await u.db("o_order").where("out_trade_no", String(vr.outTradeNo)).first();
    if (!order) {
      console.warn(`[pay/${channelName}] 回调订单不存在 trade=${vr.outTradeNo}`);
      sendAck(res, false, chan);
      return;
    }
    if (vr.paidAmount == null || !Number.isFinite(vr.paidAmount)) {
      console.warn(`[pay/${channelName}] 回调缺少有效支付金额 trade=${vr.outTradeNo}`);
      sendAck(res, false, chan);
      return;
    }
    if (!isPaymentAmountMatch(order.amount, vr.paidAmount)) {
      console.error(`[pay/${channelName}] 金额不匹配 trade=${vr.outTradeNo} expected=${order.amount} actual=${vr.paidAmount}`);
      sendAck(res, false, chan);
      return;
    }

    const granted = await fulfillPaidOrder(String(vr.outTradeNo), {
      channelTradeNo: vr.channelTradeNo,
      payload: vr.payload ?? null,
    });

    console.log(`[pay/${channelName}] done granted=${granted} trade=${vr.outTradeNo}`);
    // 无论本次首次发放还是重复命中(granted=false 表示此前已处理),都回复成功让三方停止重试
    sendAck(res, true, chan);
  } catch (err: any) {
    console.error(`[pay/${channelName}] callback exception`, err.message, err.stack);
    // 发放过程异常(如瞬时DB锁冲突)保持失败促使三方重投递补偿
    sendAck(res, false, chan);
  }
}

router.post("/callback/:channel", handleCallback);
router.get("/callback/:channel", handleCallback);

/**
 * 开发态手工标记付款(仅 NODE_ENV≠prod 启用)
 * GET /api/pay/_dev/trigger/:trade
 * 该路径不在 callback 白名单内,正常经过 JWT 校验注入 req.user,
 * 再额外校验管理员身份以防普通用户自助加钱。
 */
if (process.env.NODE_ENV !== "prod") {
  router.get("/_dev/trigger/:trade", async (req, res) => {
    const userId = (req as any).user?.id;
    const role = (req as any).user?.role;
    if (!userId) return res.status(401).send(error("请先登录"));
    if (role !== "admin") return res.status(403).send(error("仅管理员可在开发态触发付款"));

    const trade = String(req.params.trade);
    try {
      const order = await u.db("o_order").where("out_trade_no", trade).first();
      if (!order) return res.status(404).send(error("订单不存在"));
      if (order.channel !== "simulate") {
        return res.status(400).send(error("非模拟渠道不允许人工触发，请等待三方真实回调"));
      }
      const granted = await fulfillPaidOrder(trade, {
        channelTradeNo: `SIM-${Date.now()}`,
        payload: { source: "_dev/trigger", op: userId },
      });
      res.send(success({
        granted,
        statusAfterTrigger: granted ? "paid" : order.status,
        message: granted ? "已模拟付款成功并下发积分/会员权益" : "该订单已被处理过(幂等忽略)",
      }));
    } catch (e: any) {
      res.status(500).send(error(e.message));
    }
  });
}

export default router;

// ───────── 内部工具 ─────────

/** 根据各渠道约定的协议形态向第三方回执“收到”信号 */
function sendAck(res: express.Response, ok: boolean, chan: PayChannel | null): void {
  if (!ok) {
    res.status(200).type("text/plain").send("fail");
    return;
  }
  // 微信 v3 需要 JSON {"code":"SUCCESS"},支付宝当面付要纯文本 'success',聚合收款多为纯文本成功字串
  if (chan?.name === "wechat") {
    res.status(200).type("application/json").send(JSON.stringify({ code: "SUCCESS" }));
    return;
  }
  res.status(200).type("text/plain").send("success");
}

export {};
