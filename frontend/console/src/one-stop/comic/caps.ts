// 漫剧按所选线路取参数：每镜时长档 / 清晰度 / 比例 / 参考图张数，以及台词按角色拆行配音。
// 全是纯函数（不碰网络、不碰 DOM），单测见 caps.test.ts。
import type { CatalogModel } from "@/lib/models";
import { CCDAN_MAX_REFS, isCcdanImage } from "../adapters/image-caps";
import { videoBillingValues } from "../adapters/video-billing";
import { mfVideoCaps, snapSeconds, type MfVideoCaps } from "../multiframe/video-caps";

/** 线路没写时长档位时沿用的老选项 */
export const DEFAULT_SHOT_DURATIONS = [4, 5, 8, 10];
export const durationsOf = (caps?: MfVideoCaps) => (caps?.durations.length ? caps.durations : DEFAULT_SHOT_DURATIONS);

/** 一镜实际提交的秒数：项目设了「每镜固定 N 秒」就用它，否则用镜头自己的时长；最后对齐到线路档位（不在档位里上游直接 400） */
export function shotSeconds(p: { fixedShotSec?: number }, s: { videoSeconds?: number }, caps?: MfVideoCaps): number {
  return snapSeconds(p.fixedShotSec ?? s.videoSeconds ?? 5, durationsOf(caps));
}

/** 清晰度对应的老「制作规格」：设定抽屉选清晰度时两者一起写 */
export const specOfResolution = (r: string): "高清" | "默认" => (/1080|2k|4k/i.test(r) ? "高清" : "默认");

/** 视频清晰度：线路列了清晰度才有值。老项目只有「默认 / 高清」，按 默认→720p、高清→1080p 迁移，做不到就取线路的第一档。
 *  抽屉里选清晰度会同时写 spec；之后若在「输入」那一步又改了 默认 / 高清，两者就对不上了——这时以后改的 spec 为准，
 *  否则那里的开关形同虚设（界面显示高清，实际照发 720p） */
export function resolutionOf(p: { resolution?: string; spec?: string }, caps?: MfVideoCaps): string | undefined {
  const list = caps?.resolutions;
  if (!list?.length) return undefined;
  if (p.resolution && list.includes(p.resolution) && (!p.spec || specOfResolution(p.resolution) === p.spec)) return p.resolution;
  const legacy = p.spec === "高清" ? "1080p" : "720p";
  const hit = list.find((r) => r.toLowerCase() === legacy); if (hit) return hit;
  // 「高清」做不到 1080p 就取线路最高的一档：以前取第一档，480p / 720p 两档的线路（Seedance line1、Grok）选高清反而出 480p
  return p.spec === "高清" ? [...list].sort((a, b) => resRank(b) - resRank(a))[0] : list[0];
}
/** 清晰度的高低：480p → 480，2k → 2000；认不出的排最低 */
const resRank = (r: string) => { const m = /^(\d+)\s*(p|k)$/i.exec(r.trim()); return m ? Number(m[1]) * (m[2].toLowerCase() === "k" ? 1000 : 1) : 0; };

/** 视频报价要喂给 unitCost 的计费参数：和视频页 / estimate.videoCost 同一套（videoBillingValues）——按实际会发出去的清晰度取档，
 *  漫剧不发参考视频，ref_video 记 false。以前清晰度为空时（seedance2.x-line1 线路列表取不到）报价落到 480p 的 default 档 */
export const videoBillParams = (p: { resolution?: string; spec?: string }, caps?: MfVideoCaps): Record<string, string> => videoBillingValues({}, { resolution: resolutionOf(p, caps) });

/** 画幅：线路列了比例而项目画幅不在其中时取线路第一项（发它不认的比例同样会被拒） */
export const aspectOf = (ratio: string, caps?: MfVideoCaps) => (caps?.ratios.length && !caps.ratios.includes(ratio) ? caps.ratios[0] : ratio);

/** 图片模型最多收几张参考图：undefined = 目录还没加载（不确定，按老逻辑走）；0 = 不收参考图。
 *  判断与 image/page.tsx 的 refCap 一致：卡片里有 images / image 字段，或者压根没有卡片的老线路 */
