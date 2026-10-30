/**
 * 支付工具桶文件(barrel)
 *
 * ⚠️⚠️ 安全门禁（2026-10-26 审计 R-A）⚠️⚠️
 * 本目录（factory/simulate/delivery/guards + o_order 表）当前**没有任何路由挂载**，
 * 这是**有意的安全状态**，不是遗漏：
 *   - simulate 渠道对回调零验签（parseAndVerify 无条件信任请求体）；
 *   - 误挂成 `POST /api/pay/callback/:channel` 之类端点 = 任意人可伪造回调加额度（资损 P0）。
 * 若将来要启用本模块，必须同时满足：
 *   1) 禁止挂载 simulate 渠道回调（生产环境 factory.getChannel 已拒，双保险见 simulate.ts）；
 *   2) 真实渠道回调必须 HMAC / 平台证书验签 + 金额一致性校验（isPaymentAmountMatch 已备未接）；
 *   3) 仅放行生产域名来源，且回调处理须幂等。
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
