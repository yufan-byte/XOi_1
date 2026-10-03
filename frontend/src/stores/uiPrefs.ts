// 全局轻量 UI 偏好：侧边栏状态 + aiAssistant 的临时 chrome 开关。
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

type SidebarPreference = "auto" | "expanded" | "compact";
const SIDEBAR_PREF_KEY = "xoi.sidebar.preference";
const SIDEBAR_AUTO_COLLAPSED_KEY = "xoi.sidebar.auto-collapsed";

function readSidebarPreference(): SidebarPreference {
  try {
    const value = localStorage.getItem(SIDEBAR_PREF_KEY);
    return value === "expanded" || value === "compact" ? value : "auto";
  } catch {
    return "auto";
  }
}

function readAutoCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_AUTO_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default defineStore("uiPrefs", () => {
  /** 当 true 表示用户身处 /aiAssistant 时主动要求短暂恢复外围 chrome 以便横跳它页 */
  const aiAssistantChromeVisible = ref(false);

  /**
   * auto：首次进入保持展开，第一次点业务入口后收成图标栏。
   * expanded / compact：用户手动选择，后续切换业务不再自动覆盖。
   */
  const sidebarPreference = ref<SidebarPreference>(readSidebarPreference());
  const sidebarAutoCollapsed = ref(readAutoCollapsed());

  function persistSidebar(): void {
    try {
      if (sidebarPreference.value === "auto") localStorage.removeItem(SIDEBAR_PREF_KEY);
      else localStorage.setItem(SIDEBAR_PREF_KEY, sidebarPreference.value);
      localStorage.setItem(SIDEBAR_AUTO_COLLAPSED_KEY, sidebarAutoCollapsed.value ? "1" : "0");
    } catch {
      /* 隐私模式下仅保留当前会话状态 */
    }
  }

  function collapseSidebarForNavigation(): void {
    if (sidebarPreference.value !== "auto") return;
    sidebarAutoCollapsed.value = true;
    persistSidebar();
  }

  function toggleSidebar(currentlyCollapsed: boolean): void {
    sidebarPreference.value = currentlyCollapsed ? "expanded" : "compact";
    persistSidebar();
  }

  function isSidebarCollapsed(): boolean {
    if (sidebarPreference.value === "compact") return true;
    if (sidebarPreference.value === "expanded") return false;
    return sidebarAutoCollapsed.value;
  }

  /** 翻转上述标志位 —— 由创作者台内的入口按钮调用,触发 WorkbenchLayout 与本地面板双双响应 */
  function toggleAiAssistantChrome(): void {
    aiAssistantChromeVisible.value = !aiAssistantChromeVisible.value;
  }

  return {
    aiAssistantChromeVisible,
    toggleAiAssistantChrome,
    sidebarPreference,
    sidebarAutoCollapsed,
    collapseSidebarForNavigation,
    toggleSidebar,
    isSidebarCollapsed,
  };
}, { persist: false });
