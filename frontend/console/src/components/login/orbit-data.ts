/** 登录页「模型地球」共享数据与时间轴：DOM 文案（逐字打字）与 WebGL 场景（图标飞入聚光位）共用同一时钟 */

export const WORDS = [
  { verb: "生成图片", promise: "从一句想象，到一眼惊艳。", detail: "角色、商品、场景，让灵感有形。" },
  { verb: "制作视频", promise: "让静止的画面，开始讲故事。", detail: "从参考素材，到镜头与成片。" },
  { verb: "一键漫剧", promise: "让好故事，不止停在文字里。", detail: "剧本、角色、分镜，连成一部漫剧。" },
  { verb: "无限画布", promise: "灵感不必分散，创作不止一条路。", detail: "把文字、图像与视频连在一起。" },
  { verb: "构建智能体", promise: "让你的经验，成为可复用的能力。", detail: "定义角色、指令与技能，交给智能体。" },
];

export type OrbitModel = { name: string; icon: string; eb: string; line: string };
// ⚠️ 相对造物源码唯一的改动：造物部署在站点根路径，图标写死 `/icons/providers/...` 就行；
//    本子应用挂在 `/console/` 下（vite base），根绝对路径会 404。
//    Vite 的 baseMiddleware 会先把 `/console/` 剥掉再匹配 public 目录，
//    所以 **必须** 带 base 前缀 —— 直接拼字面量 `/console/` 会让 dev 与 prod 行为不一致，
//    用 BASE_URL 才是两端都对。见 frontend/console/README.md「静态资源」。
const BASE = import.meta.env.BASE_URL;
const S = `${BASE}icons/providers/sculpted/`; const E = `${BASE}icons/providers/external/`;
export const ORBIT_MODELS: OrbitModel[] = [
  { name: "GM-3.8 Flash", icon: `${S}gemini.svg`, eb: "对话 / 模型", line: "GM-3.8 Flash 多模态模型，最新一代 Flash，速度更快、推理更强，适合高频对话" },
  { name: "Seedance 2.5 · 官方直连", icon: `${E}doubao.svg`, eb: "视频 / 模型", line: "字节跳动新一代视频生成模型，画质与动态表现全面升级" },
  { name: "CL Fable 5.1", icon: `${S}claude.svg`, eb: "对话 / 模型", line: "CL 5 家族最新旗舰（Mythos 级）5.1 版，复杂编码、长程 Agent 任务首选" },
  { name: "MJ", icon: `${S}midjourney.svg`, eb: "图像 / 模型", line: "MJ 是全球知名的 AI 图像生成模型，以极高的艺术性和美感著称" },
  { name: "DeepSeek V4 Flash", icon: `${E}deepseek.svg`, eb: "对话 / 模型", line: "DeepSeek V4 性价比款，响应快、成本低，适合日常对话与批量文本任务" },
  { name: "Kling 3.0", icon: `${E}kling.svg`, eb: "视频 / 模型", line: "可灵视频生成模型，运动自然、镜头语言丰富，支持图生视频" },
  { name: "GT Image 2.5 Flare 快速版", icon: `${S}openai.svg`, eb: "图像 / 模型", line: "GT 系列 2.5 代图像模型快速版，生成速度快、成本低，支持文生图与图生图" },
  { name: "Suno v5", icon: `${E}suno.svg`, eb: "语音 / 模型", line: "文本到完整歌曲，人声、编曲与歌词一次生成" },
  { name: "通义千问 3.8-Max", icon: `${E}qwen.svg`, eb: "对话 / 模型", line: "通义千问旗舰对话模型，中文理解与长文本处理出色" },
  { name: "MiniMax H3", icon: `${E}minimax.svg`, eb: "视频 / 模型", line: "海螺视频模型，人物表演与物理细节表现稳定" },
  { name: "Nano Banana Pro", icon: `${S}banana.svg`, eb: "图像 / 模型", line: "GM 系列图像模型，角色一致性与多图参考表现出色，适合商品与人像" },
  { name: "CL Opus 5", icon: `${S}claude.svg`, eb: "对话 / 模型", line: "CL 5 家族旗舰，深度思考与长上下文，适合复杂推理与代码" },
  { name: "Vidu Q3", icon: `${E}vidu-icon.svg`, eb: "视频 / 模型", line: "Vidu 视频模型，主体一致性强，适合角色与商品短片" },
  { name: "Flux 2 Pro", icon: `${S}flux.svg`, eb: "图像 / 模型", line: "写实质感与排版文字表现优秀的图像模型，适合海报与电商主图" },
  { name: "GLM-5.3 Flash", icon: `${E}zai.svg`, eb: "对话 / 模型", line: "GLM 系列快速对话模型，性价比高、响应迅速" },
  { name: "PixVerse C1", icon: `${E}PixVerse.svg`, eb: "视频 / 模型", line: "PixVerse 视频生成模型，风格化特效丰富，出片速度快" },
  { name: "Grok 4", icon: `${S}grok.svg`, eb: "对话 / 模型", line: "实时信息与推理能力突出的旗舰对话模型" },
  { name: "即梦 4.0", icon: `${E}jimeng.svg`, eb: "图像 / 模型", line: "中文提示词理解好，海报与插画表现出色的图像模型" },
  { name: "Kimi K3", icon: `${E}kimi.svg`, eb: "对话 / 模型", line: "长上下文对话模型，擅长长文档阅读与总结" },
  { name: "Sora 2", icon: `${S}sora.svg`, eb: "视频 / 模型", line: "长镜头叙事与物理一致性出色的视频生成模型" },
];

