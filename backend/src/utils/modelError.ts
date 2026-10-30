/**
 * 文本模型调用失败 → 用户能看懂的话。
 *
 * 【为什么要它】角色场景页的提示词失败态直接把底层异常写进 o_assets.promptErrorReason，
 * 用户看到的是 "Invalid JSON response" —— 真实原因是 new-api 渠道账号池被上游风控冷却
 * （status_code=200 但响应体不是 JSON，ai-sdk 只会抛这句）。这类信息量约等于零，
 * 用户既不知道该等还是该换模型。这里只做"翻译"，不改动任何重试/计费逻辑。
 */
export function friendlyTextModelError(message: unknown): string {
  const raw = String(message ?? "").trim();
  if (!raw) return "提示词生成失败，请重试";
  if (/Invalid JSON response/i.test(raw)) {
    return "文本模型没有返回可用内容：上游通道可能正在限流/冷却，请稍后重试，或在左侧面板换一个文本模型";
  }
  if (/no usable account|活动池为空|rate.?limit|quota|负载已饱和|冷却|隔离目录/i.test(raw)) {
    return "文本模型上游通道暂时拥塞（限流/冷却中），请稍后重试，或换一个文本模型";
  }
  if (/缺少本轮预算|预算已使用|预算未确认/.test(raw)) {
    return "本轮调用预算未确认，请重新点击生成并在费用弹窗里确认后再试";
  }
  if (/没有可用的文本模型/.test(raw)) {
    return "当前没有可用的文本模型：请先在项目设置里选择文本模型，或联系管理员开通渠道";
  }
  return raw;
}
