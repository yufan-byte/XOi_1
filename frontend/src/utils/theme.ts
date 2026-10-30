import settingStore from "@/stores/setting";

// HEX 转 HSL
const hexToHsl = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 0 };

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

// HSL 转 HEX
const hslToHex = (h: number, s: number, l: number) => {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// 解析主题模式为具体值（light/dark），用于 md-editor 等不支持 auto 的组件
export const resolveThemeMode = (mode: string): "light" | "dark" =>
  mode === "auto" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : (mode as "light" | "dark");

// 应用主题模式
export const applyThemeMode = (mode: string) => {
  const targetMode = mode === "auto" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;

  // 方式 1：使用 theme-mode 属性
  if (targetMode === "dark") {
    document.documentElement.setAttribute("theme-mode", "dark");
  } else {
    document.documentElement.removeAttribute("theme-mode");
  }

  // 方式 2：使用 dark 类名
  if (targetMode === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
};

// 应用强调色
// XOi Mono：主按钮、复选框等「品牌色」固定为主文字色（见 styles/xoi.scss），
// 用户选择的颜色只作为强调色，用于选中、焦点与「已覆盖」标记（--x-sel）。
export const applyThemeColor = (color: string) => {
  const root = document.documentElement;
  const isDark = root.getAttribute("theme-mode") === "dark";
  const { h, s, l } = hexToHsl(color || "#9AA8FF");
  const sat = isDark ? s : Math.min(s, 70);
  const light = isDark ? Math.max(l, 72) : Math.min(l, 52);
  const sel = hslToHex(h, sat, light);
  const r = parseInt(sel.slice(1, 3), 16);
  const g = parseInt(sel.slice(3, 5), 16);
  const b = parseInt(sel.slice(5, 7), 16);
  root.style.setProperty("--x-sel", sel);
  root.style.setProperty("--x-sel-bg", `rgba(${r}, ${g}, ${b}, ${isDark ? 0.1 : 0.08})`);

  // 清掉旧版本写在行内的品牌色阶，交给样式表统一管理
  for (let i = 1; i <= 10; i++) root.style.removeProperty(`--td-brand-color-${i}`);
  ["", "-hover", "-focus", "-active", "-disabled", "-light", "-light-hover"].forEach((suffix) =>
    root.style.removeProperty(`--td-brand-color${suffix}`),
  );
  root.style.removeProperty("--td-text-color-brand");
  root.style.removeProperty("--td-text-color-link");
};

// 使用 View Transition API 进行平滑过渡
export const toggleThemeWithTransition = (event: MouseEvent | undefined, callback: () => void) => {
  if (!document.startViewTransition) {
    callback();
    return;
  }

  const x = event?.clientX ?? window.innerWidth / 2;
  const y = event?.clientY ?? window.innerHeight / 2;
  const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const root = document.documentElement;
  root.style.setProperty("--x", `${x}px`);
  root.style.setProperty("--y", `${y}px`);
  root.style.setProperty("--r", `${endRadius}px`);

  document.startViewTransition(callback);
};

// 初始化主题（在 App.vue 中调用）
export const initTheme = () => {
  const { themeSetting } = storeToRefs(settingStore());
  // 应用缓存的主题设置
  applyThemeMode(themeSetting.value.mode);
  applyThemeColor(themeSetting.value.primaryColor);
  if (themeSetting.value.fontSize) {
    document.documentElement.style.fontSize = `${themeSetting.value.fontSize}px`;
  }

  // 监听系统主题变化
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (themeSetting.value.mode === "auto") {
      toggleThemeWithTransition(undefined, () => {
        const targetMode = e.matches ? "dark" : "light";

        if (targetMode === "dark") {
          document.documentElement.setAttribute("theme-mode", "dark");
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.removeAttribute("theme-mode");
          document.documentElement.classList.remove("dark");
        }

        applyThemeColor(themeSetting.value.primaryColor);
      });
    }
  });
};

// 导出 composable 供组件使用
export const useTheme = () => {
  const { themeSetting } = storeToRefs(settingStore());
  return {
    themeSetting,
    applyThemeMode,
    applyThemeColor,
    toggleThemeWithTransition,
  };
};
