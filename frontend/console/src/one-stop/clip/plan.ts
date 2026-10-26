// 让模型基于素材清单产出 JSON 剪辑方案，并做兜底校验
import { chat, parseJson } from "@/lib/llm";
import { sanitizeFx } from "./fx";
import { TEMPLATES, findTemplate, isFit, type ClipAsset, type EditPlan, type PlanSegment } from "./types";

/** 素材清单：分析过的素材带上「类别｜摘要｜高光」，让模型按画面内容挑片段；没分析的照旧只有文件名和时长 */
export function assetTable(assets: ClipAsset[]) {
  return assets.map((a, i) => {
    const base = `${i}. [${a.kind === "video" ? "视频" : a.kind === "image" ? "照片" : "音频"}] ${a.name}${a.duration ? ` 时长 ${a.duration.toFixed(1)}s` : ""}${a.width ? ` ${a.width}×${a.height}` : ""}`;
    const an = a.analysis; if (an?.status !== "ready") return base;
    const hl = an.highlights?.length ? `｜高光 ${an.highlights.map((h) => `${h.start}–${h.end}s(${h.score})`).join("、")}` : "";
    return `${base}｜类别 ${an.category ?? "其他"}${an.summary ? `｜${an.summary}` : ""}${an.quality ? `｜画质 ${an.quality}/5` : ""}${hl}`;
  }).join("\n");
}

const SYSTEM = `你是一位专业短视频剪辑师。根据用户需求和素材清单，产出一份剪辑方案，只输出 JSON，不要解释。
JSON 结构：{"title":"成片标题（≤12字）","summary":"一句话说明剪辑思路","segments":[{"source":素材序号,"start":起点秒,"end":终点秒,"caption":"字幕（≤16字，可空）","fx":{"kind":"title|sticker|number","text":"动效文字（≤12字）"}}],"bgm":音频素材序号（没有音频素材就省略）}
规则：
- source 只能是清单里存在的序号；视频片段 start/end 必须在该视频时长范围内，end > start；照片的 start 固定 0，end 为展示秒数（2–4 秒）；音频素材只能作为 bgm，不能出现在 segments 里。
- 素材后面带「类别｜摘要｜高光 起–止s(推荐度)」的是 AI 看过画面的结论：视频片段优先从高光区间里取（start/end 落在高光范围内，推荐度高的优先），字幕贴合摘要描述的画面；画质低的素材少用。
- 同一个视频可以被多次选用不同的区间，避免重复选同一区间；优先挑不同素材、不同时间点，覆盖面广。
- 字幕用简体中文，贴合画面与需求，不要每段都一样；开头第一段字幕可以点题。
- 总时长和单段时长遵循模板要求；片段数量不超过 40。
- fx 是可选的动效组件，整条片子用 0–4 个，只放在真正需要强调的段落，其余段落省略 fx：title = 动态标题条（章节 / 地点 / 主题），sticker = 社交贴纸（如「点赞关注」「收藏起来」，适合结尾或高光），number = 数字滚动（text 必须含数字，如「3000+ 人打卡」「好评率 98%」，没有真实数字就不用）。`;

export async function generatePlan(model: string, assets: ClipAsset[], prompt: string, template: string, opts: { referenceNames?: string[]; reasoning?: boolean; signal?: AbortSignal }): Promise<EditPlan> {
  const t = findTemplate(template) ?? TEMPLATES[0];
  const user = `【用户需求】${prompt || "剪一条好看的混剪"}
${opts.referenceNames?.length ? `（参考视频风格：${opts.referenceNames.join("、")} — 学它的节奏与转场，不要直接剪进成片）\n` : ""}【模板】${t.label}：${t.style}；单段 ${t.seg[0]}–${t.seg[1]} 秒，总时长 ${t.total[0]}–${t.total[1]} 秒（素材不够就用尽全部素材）。
【素材清单】
${assetTable(assets)}`;
  const r = await chat(model, [{ role: "system", content: SYSTEM }, { role: "user", content: user }], { json: true, temperature: 0.6, reasoning_effort: opts.reasoning ? "high" : undefined, signal: opts.signal });
  return sanitizePlan(readPlan(r.content), assets);
}

