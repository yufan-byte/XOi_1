// 素材 AI 分析：从每条素材抽几帧缩略画面交给视觉模型，拿回类别 / 一句话摘要 / 画质分 / 高光区间。
// 剪辑方案（plan.ts）据此挑片段，不再只看文件名和时长。
// 抽帧在浏览器里做（素材本来就只在用户本机），只把 384px 的小图发给模型，费用和体积都可控。
import { chat, parseJson, type Msg } from "@/lib/llm";
import type { CatalogModel } from "@/lib/models";
import { CATEGORIES, type AssetAnalysis, type ClipAsset, type Highlight } from "./types";

const LONG_EDGE = 384;
/** 粗估：一张 384px 的缩略图约 300 token，再加约 200 token 的说明文字；输出约 300 token，按输入价 3 倍折算（和对话页估价一致的保守口径） */
const TOKENS_PER_FRAME = 300, TOKENS_TEXT = 200, TOKENS_OUT = 300, OUT_WEIGHT = 3;

/** 视频抽帧时间点：在 0.5s 到 duration−0.5s 之间均匀取 min(8, ceil(duration/2)) 帧；太短的视频取正中一帧；照片 / 时长未知的只取一帧（时间 0） */
export function frameTimes(duration: number): number[] {
  if (!(duration > 0)) return [0];
  const n = Math.min(8, Math.max(1, Math.ceil(duration / 2)));
  const lo = 0.5, hi = duration - 0.5;
  if (n === 1 || hi <= lo) return [+(duration / 2).toFixed(2)];
  return Array.from({ length: n }, (_, k) => +(lo + ((hi - lo) * k) / (n - 1)).toFixed(2));
}
export const frameCount = (a: Pick<ClipAsset, "kind" | "duration">) => (a.kind === "video" ? frameTimes(a.duration).length : 1);
/** 能分析的素材：视频 / 照片，文件还在浏览器里。音频不看画面，不分析 */
export const analyzable = (a: ClipAsset) => a.kind !== "audio" && !a.missing && !!a.url;

/** 预估费用（元）。按 token 计费的线路按帧数折算；按次计费的每条素材算一次；其它计费方式（按秒 / 按字）或没有标价 → null，界面据此禁用「开始分析」 */
export function estimateCost(model: Pick<CatalogModel, "priceUsd" | "billingUnit"> | undefined, frames: number[]): number | null {
  if (!model || !Number.isFinite(model.priceUsd) || model.priceUsd <= 0 || !frames.length) return null;
  if (model.billingUnit === "per_request") return model.priceUsd * frames.length;
  if (model.billingUnit !== "per_1m_tokens") return null;
  const tokens = frames.reduce((s, n) => s + n * TOKENS_PER_FRAME + TOKENS_TEXT + TOKENS_OUT * OUT_WEIGHT, 0);
  return (model.priceUsd * tokens) / 1_000_000;
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
/** 校正模型输出：类别只认固定列表；画质 1–5；高光夹在 [0, 时长] 内、end > start，按分数取前 6 条再按时间排好。
 *  照片没有时长，高光一律丢掉（照片整张就是一段） */
export function sanitizeAnalysis(raw: unknown, duration: number): AssetAnalysis {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const cat = typeof o.category === "string" ? o.category.trim() : "";
  const category = (CATEGORIES as readonly string[]).includes(cat) ? cat : "其他";
  const summary = typeof o.summary === "string" ? o.summary.trim().slice(0, 60) : "";
  const q = Math.round(num(o.quality));
  const quality = (Number.isFinite(q) ? Math.min(5, Math.max(1, q)) : 3) as AssetAnalysis["quality"];
  const hs: Highlight[] = [];
  if (duration > 0 && Array.isArray(o.highlights)) {
    for (const h of o.highlights as unknown[]) {
      if (!h || typeof h !== "object") continue;
      const x = h as Record<string, unknown>;
      const start = Math.min(duration, Math.max(0, num(x.start))), end = Math.min(duration, Math.max(0, num(x.end)));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.1) continue;
      const sc = num(x.score); const score = Number.isFinite(sc) ? Math.min(1, Math.max(0, sc > 1 ? sc / 10 : sc)) : 0.5;
      hs.push({ start: +start.toFixed(2), end: +end.toFixed(2), score: +score.toFixed(2), desc: typeof x.desc === "string" ? x.desc.trim().slice(0, 30) : "" });
    }
  }
  const highlights = hs.sort((a, b) => b.score - a.score).slice(0, 6).sort((a, b) => a.start - b.start);
  return { status: "ready", category, summary, quality, highlights };
}

