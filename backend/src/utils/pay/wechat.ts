import crypto from "node:crypto";
import axios from "axios";
import {paymentNotifyUrl,paymentExpiry,paymentIdentityMatches} from "./guards";
import type {
  AckKind,
  ChannelId,
  CreateOrderContext,
  CreateOrderResult,
  NotifyVerifyResult,
  PayChannel,
} from "./types";

/**
 * 微信 Native v3 渠道（SHA256-RSA2048 商户私钥签名 / 平台证书公钥验签 /
 * AES_256_GCM 解密回调 resource）。
 * 凭据来自 o_vendorConfig.inputValues(JSON)，约定字段：
 *   appId                 公众号/小程序 AppID
 *   mchId                  商户号
 *   apiV3Key               APIv3 密钥（32 字节，用于回调解密）
 *   certSerialNo           商户证书序列号
 *   privateKeyPem          商户私钥 PEM（用于出站请求签名）
 *   platformPublicKeyPem   微信平台公钥 PEM（用于回调验签；生产应定期轮换拉取平台证书，此处简化为固定配置）
 */
export class WechatChannel implements PayChannel {
  readonly name: ChannelId = "wechat";
  readonly ack: AckKind = "json-wechat";
  private cfg: any;

  constructor(cfg: any) {
    this.cfg = cfg || {};
  }

  private base(): string {
    return this.cfg.sandbox === true || this.cfg.sandbox === "1"
      ? "https://api.mch.weixin.qq.com/sandboxnew"
      : "https://api.mch.weixin.qq.com";
  }

  private notifyUrl(): string | undefined {
    return paymentNotifyUrl("wechat");
  }

  async createOrder(ctx: CreateOrderContext): Promise<CreateOrderResult> {
    const { appId, mchId } = requireCreds(this.cfg);
    const apiV3Key = String(this.cfg.apiV3Key);
    const certSerialNo = String(this.cfg.certSerialNo || "");
    const privPem = ensurePem(this.cfg.privateKeyPem);

    if (!certSerialNo) throw new Error("微信渠道缺少商户证书序列号(certSerialNo)");

    const body = JSON.stringify({
      appid: appId,
      mchid: mchId,
      description: ctx.subject.slice(0, 127),
      out_trade_no: ctx.outTradeNo,
      time_expire: paymentExpiry(),
      amount: { total: Math.round(ctx.amount * 100), currency: "CNY" },
      ...(this.notifyUrl() ? { notify_url: this.notifyUrl()! } : {}),
    });

    // V3 签名串：HTTP方法\nURL路径\n时间戳\n随机串\nbody\n
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString("hex");
    const urlPath = "/v3/pay/transactions/native";
    const signSrc = `POST\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
    const signature = crypto.createSign("RSA-SHA256").update(signSrc).sign(privPem, "base64");

    const authorization =
      `WECHATPAY2-SHA256-RSA2048 ` +
      `mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",` +
      `serial_no="${certSerialNo}",signature="${signature}"`;

    const resp = await axios.post(`${this.base()}${urlPath}`, body, {
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authorization },
      timeout: 15000,
    });
    if (!resp.data?.code_url) throw new Error(`wechat native failed:${JSON.stringify(resp.data)}`);
    return { qrContent: resp.data.code_url };
  }

  async parseAndVerify(req: any): Promise<NotifyVerifyResult> {
    if (apiV3Missing(this.cfg)) return { ok: false, paid: false, reason: "缺少 apiV3Key/platformPublicKey" };
    const pubPem = ensurePem(this.cfg.platformPublicKeyPem);

    const wxTimestamp = req.get ? req.get("Wechatpay-Timestamp") : req.headers["wechatpay-timestamp"];
    const wxNonce = req.get ? req.get("Wechatpay-Nonce") : req.headers["wechatpay-nonce"];
    const wxSignature = req.get ? req.get("Wechatpay-Signature") : req.headers["wechatpay-signature"];
    if (!wxTimestamp || !wxNonce || !wxSignature) return { ok: false, paid: false, reason: "缺 Wechatpay-* 验签头" };

    // raw body 必须保留原字节参与签名比对（app.ts 在 callback 路径已用 verify 钩子存入 _rawBodyText）；
    // 兜底缺失时退化为序列化对象（大概率验签失败但可定位问题）
    let rawText = "";
    try { rawText = req._rawBodyText ?? ""; } catch {}
    if (!rawText && typeof req.body === "object") rawText = JSON.stringify(req.body);
    void apiV3Used;

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(wxTimestamp + "\n" + wxNonce + "\n" + rawText + "\n");
    let verified = false;
    try { verified = verifier.verify(pubPem, Buffer.from(wxSignature as string, "base64")); }
    catch (e) { console.warn("[pay/wx] 验签异常", e); }

    if (!verified) return { ok: false, paid: false, reason: "签名校验失败" };

    // AES-256-GCM 解密 resource.ciphertext 取业务明文
    const payload = typeof req.body === "string" ? safeJson(req.body) : req.body;
    const res = payload?.resource;
    if (!res) return { ok: false, paid: false, reason: "无加密载荷", channelTradeNo: undefined };
    try {
      const plain = aesGcmDecrypt(res.ciphertext, res.nonce, res.associated_data || "", this.cfg.apiV3Key);
      const inner = safeJson(plain);
      if (!inner) return { ok: true, paid: false, reason: "解密后无法解析明文" };
      const identity=requireCreds(this.cfg);
      if(!paymentIdentityMatches(inner.appid,identity.appId)||!paymentIdentityMatches(inner.mchid,identity.mchId)||inner.amount?.currency!=="CNY")return {ok:false,paid:false,reason:"支付应用、商户或币种不匹配"};
      const paid = inner.trade_state === "SUCCESS";
      return {
        ok: true,
        paid,
        outTradeNo: inner.out_trade_no,
        paidAmount: Number(inner.amount?.total) / 100,
        channelTradeNo: inner.transaction_id,
        payload: { outer: payload, decrypt: inner },
        reason: paid ? undefined : `trade_state=${inner.trade_state}`,
      };
    } catch (e: any) {
      console.error("[pay/wx] GCM 解密失败", e);
      return { ok: false, paid: false, reason: `GCM 解密失败:${e.message}` };
    }
  }
}

