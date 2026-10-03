"use client";
/**
 * 客服 / 反馈入口桥。
 *
 * 背景：造物里 `document.dispatchEvent(new CustomEvent("mc:support"))` 是由**整站 AppShell** 接住的
 * （弹出客服对话框）。console 是搬过来的代理商中心子应用，没有那个 AppShell，于是这些按钮
 * **全都没有监听方** —— 点了没反应（顶栏「联系客服」、资料弹窗「意见反馈」、充值弹窗「联系客服」
 * 导流、工单页的 goSupport 都是这条路径）。
 *
 * XOi 的沟通渠道是主站「问题反馈」表单（与主站侧栏「问题反馈」同一个表），所以这里统一把它接住：
 * console 任意位置派发 mc:support 都会新窗口打开反馈表单。要在网关后台改渠道，改这一个常量即可。
 */
export const FEEDBACK_URL = "https://docs.qq.com/smartsheet/form/EmvmQBrmlPmr%2Fss_vsqk2v%2FvhiGzE?tab=ss_vsqk2v";

/** 打开反馈表单（新窗口） */
export function openFeedback() {
  window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer");
}

/** 在应用启动时调用一次：把 mc:support 事件接到反馈表单 */
export function installSupportBridge() {
  if (typeof window === "undefined") return;
  window.addEventListener("mc:support", () => openFeedback());
}
