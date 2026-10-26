// AI 漫剧：项目 / 九阶段 / 剧本 / 资产 / 分镜 / 视频 的云端文档模型
/** 画面风格库（与原站「画面风格」弹窗一致：真人 / 2D / 3D 三组 + 我的自建） */
export const STYLE_GROUPS: { key: "真人" | "2D" | "3D"; styles: string[] }[] = [
  { key: "真人", styles: ["真人复古武侠", "写实", "真人电影", "邵氏电影风格", "真实光影", "真人古装", "胡金铨武侠风格", "90年代写实电影风格", "90年代中国农村电影风格", "科技感电影风格", "真人复古港片", "霓虹赛博电影风格", "90年代香港片风格", "悬疑电影风格", "美式复古影棚电影风格", "韩国冷淡风电影风格", "复古战争电影风格", "蓝橙色调影视风格", "紫色色调电影风格", "中式暖调蓝辉风格", "复古叙事电影风格", "恐怖电影风格", "美式复古怪异影视风格", "希腊神话电影风格", "美式复古影视风格", "日本黑白胶片摄影风格", "荒野电影风格", "复古电影摄影风格", "美式经济上行风格", "老式工业影视风格", "橙黄色电影风格", "荒诞高调白色电影风格", "工业电影风格", "黑白经典电影风格"] },
  { key: "2D", styles: ["2D韩式动画", "2D灵怪都市", "精致国漫", "2D吉卜力动画", "2D日式侦探", "国漫二次元常用风格", "中国神话风格", "2D篮球高手", "2D电影", "2D复古动画", "2D诡异惊悚", "二次元概念艺术风格", "高质量2D热血漫风格", "日式动画", "漫画", "日式3D渲染2D", "2D热血动画", "2D哆小啦", "2D死亡之神", "日系平涂插画风格", "游戏概念艺术风格", "黑白水墨风格", "美国漫画动画插画风格", "美式黑暗插画风格", "3D渲染2D", "2D动画", "2D奇幻动画", "2DQ版", "2D美式动画", "2D美式漫画", "2D鸟山明", "2D藤本木", "2D乔乔风", "2D手冢治虫", "插画蒸汽波风格", "赛博朋克数字插画风格", "达利风格", "复古肌理迷幻插画风格", "儿童蜡笔手绘插画风格", "黑白二维漫画动画风格", "大友克洋风格", "暗色调厚涂风格插画", "手冢治虫时代卡通画风", "上美画风", "二维卡通插画风格", "黑暗原画概念风格", "皮影戏插画风格", "黑暗奇幻插画风格", "暗黑漫画风格", "简洁插画风格", "复古半色调暗色调漫画风格", "东方水墨画风", "像素风", "赛博朋克"] },
  { key: "3D", styles: ["3D国风高清渲染风格", "3D中国奇幻动画", "3D写实", "高清3D真实渲染风格", "3D玄幻", "3D美式", "超现实3D渲染风格", "3D风格化渲染", "欧美风格化3D渲染", "毛绒定格动画", "高品质动画渲染风格", "动漫三渲二风格", "UE5写实渲染", "3D真实感PBR渲染风格", "3D游戏渲染风格", "3D加强版卡通渲染风格", "3DQ版", "3D球面", "3D方块世界", "3D手游", "手办定格动画", "粘土定格动画", "积木定格动画", "3D卡通微缩景观", "3D西方卡通风格的绘制", "3D数字雕刻风格", "3D美式卡通游戏美术", "3D盲盒涂装风", "3D卡通渲染风格", "美国卡通3D渲染风格", "复古Y2K奇幻风格", "粘土动画风格", "定格动画风格", "定格动画"] },
];
/** Show the number of actual selectable styles, never a stale marketing count. */
export const STYLE_GROUP_COUNT: Record<string, number> = Object.fromEntries(STYLE_GROUPS.map(g=>[g.key,g.styles.length]));
/** 旧版 6 种风格（迁移用） */
const LEGACY_STYLE: Record<string, string> = { 国漫: "精致国漫", 日漫: "日式动画", "3D 动画": "高品质动画渲染风格", 写实: "写实", 水墨: "黑白水墨风格", 美漫: "2D美式漫画" };
export const COMIC_RATIOS = ["9:16", "16:9"] as const;
export const RATIO_LABEL: Record<string, string> = { "9:16": "竖屏", "16:9": "横屏", "1:1": "方屏" };
/** 剧集语言（参考站 2026-10-01：海外剧支持 10 种语言）；前两项沿用旧值，老项目不受影响 */
export const COMIC_REGIONS = ["国产剧 · 中文", "海外剧 · English", "海外剧 · 日本語", "海外剧 · 한국어", "海外剧 · Español", "海外剧 · Français", "海外剧 · Deutsch", "海外剧 · Русский", "海外剧 · Bahasa Indonesia", "海外剧 · Português"] as const;
/** 各语言写给模型的说法：用什么语言创作、面向哪里的观众 */
const REGION_LANG: Record<string, { lang: string; market: string }> = {
  "国产剧 · 中文": { lang: "中文", market: "中国" }, "海外剧 · English": { lang: "英文", market: "欧美" }, "海外剧 · 日本語": { lang: "日语", market: "日本" },
  "海外剧 · 한국어": { lang: "韩语", market: "韩国" }, "海外剧 · Español": { lang: "西班牙语", market: "西班牙语地区（拉美 / 西班牙）" }, "海外剧 · Français": { lang: "法语", market: "法语地区" },
  "海外剧 · Deutsch": { lang: "德语", market: "德语地区" }, "海外剧 · Русский": { lang: "俄语", market: "俄语地区" }, "海外剧 · Bahasa Indonesia": { lang: "印尼语", market: "印度尼西亚" }, "海外剧 · Português": { lang: "葡萄牙语", market: "葡语地区（巴西 / 葡萄牙）" },
};
export const regionLang = (region: string) => REGION_LANG[region] ?? (isOverseas(region) ? REGION_LANG["海外剧 · English"] : REGION_LANG["国产剧 · 中文"]);
export const COMIC_SPECS = ["默认", "高清"] as const;
export const COMIC_SCHEDULES = ["自动托管", "渐进式"] as const;
/** 首页「调度」：渠道调度策略 */
export const COMIC_STRATEGIES = ["稳定优先", "价格优先", "速度优先"] as const;

