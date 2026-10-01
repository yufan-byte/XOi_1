import crypto from "node:crypto";
import axios from "axios";
import qs from "node:querystring";
import type {
  AckKind,
  ChannelId,
  CreateOrderContext,
  CreateOrderResult,
  NotifyVerifyResult,
  PayChannel,
} from "./types";

/**
 * 支付宝「当面付」precreate 渠道（RSA2 / RSA-SHA256）。
 * 凭据来自 o_vendorConfig.inputValues(JSON)，约定字段：
 *   appId        应用 APPID
 *   privateKey    商户应用私钥 PEM 或裸 base64
 *   publicKey     支付宝公钥 PEM 或裸 base64（用于回调验签）
 *   sandbox       是否沙箱环境(true/false)
 */
export class AlipayChannel implements PayChannel {
  readonly name: ChannelId = "alipay";
  readonly ack: AckKind = "text-success";
  private cfg: any;

  constructor(cfg: any) {
    this.cfg = cfg || {};
  }

  private gate(): string {
    return this.cfg.sandbox === true || this.cfg.sandbox === "1"
      ? "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
      : "https://openapi.alipay.com/gateway.do";
  }

  private notifyUrl(): string | undefined {
    const host = process.env.XOI_PAY_NOTIFY_HOST;
    return host ? `${host}/api/pay/callback/alipay` : undefined;
  }

  async createOrder(ctx: CreateOrderContext): Promise<CreateOrderResult> {
    const appId = this.cfg.appId || this.cfg.appid;
    const privKey = this.cfg.privateKey || this.cfg.private_key;
    if (!appId || !privKey) {
      throw new Error("支付宝渠道未配置完整凭据(appId/privateKey)");
    }
    const bizContent = JSON.stringify({
      out_trade_no: ctx.outTradeNo,
      total_amount: (Math.round(ctx.amount * 100) / 100).toFixed(2),
      subject: ctx.subject.slice(0, 128),
      timeout_express: this.cfg.timeoutExpress || this.cfg.timeout_express || "15m",
    });

    const params: Record<string, string> = {
      app_id: String(appId),
      method: "alipay.trade.precreate",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: cstStamp(),
      version: "1.0",
      biz_content: bizContent,
    };
    const nu = this.notifyUrl();
    if (nu) params["notify_url"] = nu;
    params.sign = rsaSign(buildSignData(params), privKey);

    const resp = await axios.post(this.gate(), qs.stringify(params), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000,
    });
    const j = resp.data?.alipay_trade_precreate_response;
    if (!j || j.code !== "10000") {
      throw new Error(`alipay precreate failed:${j?.sub_code || j?.sub_msg || JSON.stringify(resp.data)}`);
    }
    return { qrContent: j.qr_code, channelOrderId: j.out_trade_no };
  }

  async parseAndVerify(req: any): Promise<NotifyVerifyResult> {
    const pubKey = this.cfg.publicKey || this.cfg.alipay_public_key || this.cfg.public_key;
    if (!pubKey) return { ok: false, paid: false, reason: "缺少支付宝公钥无法验签" };

    const b: Record<string, any> = { ...(req.body || {}), ...(req.query || {}) };
    if (!b.sign) return { ok: false, paid: false, reason: "无签名参数" };

    const verified = rsaVerify(buildSignData(b), String(b.sign), pubKey);
    if (!verified) return { ok: false, paid: false, reason: "签名校验失败" };

    const ts = b.trade_status;
    const paid = ts === "TRADE_SUCCESS" || ts === "TRADE_FINISHED";
    const clean: Record<string, unknown> = { ...b };
    delete clean.sign;
    delete (clean as any).sign_type;
    return {
      ok: true,
      paid,
      outTradeNo: b.out_trade_no,
      paidAmount: Number(b.total_amount),
      channelTradeNo: b.trade_no,
      payload: clean,
      reason: paid ? undefined : `trade_status=${ts}`,
    };
  }
}

// ───────── 工具函数 ─────────

/** 把裸 base64 密钥补齐 BEGIN/END 头尾并按 64 字符折行；已是标准 PEM 则原样返回 */
function wrapKey(raw: string, kind: "private" | "public"): string {
  const pem = raw.replace(/\r/g, "").trim();
  if (/BEGIN/.test(pem)) return pem.endsWith("\n") ? pem : `${pem}\n`;
  const body = pem.match(/.{1,64}/g)?.join("\n") || pem;
  return `-----BEGIN ${kind.toUpperCase()} KEY-----\n${body}\n-----END ${kind.toUpperCase()} KEY-----`;
}

/** 东八区北京时间 yyyy-MM-dd HH:mm:ss（不受宿主时区影响）*/
function cstStamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  const hour = g("hour").replace(/^24$/, "00");
  return `${g("year")}-${g("month")}-${g("day")} ${hour}:${g("minute")}:${g("second")}`;
}

/** 除 sign/sign_type 外按 key ASCII 升序拼成 k=v&... ，空值跳过、value 不 URL 编码 */
function buildSignData(params: Record<string, any>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .filter(Boolean)
    .join("&");
}

function rsaSign(data: string, privateKey: string): string {
  return crypto.createSign("RSA-SHA256").update(data, "utf8").sign(wrapKey(privateKey, "private"), "base64");
}

function rsaVerify(data: string, signature: string, publicKey: string): boolean {
  try {
    return crypto.createVerify("RSA-SHA256").update(data, "utf8").verify(wrapKey(publicKey, "public"), signature, "base64");
  } catch {
    return false;
  }
}
