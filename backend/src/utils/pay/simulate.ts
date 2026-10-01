import type {
  AckKind,
  ChannelId,
  CreateOrderContext,
  CreateOrderResult,
  NotifyVerifyResult,
  PayChannel,
} from "./types";

/**
 * 模拟渠道：Phase A MVP 主力，零外部资质即可演示完整付费闭环。
 * - createOrder 返回一段可直接被前端 qrcode 编码的伪链接（扫码无效，但流程可视）；
 * - parseAndVerify 不做任何验签，无条件信任请求体里的商户单号——
 *   仅服务于 dev-trigger 与本地联调；生产环境应在网关层屏蔽该子路径。
 */
export class SimulateChannel implements PayChannel {
  readonly name: ChannelId = "simulate";
  readonly ack: AckKind = "text-success";

  async createOrder(ctx: CreateOrderContext): Promise<CreateOrderResult> {
    const content =
      `https://xoi.local/pay-sim/${ctx.outTradeNo}` +
      `?amount=${ctx.amount}&subject=${encodeURIComponent(ctx.subject.slice(0, 40))}&t=${Date.now()}`;
    console.log(`[pay/sim] 下单 ${ctx.outTradeNo} amount=${ctx.amount}`);
    return { qrContent: content };
  }

  async parseAndVerify(req: any): Promise<NotifyVerifyResult> {
    const raw: Record<string, unknown> = { ...(req.query || {}), ...(req.body || {}) };
    delete (raw as any).sign;
    const ot = (raw.out_trade_no || raw.orderId || raw.id) as string | undefined;
    if (!ot) return { ok: false, paid: false, reason: "missing out_trade_no" };
    console.log(`[pay/sim] 收到模拟回调 ${ot}`);
    return { ok: true, paid: true, outTradeNo: String(ot), payload: raw };
  }
}
