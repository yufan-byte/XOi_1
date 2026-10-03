// aicost 线路能力：把上游「模型广场描述 + 接口文档」翻译成前台能直接用的模式 / 素材上限 / 时长，以及发给上游的字段名。
//
// 为什么需要它：aicost-video 插件是**原样透传**请求体的（只改 model），所以前台发什么字段，上游就收什么字段。
// 而前台原先用的是 taozi 那套（input_reference / end_image_url / mode / size），aicost 的 Seedance 文档里
// 根本没有这些字段——首帧图会被静默忽略，出一条纯文生的片还照常扣费。文档依据（藏在 aicost 前端包里）：
//   · Seedance 统一文档：model/prompt/seconds/aspect_ratio/resolution + image(s)/video(s)/audio(s)；
//     「不同模型的差异体现在分辨率、时长和参考素材类型上」「传入其他值会返回参数错误」
//   · Sora 933 文档：image_url / reference_image_urls / reference_video(s) / audio_url(s) / video_config.reference_mode
//     (start_frame | start_end)，时长只有 10 / 15，分辨率 720p，用音频必须至少 1 张图，首帧/首尾帧不能带参考视频
//   · Grok 1.5 文档：grok-imagine-video-1.5 必须且只能传 1 张图（字段 image），不支持纯文生，1-15 秒
// 每条线路的具体上限只写在模型广场的描述里（「支持9图片3视频3音频」「只能30s」「满血933」…），所以从描述解析；
// 解析不出来的一律取保守值——宁可少给一个选项，也不让用户点了报 400 或白扣钱。
import type { ParamField } from "@/lib/models";

export type AicostFamily = "seedance" | "sora-v3" | "grok" | "minimax";
export interface AicostCaps {
  family: AicostFamily;
  /** 是否支持纯文生（不传任何素材） */
  text: boolean;
  images: number; videos: number; audios: number;
  /** 首帧 / 首尾帧是上游有明确写法的才给（目前只有 Sora 933；Grok 只有「单图」= 首帧） */
  firstFrame: boolean; firstLast: boolean;
  durations: string[];
  ratios: string[];
  resolution?: string;
}

/** 站内模型 id → aicost 家族。taozi 自己的同名家族 id 用连字符数字（seedance-2-0-…、sora-2-official、grok-imagine-1.5），
 *  aicost 线路用点号（seedance-2.0-… / seedance2.5-…），据此区分；不是 aicost 线路返回 undefined。 */
export function aicostFamilyOf(id: string): AicostFamily | undefined {
  const s = id.toLowerCase();
  if (/^sora-v3-/.test(s)) return "sora-v3";
  if (/^grok-imagine-video-1\.5/.test(s)) return "grok";
  if (/^minimax-h3-\d/.test(s)) return "minimax";
  if (/^seedance-?\d\.\d/.test(s) || /^sora-\d\.\d/.test(s)) return "seedance"; // sora-2.x-guanzhuan 实为 Seedance 官转（见其描述）
  return undefined;
}

const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
const num = (m: RegExpMatchArray | null) => (m ? Number(m[1]) : undefined);

/** 连续范围展开成可选档位：≤15 秒逐秒给；更长的按常用档给，避免下拉里塞 27 个选项 */
function expand(min: number, max: number): number[] {
  const out: number[] = [];
  for (let s = min; s <= Math.min(max, 15); s++) out.push(s);
  for (const s of [20, 25, 30]) if (s > 15 && s >= min && s <= max) out.push(s);
  if (max > 15 && !out.includes(max)) out.push(max);
  return uniq(out);
}

/** 从描述里解析时长。优先级：范围 > 列举 > 单值；「不支持 5、10.15 秒」这类排除项先摘掉 */
function parseDurations(desc: string): number[] | undefined {
  let d = desc; const banned = new Set<number>();
  d = d.replace(/不支持\s*((?:\d{1,2}\s*[、.,，/]\s*)*\d{1,2})\s*(?:秒|s)/gi, (_, list: string) => { for (const x of list.split(/[、.,，/]/)) banned.add(Number(x)); return " "; });
  const keep = (xs: number[]) => { const r = uniq(xs).filter((x) => x >= 1 && x <= 60 && !banned.has(x)); return r.length ? r : undefined; };
  const range = d.match(/(\d{1,2})\s*[-–—~到]\s*(\d{1,2})\s*(?:秒|s)/i);
  if (range && Number(range[1]) < Number(range[2])) return keep(expand(Number(range[1]), Number(range[2])));
  const list = d.match(/((?:\d{1,2}\s*[\/、]\s*)+\d{1,2})\s*(?:秒|s)/i);
  if (list) return keep(list[1].split(/[\/、]/).map(Number));
  // 「支持10秒，15秒」「支持10秒和15秒」「只能30s」「一条30秒」：逐个收集紧跟「秒 / s」的 1~2 位数
  const singles = [...d.matchAll(/(?<![\d.])(\d{1,2})\s*(?:秒|s(?![a-z]))(?!\s*(?:之内|以内|内|左右))/gi)].map((m) => Number(m[1]));
  return keep(singles);
}