export type ComicStyle = string;
export type ComicRatio = "9:16" | "16:9" | "1:1";
export type ComicRegion = string;
export type ComicSpec = (typeof COMIC_SPECS)[number];
export type ComicSchedule = (typeof COMIC_SCHEDULES)[number];
export type ComicStrategy = (typeof COMIC_STRATEGIES)[number];
export type ComicKind = "premium" | "batch";
export type GenStatus = "idle" | "running" | "done" | "error" | "stale";
export type AssetKind = "character" | "scene" | "prop";

/** 海外剧：按所选语言创作（见 regionLang） */
export const isOverseas = (region: string) => /海外|English|欧美/i.test(region);
export function normalizeRegion(r?: string): ComicRegion { if (!r) return COMIC_REGIONS[0]; if ((COMIC_REGIONS as readonly string[]).includes(r)) return r; return /欧美|海外|english/i.test(r) ? COMIC_REGIONS[1] : COMIC_REGIONS[0]; }
export function normalizeStyle(s?: string): ComicStyle { if (!s) return "精致国漫"; return LEGACY_STYLE[s] ?? s; }

export const ASSET_KIND_LABEL: Record<AssetKind, string> = { character: "角色", scene: "场景", prop: "道具" };

/* ---------- 创作路径（阶段） ---------- */
export type StageKey = "bible" | "input" | "intent" | "direction" | "outline" | "novel" | "script" | "assets" | "storyboard" | "video";
export interface StageDef { key: StageKey; no: string; label: string; desc: string }
export const STAGE_DEFS: Record<StageKey, StageDef> = {
  bible: { key: "bible", no: "00", label: "系列设定", desc: "统一世界观、主角、风格与每集模板；使用项目所选模型和制作规格" },
  input: { key: "input", no: "01", label: "输入", desc: "创意、剧名、封面与制作参数" },
  intent: { key: "intent", no: "02", label: "意图", desc: "AI 提炼目标受众、类型、情绪基调、时长目标与卖点，可逐项修改" },
  direction: { key: "direction", no: "03", label: "方向", desc: "AI 提出 3 个创作方向，选一个或自己写" },
  outline: { key: "outline", no: "04", label: "大纲", desc: "分集大纲：每集标题与梗概，可编辑" },
  novel: { key: "novel", no: "05", label: "小说", desc: "按集写成小说体正文，流式输出" },
  script: { key: "script", no: "06", label: "剧本", desc: "分场剧本：场景 / 时间 / 人物 / 对白 / 动作" },
  assets: { key: "assets", no: "07", label: "资产", desc: "角色 / 场景 / 道具提取与定妆图" },
  storyboard: { key: "storyboard", no: "08", label: "分镜", desc: "镜号 / 景别 / 运镜 / 画面 / 台词 / 时长与关键帧" },
  video: { key: "video", no: "09", label: "视频", desc: "逐镜生成视频、配音并合成成片" },
};
/** 精品剧：01 输入 → 09 视频 */
export const PREMIUM_PATH: StageKey[] = ["input", "intent", "direction", "outline", "novel", "script", "assets", "storyboard", "video"];
/** 批量剧：跳过 01 输入，从 00 圣经开始 */
export const BATCH_PATH: StageKey[] = ["bible", "script", "assets", "storyboard", "video"];
export const stagePath = (kind: ComicKind | undefined): StageKey[] => (kind === "batch" ? BATCH_PATH : PREMIUM_PATH);