export function imageRefCap(m?: CatalogModel): number | undefined {
  if (!m) return undefined;
  if(/^agnes-image/i.test(m.id || ''))return 0;
  const ps = m.paramSchema ?? {}; const f = ps.images ?? ps.image;
  // ccdan 的 GPT 生图走它的图编辑接口，固定 16 张（卡片写的 20 是 taozi 线路的上限）
  if (isCcdanImage(m)) return CCDAN_MAX_REFS;
  if (f) return f.max_items ?? 4;
  return Object.keys(ps).length ? 0 : 4;
}

/** 视频线路把关键帧当参考图发时，最多能带几张图（含关键帧本身）；首帧线路 / 不认图的线路返回 0，保持只发首帧 */
export function videoRefLimit(m?: CatalogModel): number {
  if (!m || mfVideoCaps(m).frame !== "reference") return 0;
  return m.aicost ? m.aicost.images : (m.paramSchema?.images?.max_items ?? 4);
}

/** 资产名与剧本里的人名 / 地名互相包含即算同一个（剧本写「林晚」，资产叫「林晚（少女）」也要认出来） */
export const sameName = (a: string, b: string) => !!a && !!b && (a.includes(b) || b.includes(a));

/* ---------- 台词按角色配音 ---------- */
export interface DialogueLine { speaker?: string; text: string }
/** 「角色：台词」一行一句；没有角色名的行（旁白）speaker 为空。角色名里的（冷笑）这类舞台提示去掉 */
export function parseDialogue(text: string): DialogueLine[] {
  const out: DialogueLine[] = [];
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const m = /^([^：:]{1,12})[：:](.*)$/.exec(line);
    if (!m) { out.push({ text: line }); continue; }
    const speaker = m[1].replace(/[（(][^）)]*[）)]/g, "").trim(); const said = m[2].trim();
    if (said) out.push({ speaker: speaker || undefined, text: said });
  }
  return out;
}

/** 说话人对应的角色音色：只看角色类资产，且该资产设过音色 */
export function speakerVoice(assets: { kind: string; name: string; voice?: string }[], speaker?: string): string | undefined {
  if (!speaker) return undefined;
  return assets.find((a) => a.kind === "character" && a.voice && sameName(a.name, speaker))?.voice;
}

/** 相邻同音色的台词并成一次合成：少调一次接口（按次计费的线路省钱），听感一样 */
export function groupByVoice(lines: { voice: string; text: string }[]): { voice: string; text: string }[] {
  const out: { voice: string; text: string }[] = [];
  for (const l of lines) { const last = out[out.length - 1]; if (last && last.voice === l.voice) last.text += `\n${l.text}`; else out.push({ ...l }); }
  return out;
}

/** 多段配音按顺序首尾相接，段间留一点停顿 */
export function joinPcm(chunks: Float32Array[], sampleRate: number, gapSec = 0.25): Float32Array {
  const gap = Math.round(sampleRate * gapSec);
  const total = chunks.reduce((n, c) => n + c.length, 0) + gap * Math.max(0, chunks.length - 1);
  const out = new Float32Array(total); let o = 0;
  chunks.forEach((c, i) => { if (i) o += gap; out.set(c, o); o += c.length; });
  return out;
}

/** 角色试听的短句：按剧集语言念（regionLang(p.region).lang） */
const SAMPLE: Record<string, (n: string) => string> = {
  中文: (n) => `你好，我是${n}。`, 英文: (n) => `Hi, I'm ${n}.`, 日语: (n) => `こんにちは、${n}です。`, 韩语: (n) => `안녕하세요, 저는 ${n}입니다.`,
  西班牙语: (n) => `Hola, soy ${n}.`, 法语: (n) => `Bonjour, je suis ${n}.`, 德语: (n) => `Hallo, ich bin ${n}.`, 俄语: (n) => `Привет, я ${n}.`,
  印尼语: (n) => `Halo, saya ${n}.`, 葡萄牙语: (n) => `Olá, eu sou ${n}.`,
};
export const sampleLine = (lang: string, name: string) => (SAMPLE[lang] ?? SAMPLE.中文)(name.trim() || "这个角色");
/** 试听缓存键：模型、音色、语言、名字都没变就不再重新合成（试听也要扣一次语音合成的钱） */
export const sampleKey = (model: string, voice: string, region: string, name: string) => [model, voice, region, name.trim()].join("|");