/** 时间轴（与原站一致）：age 以 1.5 倍真实秒推进，每个动词停留 HOLD age ≈ 5.6s */
export const AGE_RATE = 1.5;
export const HOLD = 8.4;
export const CYCLE_S = HOLD / AGE_RATE;
const STEP = 0.028; const ERASE_STEP = 0.012;
export const T = { verb: 0.15, line1: 0.3, line2: 0.55, heroErase: HOLD - 0.55 };

export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 聚光位：launch 出发 → arrive 停靠（开始打字）→ ret 开始返航并擦字 → end 回到球面 */
export function sideTiming(side: number) {
  const launch = 0.55 + 0.14 * side;
  return { launch, arrive: launch + 0.72, ret: HOLD - 1.35 + 0.1 * side, end: HOLD - 0.16 };
}
export const flightAmount = (age: number, side: number) => { const s = sideTiming(side); return smooth(s.launch, s.arrive, age) * (1 - smooth(s.ret, s.end, age)); };
export const focusFor = (cycle: number): [number, number] => { const n = ORBIT_MODELS.length; return [(cycle * 3) % n, (cycle * 3 + 8) % n]; };

/** 已显示字符数：从 start 起每 STEP 出一个字，erase 之后每 ERASE_STEP 收一个字 */
export function typedCount(n: number, age: number, start: number, erase: number) {
  return Math.max(0, Math.min(n, Math.floor((age - start) / STEP), n - Math.ceil(Math.max(0, age - erase) / ERASE_STEP)));
}

export type Box = { l: number; t: number; r: number; b: number };
/** 拖拽状态：globe.tsx 的指针事件写入增量（px/py），orbit-scene 每帧消费并估计角速度（vyaw/vpitch 用于松手惯性） */
export type OrbitDrag = { yaw: number; pitch: number; vyaw: number; vpitch: number; grabbing: boolean; px: number; py: number };
/** 作品展映（3D 模式）：auth-stage 写入当前状态，orbit-scene 每帧消费——
 *  active 时地球滑出画面、视频弧面卡滑入并接管舞台 */
export type OrbitWork = { active: boolean; index: number };
/** DOM ↔ 场景的共享状态（可变对象，不触发渲染） */
export type OrbitBus = { age: number; cycle: number; focus: [number, number]; reduced: boolean; quiet: Box | null; cards: (Box | null)[]; docks: (Box | null)[]; drag: OrbitDrag; hover: { x: number; y: number; tx: number; ty: number }; work: OrbitWork };
export const createBus = (): OrbitBus => ({ age: 0, cycle: 0, focus: focusFor(0), reduced: false, quiet: null, cards: [null, null], docks: [null, null], drag: { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, grabbing: false, px: 0, py: 0 }, hover: { x: 0, y: 0, tx: 0, ty: 0 }, work: { active: false, index: 0 } });