/** 图片生成尺寸（按画幅） */
export const IMAGE_SIZE: Record<ComicRatio, string> = { "9:16": "1088x1920", "16:9": "1920x1088", "1:1": "1024x1024" };
/** 视频生成尺寸（按画幅 × 规格） */
export const VIDEO_SIZE: Record<ComicSpec, Record<ComicRatio, string>> = {
  默认: { "9:16": "720x1280", "16:9": "1280x720", "1:1": "1024x1024" },
  高清: { "9:16": "1080x1920", "16:9": "1920x1080", "1:1": "1080x1080" },
};

/** 风格 → 英文生图风格词：按关键词映射，未命中时直接用中文风格名 */
/** desc = 「我的自建」风格的描述（色调、光线、笔触…）：自建风格名本身对生图模型没有意义，描述才是要注入画面的内容 */
export function stylePrompt(style: string, desc?: string): string {
  // Compatibility helper for existing consumers. Billable prompts are built on the server.
  const rules:[RegExp,string][]=[[/水墨/,'traditional Chinese ink wash painting'],[/像素/,'pixel art'],[/2D|三渲二|渲染2D/,'2D anime illustration'],[/真人|写实|电影|光影|港片|古装|武侠|胶片|摄影|影棚|影视/,'photorealistic cinematic live-action film still'],[/3D|渲染|UE5|PBR|定格|粘土|手办|积木|盲盒|微缩/,'high quality 3D animated render'],[/日式|日系|二次元|动画|国漫|神话|热血|插画|漫画/,'2D anime illustration']];
  return `${style} style${desc?.trim()?` (${desc.trim()})`:''}, ${rules.find(([re])=>re.test(style))?.[1]||'cinematic illustration'}`;
}

/* ---------- 各阶段产物 ---------- */
export interface ComicBible { world: string; protagonists: string; style: string; template: string }
export interface ComicIntent { audience: string; genre: string; tone: string; duration: string; sellingPoints: string }
export interface ComicDirection { id: string; title: string; logline: string; keywords: string[] }
export interface OutlineEpisode { title: string; synopsis: string; /** 本集总时长（秒）；空 = 跟随项目大纲的每集时长 */ durationSec?: number }
export interface ComicOutline { title: string; episodes: OutlineEpisode[] }
export interface NovelChapter { title: string; text: string }
export interface ComicNovel { chapters: NovelChapter[] }

export interface ComicScene {
  id: string;
  location: string;
  time: string;
  action: string;
  dialogue: string;
  characters: string[];
  // 分镜
  shotSize?: string;
  camera?: string;
  shotPrompt?: string;
  imageUrl?: string;
  altImages?: string[];
  imageStatus?: GenStatus;
  imageError?: string;
  // 视频
  videoPrompt?: string;
  videoSeconds?: number;
  videoUrl?: string;
  videoTaskId?: string;
  videoStatus?: GenStatus;
  videoProgress?: number;
  videoError?: string;
  chainFrom?: string;
  videoSource?: 'ai'|'image-motion';
  // 配音
  speechUrl?: string;
  speechStatus?: GenStatus;
  speechError?: string;
  speechSource?:string;
  speechTake?:string;
  speechParts?:{key:string;url:string;voice:string;model:string}[];
}