export async function revisePlan(model: string, assets: ClipAsset[], plan: EditPlan, request: string, opts: { signal?: AbortSignal } = {}): Promise<EditPlan> {
  const user = `【当前方案】\n${JSON.stringify(plan)}\n\n【素材清单】\n${assetTable(assets)}\n\n【修改要求】${request}\n\n请在当前方案基础上修改，输出完整的新方案 JSON。`;
  const r = await chat(model, [{ role: "system", content: SYSTEM }, { role: "user", content: user }], { json: true, temperature: 0.5, signal: opts.signal });
  return sanitizePlan(readPlan(r.content), assets);
}

/** 模型输出 → 方案对象：空输出 / 坏 JSON / 不是对象都给一句人话，而不是 SyntaxError 原文或后面的 TypeError */
function readPlan(text: string): Partial<EditPlan> {
  if (!text.trim()) throw new Error("AI 剪辑师没有返回内容，请重试或换个模型");
  let raw: unknown;
  try { raw = parseJson(text); } catch { throw new Error("AI 剪辑师返回的方案格式不对，请重试或换个模型"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("AI 剪辑师返回的方案格式不对，请重试或换个模型");
  return raw as Partial<EditPlan>;
}

export function sanitizePlan(raw: Partial<EditPlan>, assets: ClipAsset[]): EditPlan {
  const segs: PlanSegment[] = [];
  // segments 可能不是数组、元素可能是 null / 字符串：逐个兜住，非法的直接丢
  for (const s of Array.isArray(raw.segments) ? (raw.segments as unknown[]) : []) {
    if (!s || typeof s !== "object") continue;
    const seg = s as Partial<PlanSegment>;
    const idx = Number(seg.source); if (!Number.isInteger(idx)) continue; const a = assets[idx]; if (!a || a.kind === "audio") continue;
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    let start = Math.max(0, num(seg.start)), end = num(seg.end);
    if (a.kind === "image") { start = 0; end = Math.min(6, Math.max(1.5, end || 3)); }
    else { const d = a.duration || 0; if (d) { start = Math.min(start, Math.max(0, d - 1)); end = Math.min(d, end); } else end = Math.min(end, start + 30); if (end - start < 0.8) end = d ? Math.min(d, start + 2) : start + 2; }
    if (end <= start) continue;
    const fx = sanitizeFx(seg.fx);
    segs.push({ source: idx, start: +start.toFixed(2), end: +end.toFixed(2), caption: typeof seg.caption === "string" ? seg.caption.slice(0, 30) : "", ...(fx ? { fx } : {}), ...(isFit(seg.fit) ? { fit: seg.fit } : {}) });
    if (segs.length >= 40) break;
  }
  if (!segs.length) {
    // 兜底：把所有视觉素材按顺序各取一段
    assets.forEach((a, i) => { if (a.kind === "video") segs.push({ source: i, start: 0, end: Math.min(a.duration || 3, 4), caption: "" }); else if (a.kind === "image") segs.push({ source: i, start: 0, end: 3, caption: "" }); });
  }
  if (!segs.length) throw new Error("没有可用的视频或照片素材");
  let bgm: number | undefined = raw.bgm !== undefined && raw.bgm !== null ? Number(raw.bgm) : undefined;
  if (bgm === undefined || !assets[bgm] || assets[bgm].kind !== "audio") { const i = assets.findIndex((a) => a.kind === "audio"); bgm = i >= 0 ? i : undefined; }
  return { title: (typeof raw.title === "string" && raw.title.trim() ? raw.title : "未命名剪辑").slice(0, 24), summary: typeof raw.summary === "string" ? raw.summary : undefined, segments: segs, bgm, ...(isFit(raw.fit) ? { fit: raw.fit } : {}) };
}

export const planDuration = (p: EditPlan) => p.segments.reduce((s, x) => s + (x.end - x.start), 0);
