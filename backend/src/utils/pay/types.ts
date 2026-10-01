import type { Request } from "express";
import database from "@/utils";

/**
 * 支付闭环统一渠道抽象。
 * 四种实现共享同一形状：
 * - simulate 开发态模拟(MVP 主力，无需任何外部资质即可演示完整链路)
 * - alipay   支付宝当面付(alipay.trade.precreate)，RSA2 签名
 * - wechat   微信 Native v3(SHA256-RSA2048 商户私钥签名 + 平台证书验签 + AES_256_GCM 回调解密)
 * - aggr     第三方聚合收款(以 PayJS 为参考规范，MD5 签名)
 */
export type ChannelId = "simulate" | "alipay" | "wechat" | "aggr";

/** 由订单编排器组装的下单上下文 */
export interface CreateOrderContext {
  outTradeNo: string;
  amount: number; // 元
  subject: string; // 商品描述
}

export interface CreateOrderResult {
  /** 可被前端 qrcode 库直接编码的内容串(code_url / qr_code / 模拟链接) */
  qrContent: string;
  /** 三方预下单号(可选审计留存) */
  channelOrderId?: string;
}

/** 渠道对异步回调的自检结果：是否可信、对应哪笔商户单号 */
export interface NotifyVerifyResult {
  ok: boolean;
  /**
   * 是否真正付款完成可入账。
   * - 真·渠道按 trade_state/trade_status 判定 SUCCESS 才置 true；
   * - 中间态(WAIT_BUYER 等)通知虽签名合法但应忽略不入账；
   * - 缺省(undefined)表示该渠道任何触发即视作确认(simulate / dev-trigger 场景)。
   */
  paid?: boolean;
  outTradeNo?: string;
  /** 渠道确认的实付金额，单位元；回调入账前必须与订单快照一致 */
  paidAmount?: number;
  /** 三方交易号(流水号)审计列 */
  channelTradeNo?: string;
  /** 已清洗后的业务载荷，将写入 o_order.callback_payload 留存 */
  payload?: Record<string, unknown>;
  reason?: string;
}

/** 渠道向第三方回执“已收到”所需的差异化应答 */
export type AckKind = "text-success" | "json-wechat" | "none";

export interface PayChannel {
  readonly name: ChannelId;
  readonly ack: AckKind;
  /** 向三方发起下单并取回二维码内容 */
  createOrder(ctx: CreateOrderContext): Promise<CreateOrderResult>;
  /**
   * 自行校验来源合法性与签名，提取商户单号；
   * 只回答「这条通知可信吗 / 属于哪笔单」，绝不在此处发放入账。
   */
  parseAndVerify(req: Request): Promise<NotifyVerifyResult>;
}

/** 列表项：用于前端展示当前可选用的扫码方式 */
export interface ChannelOption {
  id: ChannelId;
  label: string;
  enabled: boolean;
  hint: string;
}

const CHANNEL_META: Array<{
  id: ChannelId;
  vid: string | null; // 关联 o_vendorConfig.id；null 表示不走供应商表
  label: string;
  hint: string;
}> = [
  { id: "simulate", vid: null, label: "模拟支付", hint: "开发演示专用 · 手动标记付款即可走通链路" },
  { id: "alipay", vid: "alipay", label: "支付宝当面付", hint: "当面付 precreate · 个人开发者也可快速签约" },
  { id: "wechat", vid: "wechatpay", label: "微信Native扫码", hint: "V3 Native · 需企业商户号" },
  { id: "aggr", vid: "xunhu_aggregator", label: "第三方聚合收款", hint: "PayJS 类 · 免营业执照即时可用" },
];

async function isEnabledByConfig(id: ChannelId): Promise<boolean> {
  const meta = CHANNEL_META.find((c) => c.id === id)!;
  if (!meta.vid) return process.env.NODE_ENV !== "prod"; // 模拟仅开发环境可用
  const row = await database.db("o_vendorConfig").where({ id: meta.vid }).first();
  if (!row || !row.enable || Number(row.enable) === 0) return false;
  let iv: any = {};
  try {
    iv = row.inputValues ? JSON.parse(row.inputValues) : {};
  } catch {
    iv = {};
  }
  // 至少存在一个看起来像样的必填凭证才算启用
  return Boolean(iv.appId || iv.appid || iv.mchId || iv.mchid || iv.mchid_payjs || iv.secret || iv.token);
}

/** 枚举所有候选渠道及其当前启用状态(供前端选择面板呈现) */
export async function listChannels(): Promise<ChannelOption[]> {
  const opts = await Promise.all(
    CHANNEL_META.map(async (meta) => ({
      id: meta.id,
      label: meta.label,
      hint: meta.hint,
      enabled: await isEnabledByConfig(meta.id),
    })),
  );
  return opts;
}