export interface ComicEpisode { title: string; scenes: ComicScene[] }
export interface ComicScript { title: string; synopsis: string; episodes: ComicEpisode[] }

export interface ComicAsset {
  id: string;
  kind: AssetKind;
  name: string;
  description: string;
  imageUrl?: string;
  status?: GenStatus;
  error?: string;
  /** 用户上传的自定义参考图 */
  custom?: boolean;
  /** 角色配音音色（只对角色生效）；空 = 用项目默认音色 */
  voice?: string;
  /** 角色试听音频（blob，刷新即失效）及其缓存键（模型 | 音色 | 语言 | 名字），键不变就不重新合成 */
  sampleUrl?: string;
  sampleKey?: string;
}

export interface ComicProject {
  id: string;
  kind: ComicKind;
  name: string;
  description: string;
  cover?: string;
  style: ComicStyle;
  ratio: ComicRatio;
  region: ComicRegion;
  spec: ComicSpec;
  /** 视频清晰度（线路列出清晰度档位时才用，见 caps.resolutionOf；老项目由 spec 迁移） */
  resolution?: string;
  /** 每镜固定时长（秒）；空 = 关，各镜用自己的时长 */
  fixedShotSec?: number;
  /** 风格参考图（垫图，≤3 张，压到 768 的 dataURL），只参考画风，不复制内容 */
  styleRefs?: string[];
  schedule: ComicSchedule;
  /** 渠道调度策略（首页「调度」） */
  strategy?: ComicStrategy;
  /** 集时长文案（旧字段 / 模板预设，例：约 3 分钟/集）；新数据以 episodeSeconds 为准 */
  episodeDuration?: string;
  /** 每集时长（秒，分 + 秒 输入）；空 = 自动（按内容） */
  episodeSeconds?: number;
  /** 模板题材标签 */
  genreTag?: string;
  status: "进行中" | "已完成";
  /** 当前阶段 */
  stage: StageKey;
  /** 已确认完成的阶段 */
  done: Partial<Record<StageKey, boolean>>;
  /** 旧版（6 阶段）的步骤号，仅用于迁移 */
  step?: number;
  createdAt: number;
  updatedAt?: number;
  idea: string;
  episodeCount: number;
  sceneCount: number;
  bible?: ComicBible;
  intent?: ComicIntent;
  directions?: ComicDirection[];
  direction?: ComicDirection;
  outline?: ComicOutline;
  novel?: ComicNovel;
  script?: ComicScript;
  assets: ComicAsset[];
  models: { chat?: string; image?: string; video?: string; audio?: string };
  videoChain?: 'parallel' | 'serial';
  videoProduction?: 'ai'|'image-motion';
  videoInput?: 'reference'|'text';
  autoVoice?: boolean;
  finalMovie?: {url:string;source:string;bytes:number;duration:number;createdAt:number;format:'mp4'};
  voice: string;
  log: string[];
}

/** OpenAI 系语音的音色：只在目录还没加载、拿不到配音模型的音色库时兜底（海螺等线路的音色见 lib/voices.voiceLibraryOf） */
export const VOICES = [
  { value: "alloy", label: "Alloy · 中性" }, { value: "nova", label: "Nova · 女声" }, { value: "shimmer", label: "Shimmer · 柔和女声" },
  { value: "echo", label: "Echo · 男声" }, { value: "onyx", label: "Onyx · 低沉男声" }, { value: "fable", label: "Fable · 叙述" },
];

export function allScenes(p: ComicProject): ComicScene[] { return p.script?.episodes.flatMap((e) => e.scenes) ?? []; }

