// 全局轻量 UI 偏好·现阶段仅承一项:aiAssistant 页「用户是否暂请把外围工作台 chrome 显出来」的一道应急口子。
//
// 背景:layouts/WorkbenchLayout.vue 的 isImmersive 白名单对 /aiAssistant 是硬性强制沉浸(顶栏 topMenu 被 v-if 吃掉),
// 这意味着子页本身没法靠改自身状态来让用户中途看见全局导航去横向跳转至 项目列表/画布/定价 等兄弟模块。
// 引入本 store 后,WorkbenchLayout 读 aiAssistantChromeVisible 决定是否对该路由网开一面,
// 同时 views/aiAssistant/index.vue 也据此派生本地 focusMode 让面板伪工具条呼应显隐,
// 双向动作统一经 toggleAiAssistantChrome 一手驱动避免脱节。
//
// 初值 false 保证首访即纯沉浸;persist:false 使刷新回退默认免得上次选择粘住影响下次进入预期。
import { defineStore } from "pinia";
import { ref } from "vue";

export default defineStore("uiPrefs", () => {
  /** 当 true 表示用户身处 /aiAssistant 时主动要求短暂恢复外围 chrome 以便横跳它页 */
  const aiAssistantChromeVisible = ref(false);

  /** 翻转上述标志位 —— 由创作者台内的入口按钮调用,触发 WorkbenchLayout 与本地面板双双响应 */
  function toggleAiAssistantChrome(): void {
    aiAssistantChromeVisible.value = !aiAssistantChromeVisible.value;
  }

  return {
    aiAssistantChromeVisible,
    toggleAiAssistantChrome,
  };
}, { persist: false });
