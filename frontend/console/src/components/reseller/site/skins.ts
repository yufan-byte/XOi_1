/** 站点皮肤（与 globals.css 中 html.skin-* 对应；曜岩 = 平台默认） */
export interface Skin { key: string; name: string; desc: string; support: string; swatch: [string, string, string, string] }
export const SKINS: Skin[] = [
  { key: "obsidian", name: "曜岩", desc: "现任 · 紫玻璃质感高级暗色", support: "支持浅色 / 深色", swatch: ["#0b0b0f", "#1b1b22", "#f4f4f5", "#7c5cff"] },
  { key: "industrial", name: "工业风", desc: "纯黑白 + 单一紫 · 直角发丝", support: "支持浅色 / 深色", swatch: ["#000000", "#0f0f10", "#ffffff", "#9b5cf5"] },
  { key: "neobrutal", name: "新粗野", desc: "暖奶油 + 粗边 · 珊瑚黄", support: "支持浅色 / 深色", swatch: ["#0b0b0b", "#1a1a1a", "#fbf3dc", "#f07370"] },
  { key: "motion", name: "动效驱动", desc: "深炭 + 珊瑚 · 圆角弹性", support: "支持浅色 / 深色", swatch: ["#111111", "#1c1c1c", "#e8e8e8", "#f07370"] },
  { key: "japanese", name: "日式", desc: "暖纸 + 霓虹黄绿 · 大留白", support: "支持浅色 / 深色", swatch: ["#151515", "#222222", "#e5e5df", "#e3f750"] },
  { key: "bento", name: "便当盒网格", desc: "Apple 灰 + 不等大卡片 · 18px 圆角", support: "支持浅色 / 深色", swatch: ["#f2f2f2", "#ffffff", "#1c1c1e", "#2f6fe0"] },
  { key: "rgbsplit", name: "色差RGB分裂", desc: "纯黑白 + RGB 错位 · 零圆角", support: "仅深色", swatch: ["#000000", "#0d0d0d", "#ffffff", "#ee3124"] },
  { key: "memphis", name: "孟菲斯", desc: "暖杏底 + 撞色硬阴影 · 粗黑边", support: "仅浅色", swatch: ["#fdf3ec", "#ffffff", "#111111", "#f07370"] },
  { key: "clay", name: "粘土", desc: "暖陶土 + 柔和双向阴影 · 超大圆角", support: "仅浅色", swatch: ["#e8c7a6", "#d8ae85", "#5a3e2b", "#c29a70"] },
  { key: "pixel", name: "像素风", desc: "矿物色板 + 方块硬投影 · 零圆角", support: "仅深色", swatch: ["#17141f", "#2b2438", "#efe7d6", "#3fb59a"] },
];
export const skinName = (key: string) => SKINS.find((s) => s.key === key)?.name ?? "曜岩";
