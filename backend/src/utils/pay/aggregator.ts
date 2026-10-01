import crypto from "node:crypto";
import axios from "axios";
import type {
  AckKind,
  ChannelId,
  CreateOrderContext,
  CreateOrderResult,
  NotifyVerifyResult,
  PayChannel,
} from "./types";

/**
 * 第三方聚合收款渠道：以 **PayJS** 规范为参考(MD5 签名、免营业执照、即时可用)，
 * 兼容虎皮椒(xunhu)等同类服务时只需调整 baseUrl 与字段映射即可扩展。
 *
 * 凭据来自 o_vendorConfig.inputValues(JSON)，约定字段：
 *   mchid      商户号(PayJS 的 mchid)
 *   secret     商户通信密钥
 *   baseUrl    网关地址(默认 https://payjs.cn)
 */
export class AggrChannel implements PayChannel {
  readonly name: ChannelId = "aggr";
  readonly ack: AckKind = "text-success";
  private cfg: any;

  constructor(cfg: any) {
    this.cfg = cfg || {};
  }

  private gateway(): string {
    const base = this.cfg.baseUrl || this.cfg.gateway || "https://payjs.cn";
    return `${base.replace(/\/$/, "")}/api/native`;
  }

  private notifyUrl(): string | undefined {
    const host = process.env.XOI_PAY_NOTIFY_HOST;
    return host ? `${host}/api/pay/callback/aggr` : undefined;
  }

  async createOrder(ctx: CreateOrderContext): Promise<CreateOrderResult> {
    const mchid = String(this.cfg.mchid || this.cfg.mchId || "");
    if (!mchid) throw new Error("聚合收款未配置商户号(mchid)");
    const secret = String(this.cfg.secret || "");

    const params: Record<string, string|number|undefined> = {
      mchid,
      body: ctx.subject.slice(0, 32),
      attach: "xoi",
      total: Math.round(ctx.amount * 100), // 单位分
      out_trade_no: ctx.outTradeNo,
      notify_url: this.notifyUrl(),
      nonce_str: crypto.randomBytes(8).toString("hex"),
    };
    Object.keys(params).forEach((k) => { if (params[k] === undefined) delete params[k]; });
    // 加签：除 sign 外按 key 升序拼成 key=value&...&key=SECRET 后取大写 MD5
    const signStr =
      Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&") + `&key=${secret}`;
    (params as any).sign = crypto.createHash("md5").update(signStr).digest("hex").toUpperCase();

    const resp = await axios.post(this.gateway(), new URLSearchParams(params as any).toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000,
    });
    const j = resp.data?.data ?? resp.data;
    if (!j?.code_url) {
      throw new Error(`aggr create failed:${resp.data?.return_msg || resp.data?.msg || JSON.stringify(resp.data)}`);
    }
    return { qrContent: j.code_url };
  }

  async parseAndVerify(req: any): Promise<NotifyVerifyResult> {
    const b: Record<string, unknown> = { ...(req.query || {}), ...(req.body || {}) };
    const sign = b.sign as string | undefined;
    if (!sign) return { ok: false, paid: false, reason: "无签名参数" };

    // 同样规则反算签名比对
    const pairs = Object.keys(b).filter((k) => k !== "sign").sort().map((k) => `${k}=${b[k]}`);
    const expectSign = crypto
      .createHash("md5")
      .update(pairs.join("&") + `&key=${this.cfg.secret}`)
      .digest("hex")
      .toUpperCase();
    if (expectSign !== String(sign).toUpperCase()) {
      return { ok: false, paid: false, reason: "MD5 签名校验失败" };
    }

    const paidCode = (b.returncode as string) || "";
    const paidStatus = (b.paid_status as string) || ""; // 部分 SDK 用此字段标记成功
    const okPaid = paidCode.toLowerCase() === "success" || paidStatus.toLowerCase() === "success";
    const clean = { ...b }; delete clean.sign;

    return {
      ok: true,
      paid: okPaid,
      outTradeNo: b.out_trade_no as string | undefined,
      paidAmount: Number(b.total_fee ?? b.total ?? b.amount) / 100,
      channelTradeNo: (b.pay_js_order_id || b.transaction_id) as string | undefined,
      payload: clean,
      reason: okPaid ? undefined : `code=${paidCode}/${paidStatus}`,
    };
  }
}