const SYSTEM = `你是短视频剪辑助理，负责看素材。给你一条素材按时间抽出的几帧画面，判断它拍的是什么、画面质量如何、哪些时间段最值得剪进成片。只输出 JSON，不要解释。
JSON 结构：{"category":"类别","summary":"一句话描述画面内容（≤30字）","quality":画质分1到5,"highlights":[{"start":起点秒,"end":终点秒,"score":0到1的推荐度,"desc":"这段好在哪（≤15字）"}]}
规则：
- category 只能是：${CATEGORIES.join(" / ")} 之一。
- quality：5 = 清晰稳定构图好，1 = 糊、抖、过暗过曝。
- highlights 是素材内的时间（秒），必须在素材时长范围内，end > start，每段 1.5–6 秒，最多 6 段；只有照片时 highlights 给空数组。`;

/** 调视觉模型分析一条素材。frames 为 sampleFrames 的结果（时间点 + jpeg dataURL） */
export async function analyzeAsset(model: string, asset: ClipAsset, frames: { t: number; url: string }[], signal?: AbortSignal): Promise<AssetAnalysis> {
  const head = asset.kind === "video" ? `这是一段视频，时长 ${asset.duration.toFixed(1)} 秒，下面按时间顺序给出 ${frames.length} 帧：` : "这是一张照片：";
  const content: Exclude<Msg["content"], string> = [{ type: "text", text: head }];
  for (const f of frames) { if (asset.kind === "video") content.push({ type: "text", text: `第 ${f.t.toFixed(1)} 秒：` }); content.push({ type: "image_url", image_url: { url: f.url } }); }
  const r = await chat(model, [{ role: "system", content: SYSTEM }, { role: "user", content }], { json: true, temperature: 0.2, signal });
  let raw: unknown;
  try { raw = parseJson(r.content); } catch { throw new Error("AI 返回的分析结果格式不对，可以稍后重试"); }
  return sanitizeAnalysis(raw, asset.kind === "video" ? asset.duration : 0);
}

const DECODE_ERR = "这段素材浏览器无法解码 · 换素材或转码后重新上传";
function shrink(src: CanvasImageSource, sw: number, sh: number): string {
  const s = Math.min(1, LONG_EDGE / Math.max(sw, sh, 1)); const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s));
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.7);
}
/** 等一个媒体事件：超时或取消都要结束，否则解码卡住的素材会把整条队列挂死 */
function waitEvent(el: HTMLMediaElement, ok: string, ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((res, rej) => {
    const done = (fn: () => void) => { clearTimeout(timer); el.removeEventListener(ok, onOk); el.removeEventListener("error", onErr); signal?.removeEventListener("abort", onAbort); fn(); };
    const onOk = () => done(res); const onErr = () => done(() => rej(new Error(DECODE_ERR)));
    const onAbort = () => done(() => rej(new DOMException("已取消", "AbortError")));
    const timer = setTimeout(() => done(() => rej(new Error(DECODE_ERR))), ms);
    if (signal?.aborted) return onAbort();
    el.addEventListener(ok, onOk); el.addEventListener("error", onErr); signal?.addEventListener("abort", onAbort);
  });
}

/** 抽帧：视频按 frameTimes 逐帧 seek 画到长边 384 的 canvas；照片取一张缩小后的原图。解码失败抛「浏览器无法解码」 */
export async function sampleFrames(asset: ClipAsset, signal?: AbortSignal): Promise<{ t: number; url: string }[]> {
  if (!asset.url) throw new Error("文件不在浏览器里，请重新上传");
  if (asset.kind === "image") {
    const img = new Image(); img.src = asset.url;
    try { await img.decode(); } catch { throw new Error(DECODE_ERR); }
    return [{ t: 0, url: shrink(img, img.naturalWidth, img.naturalHeight) }];
  }
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = asset.url;
  try {
    await waitEvent(v, "loadeddata", 20000, signal);
    const out: { t: number; url: string }[] = [];
    for (const t of frameTimes(asset.duration || v.duration)) {
      v.currentTime = t; await waitEvent(v, "seeked", 8000, signal);
      out.push({ t, url: shrink(v, v.videoWidth || 16, v.videoHeight || 9) });
    }
    return out;
  } finally { v.removeAttribute("src"); v.load(); }
}
