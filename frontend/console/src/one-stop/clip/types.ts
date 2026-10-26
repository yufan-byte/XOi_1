// AI 智能剪辑：数据类型
export type AssetKind = "video" | "image" | "audio";

export interface ClipAsset {
  id: string;
  name: string;
  kind: AssetKind;
  size: number;
  duration: number;       // 秒；图片固定 0
  width: number;
  height: number;
  thumb?: string;         // 小缩略图 dataURL（视频/图片）
  url?: string;           // 运行时 blob URL（不持久化）
  missing?: boolean;      // 重新打开时文件已不在浏览器里
  analysis?: AssetAnalysis; // AI 看过画面后的结论（随 project.assets 持久化，体积很小）
}

/** 素材 AI 分析：类别 / 一句话摘要 / 画质分 / 高光区间（秒，素材内时间）。
 *  pending = 排队（含「分析到一半项目被关掉」退回的），running 只存在于内存里，持久化时一律落成 pending */
export type AnalysisStatus = "pending" | "running" | "ready" | "failed";
export interface Highlight { start: number; end: number; score: number; desc: string }
export interface AssetAnalysis { status: AnalysisStatus; category?: string; summary?: string; quality?: 1 | 2 | 3 | 4 | 5; highlights?: Highlight[]; error?: string }
export const CATEGORIES = ["人物", "风景", "美食", "运动", "室内", "宠物", "文字画面", "其他"] as const;

import type { ClipFx } from "./fx";
/** 画面适配：smart_crop 居中裁满画幅；blur_bg 模糊放大的同一画面垫底、原画完整居中；letterbox 完整显示加黑边。
 *  老项目没有 fit 字段时一律按 letterbox（和以前导出的成片一样），新项目默认 smart_crop */
export type FitMode = "smart_crop" | "blur_bg" | "letterbox";
export const FITS: { value: FitMode; label: string; description: string }[] = [
  { value: "smart_crop", label: "智能裁切", description: "裁掉多余部分，画面铺满" },
  { value: "blur_bg", label: "模糊背景", description: "完整保留画面，空白处垫模糊背景" },
  { value: "letterbox", label: "保留黑边", description: "完整保留画面，空白处留黑边" },
];
export const isFit = (v: unknown): v is FitMode => v === "smart_crop" || v === "blur_bg" || v === "letterbox";
/** fx：叠在这一段上的动效组件（动态标题 / 社交贴纸 / 数字滚动），可空；fit：这一段单独的适配方式，空则跟随全片 */
export interface PlanSegment { source: number; start: number; end: number; caption?: string; fx?: ClipFx; fit?: FitMode }
export interface EditPlan { title: string; segments: PlanSegment[]; bgm?: number; summary?: string; fit?: FitMode }

export interface ClipProject {
  id: string;
  title: string;
  prompt: string;
  template: string;
  mode: "mixcut";
  model: string;
  assets: Omit<ClipAsset, "url">[];
  referenceNames: string[];
  plan?: EditPlan;
  version: number;
  createdAt: number;
  updatedAt?: number;
  rendered?: { duration: number; size: number; mime: string; at: number };
  ratio: RatioKey;
}

export type RatioKey = "16:9" | "9:16" | "1:1" | "4:5";
export const RATIOS: { value: RatioKey; label: string; w: number; h: number }[] = [
  { value: "9:16", label: "竖屏 9:16", w: 720, h: 1280 },
  { value: "16:9", label: "横屏 16:9", w: 1280, h: 720 },
  { value: "1:1", label: "方形 1:1", w: 720, h: 720 },
  { value: "4:5", label: "竖版 4:5", w: 864, h: 1080 },
];

export const TEMPLATES: { value: string; label: string; description: string; ratio: RatioKey; seg: [number, number]; total: [number, number]; style: string }[] = [
  { value: "mixcut.energetic-v1", label: "活力快剪", description: "mixcut.energetic-v1 · 9:16", ratio: "9:16", seg: [1.5, 3], total: [30, 45], style: "节奏快，镜头短促切换，优先运动感强、画面变化大的片段，字幕短促有力" },
  { value: "mixcut.cinematic-v1", label: "电影感慢剪", description: "mixcut.cinematic-v1 · 16:9", ratio: "16:9", seg: [3, 6], total: [45, 60], style: "节奏舒缓，电影感长镜头，优先人物特写与光线柔和的画面，字幕抒情、克制" },
  { value: "mixcut.vlog-v1", label: "日常 Vlog", description: "mixcut.vlog-v1 · 9:16", ratio: "9:16", seg: [3, 5], total: [45, 90], style: "按素材顺序（时间线）推进，像日记一样自然，字幕第一人称，轻松" },
  { value: "explainer.mg-v1", label: "动画讲解片", description: "explainer.mg-v1 · 16:9", ratio: "16:9", seg: [2, 4], total: [30, 60], style: "讲解片结构：先抛问题再分点讲清，每段字幕是一句完整的讲解要点，语气可信、清晰" },
];
/** 旧项目的模板值（fast/slow/product/vlog）映射到新模板 */
export const LEGACY_TEMPLATE: Record<string, string> = { fast: "mixcut.energetic-v1", slow: "mixcut.cinematic-v1", product: "explainer.mg-v1", vlog: "mixcut.vlog-v1" };
export const findTemplate = (v: string) => TEMPLATES.find((t) => t.value === (LEGACY_TEMPLATE[v] ?? v));

export const MODES = [
  { key: "mixcut", name: "短视频混剪", desc: "旅行、生活、活动的碎片素材，自动挑出精华片段，配上节奏、字幕和 BGM，出 30–60 秒竖屏成片。", soon: false },
  { key: "talking", name: "口播 / Vlog 精剪", desc: "长口播录像自动剪掉废话、停顿和重复，出精华版并配好字幕。", soon: true },
  { key: "commerce", name: "带货 / 商品视频", desc: "商品素材加卖点，自动出带货短视频，和电商工作台打通。", soon: true },
];

export const SUGGESTIONS = ["把这次旅行素材剪成 60 秒抖音混剪", "宝宝一岁成长记录，温馨一点", "周末露营 vlog，日落多给镜头", "剪个健身打卡视频，节奏卡点"];

export const now = () => Date.now();
export const fmtDur = (s: number) => { if (!Number.isFinite(s)) return "--:--"; const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, "0")}`; };
export const fmtSize = (b: number) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(2)} GB` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
