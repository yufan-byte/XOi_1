import database from "@/utils";
import type { ChannelId, PayChannel } from "./types";
import { SimulateChannel } from "./simulate";
import { AlipayChannel } from "./alipay";
import { WechatChannel } from "./wechat";
import { AggrChannel } from "./aggregator";
import {simulationPaymentEnabled,paymentNotifyUrl} from "./guards";

export { listChannels, type ChannelOption, type ChannelId } from "./types";

/**
 * 渠道 ↔ o_vendorConfig.id 映射：
 *   simulate  无需配置(always-on)
 *   alipay    → vendor id "alipay"
 *   wechat    → vendor id "wechatpay"
 *   aggr      → vendor id "xunhu_aggregator"
 */
const VENDOR_MAP: Record<Exclude<ChannelId, "simulate">, string> = {
  alipay: "alipay",
  wechat: "wechatpay",
  aggr: "xunhu_aggregator",
};

async function loadConfig(vid: string): Promise<any> {
  const row = await database.db("o_vendorConfig").where({ id: vid }).first();
  if (!row) throw new Error(`未配置支付凭据:vendor=${vid}，请到后台「供应商配置」填写并启用`);
  if(Number(row.enable)!==1)throw new Error("支付渠道未启用");
  let inputValues: any = {};
  try {
    inputValues = row.inputValues ? JSON.parse(row.inputValues) : {};
  } catch (e) {
    console.warn(`[pay] 解析 ${vid} 的 inputValues 失败`, e);
    inputValues = {};
  }
  return { ...inputValues };
}

/** 按渠道标识实例化对应实现；真实渠道会从 o_vendorConfig 注入凭据 */
export async function getChannel(id: ChannelId | string): Promise<PayChannel> {
  switch (id as ChannelId) {
    case "simulate":
      if(!simulationPaymentEnabled())throw new Error("当前环境不允许模拟支付");
      return new SimulateChannel();
    case "alipay": {
      paymentNotifyUrl("alipay");
      const cfg = await loadConfig(VENDOR_MAP.alipay);
      if (!cfg.appId && !cfg.appid) throw new Error("支付宝渠道未启用或缺少 appId");
      return new AlipayChannel(cfg);
    }
    case "wechat": {
      paymentNotifyUrl("wechat");
      const cfg = await loadConfig(VENDOR_MAP.wechat);
      if (!cfg.mchId && !cfg.mchid) throw new Error("微信渠道未启用或缺少 mchId");
      return new WechatChannel(cfg);
    }
    case "aggr": {
      paymentNotifyUrl("aggr");
      const cfg = await loadConfig(VENDOR_MAP.aggr);
      if (!cfg.mchid && !cfg.mchId) throw new Error("聚合收款未启用或缺少 mchid");
      return new AggrChannel(cfg);
    }
    default:
      throw new Error(`未知支付渠道:${id}`);
  }
}
