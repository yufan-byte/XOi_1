/**
 * 支付工具桶文件(barrel)
 *
 * 仅对外收敛「下单工厂」与「渠道枚举」两类高频能力，
 * 让路由层可用 `from "@/utils/pay"` 直接收口，
 * 避免 bundler 对「以目录当模块」的导入无法定位 entry。
 *
 * 渠道实现类(alipay/wechat/aggregator/simulate)、异步发放(delivery)
 * 各自维持显式深路径引用(@/utils/pay/<x>)，不在本桶展开，
 * 既控制包体增长面，也让静态分析一眼可见真实依赖。
 */
export { listChannels } from "./factory";
export { getChannel } from "./factory";
export { type ChannelId, type ChannelOption, type PayChannel, type NotifyVerifyResult } from "./types";