/* ---------- 时长（分 + 秒） ---------- */
/** 估算镜数用的每镜秒数（参考站预设：3 min ≈ 24 镜） */
export const SHOT_SECONDS = 7.5;
/** 每集时长预设（秒） */
export const DURATION_PRESETS: { value: number; label: string }[] = [{ value: 180, label: "短剧（3 min，约 24 镜）" }, { value: 300, label: "中剧（5 min，约 40 镜）" }, { value: 600, label: "长剧（10 min，约 80 镜）" }];
/** 秒 → 「3 分 20 秒」 / 「45 秒」 / 「3 分钟」 */
export function fmtDuration(sec?: number): string {
  if (sec == null || !(sec > 0)) return "";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m && s ? `${m} 分 ${s} 秒` : m ? `${m} 分钟` : `${s} 秒`;
}
/** 「约 3 分钟/集」「2 分 30 秒」「90 秒」 → 秒；解析不出返回 undefined */
export function parseDurationText(t?: string): number | undefined {
  if (!t) return undefined;
  const m = /(\d+(?:\.\d+)?)\s*(?:分钟|分|min)/i.exec(t); const s = /(\d+)\s*(?:秒|s\b)/i.exec(t);
  const total = (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
  return total > 0 ? Math.round(total) : undefined;
}
/** 某集的目标时长：本集总时长优先，其次项目的每集时长 */
export function episodeTargetSec(p: Pick<ComicProject, "episodeSeconds" | "episodeDuration">, ep?: Pick<OutlineEpisode, "durationSec">): number | undefined { return ep?.durationSec ?? p.episodeSeconds ?? parseDurationText(p.episodeDuration); }
/** 目标时长 → 大约镜数 */
export const shotsFor = (sec: number) => Math.max(1, Math.round(sec / SHOT_SECONDS));
/** 已排镜头的合计秒数（未填时长按 5 秒） */
export const scenesSeconds = (scenes: Pick<ComicScene, "videoSeconds">[]) => scenes.reduce((n, s) => n + (s.videoSeconds ?? 5), 0);
/** 集数：优先剧本，其次大纲 */
export function episodeCountOf(p: ComicProject): number { return p.script?.episodes.length ?? p.outline?.episodes.length ?? 0; }

/** 项目完成度（0-100）：按已确认阶段 + 分镜 / 视频产出估算 */
export function projectProgress(p: ComicProject): number {
  if (p.status === "已完成") return 100;
  const path = stagePath(p.kind);
  const doneCount = path.filter((k) => p.done?.[k]).length;
  const scenes = allScenes(p);
  const img = scenes.length ? scenes.filter((s) => s.imageUrl).length / scenes.length : 0;
  const vid = scenes.length ? scenes.filter((s) => s.videoTaskId || s.videoUrl).length / scenes.length : 0;
  return Math.min(99, Math.round((doneCount / path.length) * 70 + img * 15 + vid * 15));
}

/** 替换某个场景（不可变更新） */
export function patchScene(p: ComicProject, sceneId: string, patch: Partial<ComicScene>): ComicProject {
  if (!p.script) return p;
  return { ...p, script: { ...p.script, episodes: p.script.episodes.map((e) => ({ ...e, scenes: e.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)) })) } };
}
function mapScenes(p: ComicProject, fn: (s: ComicScene) => ComicScene): ComicProject {
  if (!p.script) return p;
  return { ...p, script: { ...p.script, episodes: p.script.episodes.map((e) => ({ ...e, scenes: e.scenes.map(fn) })) } };
}

/** 某个阶段是否已有产物 */
export function hasStageData(p: ComicProject, key: StageKey): boolean {
  const scenes = allScenes(p);
  switch (key) {
    case "bible": return !!p.bible && Object.values(p.bible).some(Boolean);
    case "input": return !!p.idea?.trim();
    case "intent": return !!p.intent;
    case "direction": return !!p.direction;
    case "outline": return !!p.outline?.episodes.length;
    case "novel": return !!p.novel?.chapters.some((c) => c.text.trim());
    case "script": return !!p.script;
    case "assets": return p.assets.length > 0;
    case "storyboard": return scenes.some((s) => s.imageUrl || s.shotPrompt);
    case "video": return scenes.some((s) => s.videoUrl || s.videoTaskId);
  }
}

/** 重做某阶段：清空它之后所有阶段的产物与确认状态 */
export function invalidateAfter(p: ComicProject, key: StageKey): ComicProject {
  const path = stagePath(p.kind);
  const later = path.slice(path.indexOf(key) + 1);
  let n: ComicProject = { ...p, done: { ...p.done }, status: "进行中" };
  for (const k of later) {
    n.done[k] = false;
    switch (k) {
      case "intent": n = { ...n, intent: undefined }; break;
      case "direction": n = { ...n, directions: undefined, direction: undefined }; break;
      case "outline": n = { ...n, outline: undefined }; break;
      case "novel": n = { ...n, novel: undefined }; break;
      case "script": n = { ...n, script: undefined }; break;
      case "assets": n = { ...n, assets: n.assets.filter((a) => a.custom) }; break;
      case "storyboard": n = mapScenes(n, (s) => ({ ...s, shotSize: undefined, camera: undefined, shotPrompt: undefined, imageUrl: undefined, altImages: undefined, imageStatus: undefined, imageError: undefined })); break;
      case "video": n = mapScenes(n, (s) => ({ ...s, videoPrompt: undefined, videoUrl: undefined, videoTaskId: undefined, videoStatus: undefined, videoProgress: undefined, videoError: undefined, speechUrl: undefined, speechStatus: undefined, speechError: undefined })); break;
    }
  }
  return n;
}