// ───────── 工具函数 ─────────

function requireCreds(cfg: any): { appId: string; mchId: string } {
  const appId = cfg.appId || cfg.app_id || cfg.appid;
  const mchId = cfg.mchId || cfg.mchid || cfg.merchantId;
  if (!appId || !mchId) throw new Error("微信渠道未配置完整凭据(appId/mchId)");
  return { appId: String(appId), mchId: String(mchId) };
}

const apiV3Used = Symbol(); // 占位避免 lint 报 unused

function apiV3Missing(cfg: any): boolean {
  return !(cfg.apiV3Key && cfg.platformPublicKeyPem);
}

/** 把裸 RSA 私钥/公钥补齐 BEGIN-END PEM 块 */
function ensurePem(raw: string): string {
  const pem = raw.replace(/\r/g, "").trim();
  if (/BEGIN/.test(pem)) return pem.endsWith("\n") ? pem : `${pem}\n`;
  const kind = pem.length > 1000 ? "PRIVATE KEY" : "PUBLIC KEY";
  const lines = pem.match(/.{1,64}/g)?.join("\n") || pem;
  return `-----BEGIN ${kind}-----\n${lines}\n-----END ${kind}-----`;
}

/**
 * 微信 v3 回调 ciphertext 是「密文||authTag」整体 base64，
 * authTag 为末尾 16 字节。本函数拆分并完成 AEAD_AES_256_GCM 解密返回 UTF-8 明文。
 */
function aesGcmDecrypt(ciphertextB64: string, nonce: string, aad: string, key32: string): string {
  const keyBuf = Buffer.from(key32, "utf8");          // 必须 32 字节
  const data = Buffer.from(ciphertextB64, "base64");
  const authTag = data.subarray(data.length - 16);
  const ct = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, Buffer.from(nonce, "utf8"), { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  if (aad) decipher.setAAD(Buffer.from(aad));
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}

function safeJson(text?: string): any | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
