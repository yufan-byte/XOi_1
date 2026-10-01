import { watch, type WatchStopHandle } from "vue";
import { storeToRefs } from "pinia";
import settingStore from "@/stores/setting";
import { resolveThemeMode } from "./theme";

/** 主题桥消息类型：主应用 → 画布 / 3D 等独立应用 */
export const THEME_MSG = "xoi:theme";

/** 主应用主题快照，随消息广播 */
export interface ThemeMessage {
  type: typeof THEME_MSG;
  /** light / dark（已解析 auto） */
  theme: "light" | "dark";
  /** 品牌主色 */
  accent: string;
}

/**
 * 读取当前主应用主题设置，广播到所有独立应用：
 * - iframe（如 3D 导演台）：postMessage({ type: 'xoi:theme', theme, accent })
 * - 同 DOM 注入的无限画布（vanilla studio）：调用 window.StudioTheme 同步
 */
export function broadcastTheme(): ThemeMessage {
  const { themeSetting } = storeToRefs(settingStore());
  const msg: ThemeMessage = {
    type: THEME_MSG,
    theme: resolveThemeMode(themeSetting.value.mode),
    accent: themeSetting.value.primaryColor,
  };

  // 1) 所有 iframe
  document.querySelectorAll("iframe").forEach((frame) => {
    try {
      frame.contentWindow?.postMessage(msg, "*");
    } catch {
      /* 跨域 iframe 忽略 */
    }
  });

  // 2) 同 DOM 的无限画布（vanilla studio）
  const studio = (window as any).StudioTheme;
  if (typeof studio?.set === "function") {
    studio.set(msg.theme);
  } else {
    document.documentElement.classList.toggle("studio-theme-dark", msg.theme === "dark");
    document.documentElement.classList.toggle("theme-dark", msg.theme === "dark");
  }

  return msg;
}

/**
 * 在 App.vue 挂载时调用：先同步一次当前主题，再监听主题设置变化持续广播。
 * 返回停止监听函数（App 生命周期内无需清理）。
 */
export function initIframeTheme(): WatchStopHandle {
  const { themeSetting } = storeToRefs(settingStore());
  broadcastTheme();
  return watch(themeSetting, () => broadcastTheme(), { deep: true });
}