export function aicostCaps(id: string, upstream: string, description: string, card?: Record<string, ParamField>): AicostCaps | undefined {
  const family = aicostFamilyOf(id) ?? aicostFamilyOf(upstream); if (!family) return undefined;
  const d = description || ""; const cardDur = (card?.duration?.enum ?? card?.duration?.options?.map((o) => o.value))?.map(String);
  const cardRatios = (card?.aspect_ratio?.enum ?? card?.aspect_ratio?.options?.map((o) => o.value))?.map(String).filter((r) => /^\d+:\d+$/.test(r));
  const cardModes = (card?.mode?.enum ?? card?.mode?.options?.map((o) => o.value))?.map(String);
  // 卡片带了清晰度选项（任务式上游的线路一条可选多个清晰度）：多个就交给卡片里的下拉，只有一个才锁定
  const cardRes = (card?.resolution?.enum ?? card?.resolution?.options?.map((o) => o.value))?.map(String);
  const resolution = cardRes?.length ? (cardRes.length === 1 ? cardRes[0].replace(/p$/i, "") : undefined)
    : (upstream.match(/(\d{3,4})p/i) ?? d.match(/(?<!\d)(\d{3,4})\s*p(?![a-z])/i))?.[1];
  // 素材上限：只认标了 authoritative 的卡片字段（同步任务按上游自己的参数表生成）。老的 aicost 卡片里也有
  // max_items，但那是照 taozi 模板抄的（多为 9/3/3），与线路真实上限对不上，这类仍按描述解析。
  const authoritative = (k: string) => (card?.[k] as { authoritative?: boolean } | undefined)?.authoritative === true;
  const fromUpstream = authoritative("images") || authoritative("videos") || authoritative("audios");
  const cardMax = (k: string) => (fromUpstream ? (authoritative(k) ? Number((card?.[k] as { max_items?: number }).max_items) || 0 : 0) : undefined);

  if (family === "sora-v3") return { family, text: true, images: 9, videos: 3, audios: 3, firstFrame: true, firstLast: true, durations: ["10", "15"], ratios: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"], resolution: "720p" };
  if (family === "grok") return { family, text: false, images: 1, videos: 0, audios: 0, firstFrame: true, firstLast: false, durations: ["4", "5", "6", "8", "10", "12", "15"], ratios: ["16:9", "9:16", "1:1", "2:3", "3:2"], resolution: undefined };

  // Seedance / MiniMax：数量写法五花八门——「9图片3视频3音频」「30个图，10个视频」「10图10音10视频」「只支持9图」
  // 行话「933 / 900」= 图·视频·音频 的上限（满血933 = 9 图 3 视频 3 音频；900 = 只收 9 图）
  const code = (d + " " + upstream).match(/(?<!\d)9([03])([03])(?!\d)/);
  const images = cardMax("images") ?? num(d.match(/(\d{1,2})\s*(?:张|个)?\s*(?:参考)?图/)) ?? (code ? 9 : 9);
  const noVideo = /不支持(?:参考)?视频|(?<!\d)0\s*视频/.test(d); // 「10视频」里的 0 不算
  const videos = cardMax("videos") ?? (noVideo ? 0 : num(d.match(/(\d{1,2})\s*(?:个|段)?\s*(?:参考)?视频/)) ?? (code && code[1] === "3" && code[2] === "3" ? 3 : /(?<!好像)可以(?:的)?参考视频/.test(d) ? 1 : 0));
  const noAudio = /不支持(?:参考)?音频|(?<!\d)0\s*音频/.test(d);
  const audios = cardMax("audios") ?? (noAudio ? 0 : num(d.match(/(\d{1,2})\s*(?:个|段)?\s*(?:参考)?音/)) ?? (code && code[1] === "3" && code[2] === "3" ? 3 : 0));
  const parsed = parseDurations(d)?.map(String);
  // 描述里没写时长：有人工卡片就沿用卡片；都没有时按文档「常见时长 4-15 秒」
  const durations = parsed ?? cardDur ?? expand(4, 15).map(String);
  // 卡片里人工去掉了文生（如 seedance2.5-480p-ac）就尊重它；否则 Seedance 线路素材都是可选的
  const text = cardModes ? cardModes.includes("text-to-video") : true;
  return { family, text, images, videos, audios, firstFrame: false, firstLast: false, durations, ratios: cardRatios?.length ? cardRatios : ["9:16", "16:9", "1:1"], resolution: resolution ? `${resolution}p` : undefined };
}

const RATIO_LABEL: Record<string, string> = { "9:16": "竖屏 9:16", "16:9": "横屏 16:9", "1:1": "方形 1:1", "4:3": "横屏 4:3", "3:4": "竖屏 3:4", "21:9": "超宽 21:9", "2:3": "竖屏 2:3", "3:2": "横屏 3:2" };

/** 能力 → 视频页能直接渲染的 param_schema（与 logical-models.json 的卡片同构）。卡片里与能力无关的字段（生成数量等）保留 */
export function aicostSchema(c: AicostCaps, card: Record<string, ParamField> = {}): Record<string, ParamField> {
  const modes: [string, string, string][] = [];
  if (c.text) modes.push(["text-to-video", "文生视频", "只写描述，无需上传"]);
  if (c.firstFrame) modes.push(["first-frame", "首帧", "一张图定起始画面"]);
  if (c.firstLast) modes.push(["first-last", "首尾帧", "首 + 尾两张图控制过渡"]);
  if (c.family !== "grok" && c.images + c.videos + c.audios > 0) modes.push(["reference", "全能参考", "参考图 / 视频 / 音频融合生成"]);
  const def = modes[0][0];
  const per = (ref: number, ff = 0, fl = 0) => ({ "text-to-video": 0, "first-frame": ff, "first-last": fl, reference: ref });
  const upload = (key: string, zh: string, max: number, byMode: Record<string, number>, extra: Partial<ParamField> = {}): ParamField =>
    ({ ...(card[key] ?? {}), type: "upload", label: { zh }, max_items: max, max_items_by_mode: byMode, description: `${zh}（该线路最多 ${max} 个）`, ...extra } as unknown as ParamField);
  const durDefault = c.durations.includes("5") ? "5" : c.durations[0];
  const out: Record<string, ParamField> = {
    ...card,
    mode: { type: "enum", label: { zh: "生成模式" }, default: def, enum: modes.map((m) => m[0]), options: modes.map(([value, label, description]) => ({ value, label, description, is_default: value === def })) } as unknown as ParamField,
    duration: { ...(card.duration ?? {}), type: "enum", label: { zh: "时长" }, default: durDefault, enum: c.durations, options: c.durations.map((v) => ({ value: v, label: `${v}秒`, is_default: v === durDefault })) } as unknown as ParamField,
    aspect_ratio: { ...(card.aspect_ratio ?? {}), type: "enum", label: { zh: "视频比例" }, default: c.ratios[0], enum: c.ratios, options: c.ratios.map((v, i) => ({ value: v, label: RATIO_LABEL[v] ?? v, is_default: i === 0 })) } as unknown as ParamField,
    count: card.count ?? ({ type: "int", label: { zh: "生成数量" }, default: 1, min: 1, max: 50 } as unknown as ParamField),
  };
  if (c.resolution) out.resolution = { ...(card.resolution ?? {}), type: "enum", label: { zh: "清晰度" }, default: c.resolution, enum: [c.resolution], options: [{ value: c.resolution, label: c.resolution.toUpperCase(), is_default: true }] } as unknown as ParamField;
  else if (!card.resolution) delete out.resolution;
  delete out.images; delete out.videos; delete out.audios;
  if (c.images > 0) out.images = upload("images", "参考图片", c.images, per(c.images, c.firstFrame ? 1 : 0, c.firstLast ? 2 : 0));
  if (c.videos > 0) out.videos = upload("videos", "参考视频", c.videos, per(c.videos));
  if (c.audios > 0) out.audios = upload("audios", "参考音频", c.audios, per(c.audios));
  // 这些是 taozi 线路才有的开关，aicost 文档里没有对应字段，发过去只会被忽略或触发参数错误
  for (const k of ["return_last_frame", "generate_audio", "mute", "prompt_optimizer", "seed", "watermark"]) delete out[k];
  return out;
}

export function aicostHint(c: AicostCaps): string {
  const parts = [c.images && `${c.images} 张参考图`, c.videos && `${c.videos} 段参考视频`, c.audios && `${c.audios} 段参考音频`].filter(Boolean);
  if (c.family === "grok") return "上传 1 张图片作为起始画面，再写描述；该线路不支持纯文字生成。";
  // 只有几档时逐个列出（「10 / 15 秒」），写成「10~15 秒」会让人以为 12 秒也行
  const dur = c.durations.length === 1 ? `固定 ${c.durations[0]} 秒` : c.durations.length <= 4 ? `${c.durations.join(" / ")} 秒` : `${c.durations[0]}~${c.durations[c.durations.length - 1]} 秒`;
  return `${c.text ? "只写描述即可生成；" : ""}${parts.length ? `也可上传最多 ${parts.join("、")}，` : ""}时长 ${dur}。`;
}

export interface GenericVideoInput { prompt: string; seconds: number | string; ratio?: string; resolution?: string; mode?: string; images?: string[]; videos?: string[]; audios?: string[] }

/** 发给上游前的校验：返回错误文案则不发请求（上游对这些情况要么 400，要么静默忽略素材照常扣费） */
export function aicostValidate(c: AicostCaps, i: GenericVideoInput): string | undefined {
  const img = i.images?.length ?? 0, vid = i.videos?.length ?? 0, aud = i.audios?.length ?? 0;
  if (!c.text && img + vid + aud === 0) return c.family === "grok" ? "这条线路必须上传 1 张图片，不支持纯文字生成。" : "这条线路需要至少上传一个参考素材。";
  if (img > c.images) return `这条线路最多 ${c.images} 张参考图，当前 ${img} 张。`;
  if (vid > c.videos) return c.videos ? `这条线路最多 ${c.videos} 段参考视频，当前 ${vid} 段。` : "这条线路不支持参考视频，请移除后再生成。";
  if (aud > c.audios) return c.audios ? `这条线路最多 ${c.audios} 段参考音频，当前 ${aud} 段。` : "这条线路不支持参考音频，请移除后再生成。";
  if (!c.durations.includes(String(i.seconds))) return `这条线路只支持 ${c.durations.join(" / ")} 秒。`;
  if (c.family === "sora-v3") {
    if (i.mode === "first-frame" && img !== 1) return "首帧模式必须正好上传 1 张图。";
    if (i.mode === "first-last" && img !== 2) return "首尾帧模式必须正好上传 2 张图。";
    if ((i.mode === "first-frame" || i.mode === "first-last") && vid) return "首帧 / 首尾帧模式不能同时使用参考视频。";
    if (aud && !img) return "使用参考音频时必须至少上传 1 张参考图。";
  }
  return undefined;
}

/** 通用输入 → 该家族文档里的字段名。只发文档列出的字段：不发 size / mode / input_reference / end_image_url */
export function aicostBody(c: AicostCaps, model: string, i: GenericVideoInput): Record<string, unknown> {
  const images = i.images ?? [], videos = i.videos ?? [], audios = i.audios ?? [];
  const body: Record<string, unknown> = { model, prompt: i.prompt };
  if (i.ratio && c.ratios.includes(i.ratio)) body.aspect_ratio = i.ratio; else body.aspect_ratio = c.ratios[0];
  const res = c.resolution ?? i.resolution; if (res) body.resolution = res;
  if (c.family === "sora-v3") {
    body.seconds = String(i.seconds);
    if (i.mode === "first-frame") { body.image_url = images[0]; body.video_config = { reference_mode: "start_frame" }; }
    else if (i.mode === "first-last") { body.reference_image_urls = images.slice(0, 2); body.video_config = { reference_mode: "start_end" }; }
    else { if (images[0]) body.image_url = images[0]; if (images.length > 1) body.reference_image_urls = images.slice(1); if (videos.length) body.reference_videos = videos; if (audios.length) body.audio_urls = audios; }
    return body;
  }
  if (c.family === "grok") { body.seconds = String(i.seconds); body.image = images[0]; return body; }
  body.seconds = Number(i.seconds);
  if (images.length) body.images = images; if (videos.length) body.videos = videos; if (audios.length) body.audios = audios;
  return body;
}