/** 后续阶段中已有产物的阶段（用于重做时提示） */
export function laterStagesWithData(p: ComicProject, key: StageKey): StageDef[] {
  const path = stagePath(p.kind);
  return path.slice(path.indexOf(key) + 1).filter((k) => hasStageData(p, k)).map((k) => STAGE_DEFS[k]);
}

/** 旧版 6 阶段（创意方向 / 剧本 / 资产 / 分镜 / 视频 / 成片）项目迁移到 9 阶段 */
export function migrateProject(raw: ComicProject): ComicProject {
  const legacySpec = (raw.spec as string) === "标准" ? "默认" : raw.spec;
  const base: ComicProject = { ...raw, kind: raw.kind ?? "premium", spec: legacySpec, style: normalizeStyle(raw.style), region: normalizeRegion(raw.region), assets: raw.assets ?? [], log: raw.log ?? [], done: raw.done ?? {}, episodeCount: raw.episodeCount ?? Math.max(1, episodeCountOf(raw)), sceneCount: raw.sceneCount ?? 4 };
  if (raw.stage && raw.done) return base;
  // 旧 step：0 创意方向→03 方向，1 剧本→06 剧本，2 资产→07，3 分镜→08，4 视频→09，5 成片→09
  const map: StageKey[] = ["direction", "script", "assets", "storyboard", "video", "video"];
  const scenes = allScenes(base);
  const done: Partial<Record<StageKey, boolean>> = {};
  if (base.idea) { done.input = true; if (base.kind === "batch") done.bible = true; }
  if (base.script) { for (const k of ["intent", "direction", "outline", "novel", "script"] as StageKey[]) done[k] = true; }
  if (base.assets.length) done.assets = true;
  if (scenes.length && scenes.every((s) => s.imageUrl)) done.storyboard = true;
  if (base.status === "已完成") done.video = true;
  if (base.kind === "batch" && !base.bible && base.idea) base.bible = { world: base.idea, protagonists: "", style: base.style, template: "" };
  return { ...base, stage: map[raw.step ?? 0] ?? stagePath(base.kind)[0], done };
}

/** 刷新后 blob URL 失效：把视频 / 配音标记为需重新生成（视频保留 taskId 以便恢复）；
 *  上次停在「生成中」的请求结果已经丢了 → 标成失败并说明原因，否则按钮一直禁用、永远转圈 */
export function normalizeAfterReload(p: ComicProject): ComicProject {
  const isBlob = (u?: string) => !!u && u.startsWith("blob:");
  const cut = "生成被中断（页面刷新或关闭），请重试";
  const n = mapScenes(p, (s) => {
    const x: ComicScene = { ...s };
    if (isBlob(s.videoUrl)) { x.videoUrl = undefined; x.videoStatus = s.videoTaskId ? "stale" : "idle"; x.videoProgress = 0; }
    if (s.videoStatus === "running") { x.videoUrl = undefined; x.videoProgress = 0; if (s.videoTaskId) x.videoStatus = "stale"; else { x.videoStatus = "error"; x.videoError = cut; } }
    if (isBlob(s.speechUrl)) { x.speechUrl = undefined; x.speechStatus = "stale"; }
    if (s.speechStatus === "running") { x.speechUrl = undefined; x.speechStatus = "error"; x.speechError = cut; }
    if (s.imageStatus === "running") { x.imageStatus = "error"; x.imageError = cut; }
    return x;
  });
  return { ...n, assets: n.assets.map((a) => { const x = a.status === "running" ? { ...a, status: "error" as const, error: cut } : a; return isBlob(x.sampleUrl) ? { ...x, sampleUrl: undefined, sampleKey: undefined } : x; }) };
}
