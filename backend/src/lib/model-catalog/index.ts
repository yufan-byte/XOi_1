import axios from "axios";
import { requireDb } from "@/lib/agent/db";
import metadata from "./metadata.json";
import { evaluateBillingExpression } from "./expression";
import { modelPresentations } from "./recommendations";
import type { ModelMetadata, ModelMetadataMap } from "./cards";

export type ModelKind = "text" | "image" | "video" | "audio";
export type PricingRow = { model_name: string; model_ratio?: number; completion_ratio?: number; model_price?: number; quota_type?: number; billing_mode?: string; billing_expr?: string; enable_groups?: string[]; pricing_version?: string };
type Meta = ModelMetadata;
export type CatalogModel = { modelName: string; name: string; type: ModelKind; series: string; provider: string; capabilities: string[]; defaults: Record<string, any>; enums: Record<string, any[]>; paramSchema: Record<string, any>; referenceLimits?: ModelMetadata["referenceLimits"]; recommended: boolean; recommendation?: string; recommendationRank: number; description: string; referenceLatencySeconds?: number; selectable: boolean; think: boolean; mode: string[]; audio: boolean; durationResolutionMap: { duration: number[]; resolution: string[] }[]; pricing: PricingRow };
const refs = metadata as Record<string, Meta>;
let cache: { at: number; models: CatalogModel[]; cards: ModelMetadataMap; groupRatio: Record<string, number> } | undefined;
let loading: Promise<NonNullable<typeof cache>> | undefined;
const userModels = new Map<number, { at: number; names: Set<string>; group: string }>();
export function clearModelCatalogCache() { cache = undefined; userModels.clear(); }
const baseUrl = () => (process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "").replace(/\/v1$/, "");

/** o_user.role 口径：字符串 "admin"/"user"（兼容数字 10/100） */
export function isAdminRole(role: string | number | undefined): boolean {
  const value = String(role ?? "").trim().toLowerCase();
  return value === "admin" || value === "root" || (Number.isFinite(Number(value)) && Number(value) >= 10);
}
export function isAgnesModel(model: unknown): boolean {
  return /^agnes(?:-|$)/i.test(String(model || "").replace(/^newapi:/, "").trim());
}
async function roleOf(userId: number): Promise<string | undefined> {
  try {
    const row = await requireDb().query("SELECT role FROM o_user WHERE id = $1", [userId]);
    return row.rows[0]?.role;
  } catch { return undefined; }
}

export function inferKind(name: string, meta?: Meta): ModelKind {
  if (meta?.type && ["text", "image", "video", "audio"].includes(meta.type)) return meta.type as ModelKind;
  if (/tts|speech|whisper|audio|voice|suno|music/i.test(name)) return "audio";
  if (/image|seedream|flux|midjourney|banana|repaint/i.test(name)) return "image";
  if (/video|seedance|sora|veo|kling(?!.*image)|wan[-\d.]|vidu|hailuo|minimax-h|pixverse|happyhorse|lip-sync/i.test(name)) return "video";
  return "text";
}
function seriesOf(name: string): string {
  const rules: [RegExp, string][] = [[/agnes/i, "Agnes 测试"], [/^claude/i, "Claude"], [/^(gpt|chatgpt|o\d)/i, "GPT"], [/^gemini/i, "Gemini"], [/^deepseek/i, "DeepSeek"], [/^seedance/i, "即梦 Seedance"], [/seedream|doubao.*image/i, "豆包 Seedream"], [/^sora/i, "Sora"], [/^veo/i, "Veo"], [/^kling/i, "可灵"], [/^grok/i, "Grok"], [/^wan|^qwen/i, "通义"], [/minimax|hailuo/i, "MiniMax"], [/^vidu/i, "Vidu"], [/^flux/i, "Flux"], [/^glm/i, "智谱"], [/kimi|moonshot/i, "Kimi"]];
  return rules.find(([re]) => re.test(name))?.[1] || "其他模型";
}
export function buildCatalog(rows: PricingRow[], saved: any[] = [], cards: ModelMetadataMap = {}): CatalogModel[] {
  const models = rows.map((pricing): CatalogModel => {
    const modelName = pricing.model_name;
    const meta = { ...refs[modelName], ...cards[modelName] };
    const old = saved.find((m) => m.modelName === modelName) || {};
    const presentation = modelPresentations[modelName];
    const type = inferKind(modelName, meta);
    const enums = meta.enums || {};
    const caps = meta.capabilities || [];
    const duration = (enums.duration || enums.seconds || []).map(Number).filter((v) => v > 0);
    const resolution = (enums.resolution || []).map(String);
    const specialty = /superres|lip-sync|avatar|voice-clone|voice-design|repaint/i.test(modelName);
    return { modelName, name: presentation?.name || meta.name || old.name || modelName, type, series: seriesOf(modelName), provider: meta.provider || seriesOf(modelName), capabilities: caps,
      description: presentation?.description || caps.slice(0, 3).join(" · ") || `${seriesOf(modelName)} · ${type === "video" ? "视频创作" : type === "image" ? "图像创作" : type === "audio" ? "语音合成" : "文字创作"}`,
      recommendationRank: presentation?.rank ?? meta.recommendationRank ?? 0, referenceLatencySeconds: presentation?.referenceLatencySeconds,
      defaults: meta.defaults || {}, enums, paramSchema: meta.paramSchema || {}, referenceLimits: meta.referenceLimits, recommended: false, selectable: meta.available !== false && !specialty && (type !== "audio" || /tts|speech/i.test(modelName)), think: old.think ?? /reason|thinking|pro|opus|o[134]/i.test(modelName),
      mode: old.mode || (type === "text" || type === "audio" ? [] : ["text", ...(caps.some(c => /图生|参考图|image/i.test(c)) ? ["singleImage", "multiReference"] : [])]),
      audio: old.audio ?? caps.some(c => /声音|音频|audio/i.test(c)),
      durationResolutionMap: duration.length && resolution.length ? [{ duration, resolution }] : old.durationResolutionMap || [], pricing };
  });
  // Curated entry points; source metadata and billing remain unchanged.
  for (const type of ["text", "image", "video", "audio"] as ModelKind[]) {
    const list = models.filter(m => m.type === type && m.selectable);
    const preferred = list.filter(m => !/agnes|enterprise|official|special|superres/i.test(m.modelName));
    const pool = preferred.length ? preferred : list;
    const featured = list.filter(m => modelPresentations[m.modelName]?.featured || ({ ...refs[m.modelName], ...cards[m.modelName] }).featured).sort((a, b) => b.recommendationRank - a.recommendationRank);
    const curated = list.filter(m => modelPresentations[m.modelName]).sort((a, b) => b.recommendationRank - a.recommendationRank);
    const limit = type === "video" ? 4 : 3;
    for (const m of featured) {
      m.recommended = true; m.recommendation = modelPresentations[m.modelName]?.recommendation || "上游重点推荐";
    }
    for (const m of curated) {
      if (list.filter(item => item.recommended).length >= Math.max(limit, featured.length)) break;
      m.recommended = true; m.recommendation = modelPresentations[m.modelName]?.recommendation || "上游重点推荐";
    }
    const pick = (pattern: RegExp, label: string) => {
      if (list.filter(m => m.recommended).length >= limit) return;
      const selected = pool.find(m => !m.recommended && pattern.test(m.modelName));
      if (selected) { selected.recommended = true; selected.recommendation = label; }
    };
    // seedream-5-0 在造物上游会挂死（实测 4 分钟无响应），不再作为「日常创作」首选；改用出图快的 flash/flux 系。
    pick(/deepseek|luna|mini|flash|flux-2|flux-3|hs-720p/, "日常创作");
    pick(/sonnet|sol$|seedream|gpt-image|seedance.*720|tts-1$/, "均衡选择");
    pick(/opus|astra|pro|1080|veo|kling|tts/, "进阶选择");
    for (const m of pool) { if (list.filter(x => x.recommended).length >= limit) break; if (!m.recommended) { m.recommended = true; m.recommendation = "可用模型"; } }
  }
  return models.sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.recommendationRank - a.recommendationRank || a.series.localeCompare(b.series, "zh") || a.name.localeCompare(b.name, "zh", { numeric: true }));
}

async function catalogBase() {
  if (cache && Date.now() - cache.at < 30_000) return cache;
  if (loading) return loading;
  loading = (async () => {
    const previousCache = cache;
    const response = await axios.get(`${baseUrl()}/api/pricing`, { timeout: 15_000 });
    const rows = response.data?.data;
    if (!Array.isArray(rows)) throw new Error("网关价格目录不可用");
    const db = requireDb();
    const saved = await db.query('SELECT models FROM "o_vendorConfig" WHERE id = $1', ["newapi"]);
    const old = JSON.parse(saved.rows[0]?.models || "[]");
    let cards: ModelMetadataMap = {};
    try {
      const snapshots = await db.query("SELECT snapshot FROM xoi_upstream_pricing_sync WHERE snapshot->>'status'='synced' ORDER BY synced_at ASC");
      for (const row of snapshots.rows) Object.assign(cards, row.snapshot?.cards || {});
    } catch { /* A fresh installation has not synchronized capability cards yet. */ }
    cache = { at: Date.now(), models: buildCatalog(rows, old, cards), cards, groupRatio: response.data.group_ratio || { default: 1 } };
    // 事件驱动自愈：只有网关模型清单真的发生变化（渠道上下架）才触发存量引用巡检，不做定时轮询。
    if (previousCache) {
      const before = new Set(previousCache.models.map((m) => m.modelName));
      const after = new Set(cache.models.map((m) => m.modelName));
      const changed = before.size !== after.size || [...after].some((name) => !before.has(name));
      if (changed) {
        console.info("[model-ref-repair] 检测到网关模型清单变化，巡检存量引用");
        setTimeout(() => { void import("./repair").then((m) => m.repairStaleModelRefs()).catch(() => {}); }, 500).unref?.();
      }
    }
    return cache;
  })().finally(() => { loading = undefined; });
  return loading;
}
/** Shared by trusted server adapters. User-facing routes must use getUserCatalog. */
export async function getGatewayModels() { return (await catalogBase()).models; }
// 用户目录结果缓存：getUserCatalog 每次要查 3 张表（倍率/禁用/角色），50 并发压测 P95 达 1s。
// 目录变化是低频事件，15s 进程缓存与可见性缓存（30s）同量级；压测后 P95 < 40ms。
type UserCatalogResult = { models: ReturnType<typeof buildCatalog>; factor: number; group: string };
const userCatalogCache = new Map<number, { at: number; result: UserCatalogResult }>();
// 并发击穿防护：缓存过期瞬间的并发请求合并为一次重建（single-flight），其余等同一个结果
const userCatalogInflight = new Map<number, Promise<UserCatalogResult>>();
export function invalidateUserCatalog(userId?: number) {
  if (userId === undefined) { userCatalogCache.clear(); userCatalogInflight.clear(); }
  else { userCatalogCache.delete(userId); userCatalogInflight.delete(userId); }
}
export async function getUserCatalog(userId: number) {
  const cached = userCatalogCache.get(userId);
  if (cached && Date.now() - cached.at < 15_000) return cached.result;
  const inflight = userCatalogInflight.get(userId);
  if (inflight) return inflight;
  const building = buildUserCatalog(userId).finally(() => userCatalogInflight.delete(userId));
  userCatalogInflight.set(userId, building);
  const result = await building;
  if (userCatalogCache.size > 1000) userCatalogCache.clear();
  userCatalogCache.set(userId, { at: Date.now(), result });
  return result;
}
async function buildUserCatalog(userId: number) {
  const base = await catalogBase();
  let visible = userModels.get(userId);
  if (!visible || Date.now() - visible.at > 30_000) {
    const { getUserGatewayCredentials } = await import("@/lib/gateway/newapi");
    const credentials = await getUserGatewayCredentials(userId);
    const response = await axios.get(`${credentials.baseUrl}/models`, { headers: { Authorization: `Bearer ${credentials.apiKey}` }, timeout: 15_000 });
    if (!Array.isArray(response.data?.data)) throw new Error("用户可用模型列表读取失败");
    visible = { at: Date.now(), group: credentials.group, names: new Set(response.data.data.map((m: any) => String(m.id))) };
    if (userModels.size > 1000) userModels.clear();
    userModels.set(userId, visible);
  }
  const options = await requireDb().query("SELECT key,value FROM options WHERE key IN ('GroupRatio','GroupGroupRatio')");
  const opts = Object.fromEntries(options.rows.map(r => [r.key, r.value]));
  const ratios = opts.GroupRatio ? JSON.parse(opts.GroupRatio) : base.groupRatio;
  const special = JSON.parse(opts.GroupGroupRatio || "{}");
  const factor = Number(special[visible.group]?.[visible.group] ?? ratios[visible.group] ?? (visible.group === "default" ? 1 : NaN));
  if (!Number.isFinite(factor) || factor < 0) throw new Error("当前分组计费倍率未配置");
  const { readData } = await import("@/lib/reseller/store");
  const hidden = new Set((await readData()).models.disabled);
  // 模型可见性按角色定：agnes 是平台自费的免费测试线路，只对管理员开放；
  // 普通用户只看运营上架的收费渠道（生产环境原有的 agnes 屏蔽被这条角色规则取代）。
  const admin = isAdminRole(await roleOf(userId));
  const available = base.models.filter(m => visible!.names.has(m.modelName) && (
    admin && isAgnesModel(m.modelName) || !hidden.has(m.modelName) && !isAgnesModel(m.modelName)
  ));
  // Recommend within this user's available set, not the global set they may lack access to.
  return { models: buildCatalog(available.map(m => m.pricing), available, base.cards), factor, group: visible.group };
}

function familyKey(name: string): string {
  return name.toLowerCase()
    .replace(/^(?:newapi:)/, "")
    .replace(/-(?:xoi|official|enterprise|special)$/, "")
    .replace(/-(?:480|720|1080)p(?:-.+)?$/, "")
    .replace(/(?:-v)?\d+(?:[.-]\d+)*$/, "")
    .replace(/[-_.]+$/, "");
}

/**
 * Resolve a persisted XOi model preference against the current user's live catalog.
 * The persisted value is never rewritten: if a channel disappears temporarily we use
 * the closest healthy model for this call, and automatically return to the preferred
 * model when it comes back.
 */
export function selectCatalogModel(models: CatalogModel[], requested: string, type: ModelKind): CatalogModel | undefined {
  const exact = models.find(m => m.modelName === requested && m.type === type && m.selectable);
  if (exact) return exact;
  // Video models can have different billing units, resolutions and prices. A
  // missing explicit selection must never silently become another paid model.
  if (type === "video" && requested) return undefined;
  if (isAgnesModel(requested)) return undefined; // restricted test models never fall through to a paid model
  const candidates = models.filter(m => m.type === type && m.selectable && !isAgnesModel(m.modelName));
  const family = familyKey(requested);
  return candidates
    .map((model, index) => ({ model, index, score:
      (family && familyKey(model.modelName) === family ? 10_000 : 0) +
      (model.series === seriesOf(requested) ? 1_000 : 0) +
      (model.recommended ? 100 : 0) + model.recommendationRank }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.model;
}

export async function resolveUserCatalogModel(userId: number, requested: string, type: ModelKind, allowFallback = true) {
  const catalog = await getUserCatalog(userId);
  const exact = catalog.models.find(m => m.modelName === requested && m.type === type && m.selectable);
  if (exact) return { model: exact, catalog, fallback: false };
  if (isAgnesModel(requested)) throw new Error("Agnes 测试模型仅管理员可用");
  const model = allowFallback ? selectCatalogModel(catalog.models, requested, type) : undefined;
  if (!model) throw new Error(`模型 ${requested || "未选择"} 当前不可用`);
  console.warn(`[model-binding] ${type} 偏好 ${requested || "<empty>"} 暂不可用，本次使用 ${model.modelName}；未改写持久配置`);
  return { model, catalog, fallback: true };
}

export async function assertUserModelAccess(userId: number, requested: string): Promise<CatalogModel> {
  const catalog = await getUserCatalog(userId);
  const model = catalog.models.find(m => m.modelName === requested && m.selectable);
  if (!model) throw new Error(isAgnesModel(requested) ? "Agnes 测试模型仅管理员可用" : `模型 ${requested || "未选择"} 当前不可用`);
  return model;
}

export function quoteModel(model: CatalogModel, input: Record<string, any> = {}, factor = 1) {
  const params = { ...model.defaults, ...Object.fromEntries(Object.entries(input).filter(([,value]) => value !== undefined)) };
  const seconds = Number(input.seconds ?? input.duration ?? params.seconds ?? params.duration ?? 5);
  const n = Number(input.n ?? input.count ?? params.n ?? 1);
  if (!(seconds > 0 && seconds <= 3600 && n > 0 && n <= 100)) throw new Error("生成参数超出报价范围");
  params.n = n;
  if (model.type === "audio" && params.input === undefined && input.inputLength !== undefined) params.input = "字".repeat(Math.min(100_000, Math.max(0, Number(input.inputLength) || 0)));
  const p = Number(input.inputTokens ?? (model.type === "audio" ? String(params.input ?? "").length : Math.ceil(Number(input.inputLength || 0) / 1.5)));
  const c = Number(input.outputTokens ?? 800);
  if (![p, c].every(v => Number.isFinite(v) && v >= 0 && v <= 10_000_000)) throw new Error("文本用量无效");
  const resolution = String(input.resolution ?? params.resolution ?? input.size ?? "").toLowerCase().replace(/^(480|720|1080)$/, "$1p");
  if (/^seedance2\.[05]-line1(?:-fast)?-xoi$/i.test(model.modelName) && !["480p", "720p"].includes(resolution)) {
    throw new Error("该专线此清晰度的计费尚未核实，暂不可报价或生成");
  }
  const usage = { seconds, upstream_cost: 0, billing_resolution: resolution, billing_quality: input.quality ?? params.quality ?? "", billing_mode: input.mode ?? params.mode ?? "text-to-video", billing_ref_video: input.hasReferenceVideo === true ? "true" : "false", billing_generate_audio: String(input.generate_audio ?? "false"), billing_aspect_ratio: input.aspect_ratio ?? params.aspect_ratio ?? "16:9", billing_model_variant: input.model_variant ?? params.model_variant ?? "", billing_tier: input.tier ?? params.tier ?? "" };
  const pricing = model.pricing;
  let yuan: number;
  let referenceVideoAdjustment: { multiplier: number; baseYuan: number; basePoints: number } | null = null;
  let note = "";
  if (pricing.billing_expr) {
    yuan = evaluateBillingExpression(pricing.billing_expr, { p, c, cr: 0, cc: 0, cc1h: 0, len: p + c }, params, usage);
    const http = model.type === "text" || /param\(|\bp\s*\*|tier\("flat"/.test(pricing.billing_expr);
    if (http) yuan /= 1_000_000;
    if (model.type === "video" && input.hasReferenceVideo === true && /billing_ref_video/.test(pricing.billing_expr)) {
      const base = evaluateBillingExpression(pricing.billing_expr, { p, c, cr: 0, cc: 0, cc1h: 0, len: p + c }, params, { ...usage, billing_ref_video: "false" }) / (http ? 1_000_000 : 1);
      if (base > 0 && yuan > base) referenceVideoAdjustment = { multiplier: yuan / base, baseYuan: base * factor, basePoints: base * factor * 10 };
    }
    if (/upstream_cost/.test(pricing.billing_expr)) note = "预估按当前参数计算，最终费用可能受参考素材或上游实际用量影响";
  } else if (pricing.quota_type === 1 || Number(pricing.model_price) > 0) {
    // NewAPI model_price is per request, not per second. Never infer billing units from modality.
    yuan = Number(pricing.model_price || 0) * n;
  } else {
    yuan = Number(pricing.model_ratio || 0) * 2 * (p + c * Number(pricing.completion_ratio ?? 1)) / 1_000_000;
  }
  yuan *= factor;
  if (yuan === 0 && /upstream_cost/.test(pricing.billing_expr || "")) throw new Error("费用依赖上游实际成本，暂无可靠完整预估");
  if (!Number.isFinite(yuan) || yuan < 0) throw new Error("价格计算失败");
  return { yuan, points: yuan * 10, pointsPerYuan: 10, estimated: true, referenceVideoAdjustment, note: note || (model.type === "text" ? "包括本轮输入与预计输出；历史上下文和多次工具调用会增加实际用量" : "最终按实际用量结算"), pricingVersion: pricing.pricing_version || "" };
}
const formatNumber = (value: number) => value === 0 ? "0" : value < 0.001 ? "<0.001" : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
export function publicModel(model: CatalogModel, factor: number) {
  let price: ReturnType<typeof quoteModel> | null = null;
  let outputPrice: ReturnType<typeof quoteModel> | null = null;
  const rates: { resolution: string; yuan: number; points: number; unit: string }[] = [];
  const referenceMultipliers: number[] = [];
  let unit = model.type === "text" ? "百万输入 Token" : "次";
  const expression = model.pricing.billing_expr || "";
  let sample: Record<string, any> = model.type === "text" ? { inputTokens: 1000, outputTokens: 0 } : { seconds: 5, n: 1, inputLength: 1000, input: "字".repeat(1000) };
  if (model.type !== "text" && /u\("seconds"\)/.test(expression)) unit = "5 秒示例";
  if (model.type === "audio" && /param\("input"\)|\bp\s*\*/.test(expression)) { unit = "千字"; sample.inputTokens = 1000; }
  try {
    price = quoteModel(model, sample, factor);
    if (model.type === "text") {
      if (expression || (model.pricing.quota_type !== 1 && !Number(model.pricing.model_price))) {
        price.yuan *= 1000; price.points *= 1000;
        outputPrice = quoteModel(model, { inputTokens: 0, outputTokens: 1000 }, factor);
        outputPrice.yuan *= 1000; outputPrice.points *= 1000;
      } else unit = "次";
    }
  } catch { /* Unknown expressions are never shown as free. */ }
  for (const resolution of modelPresentations[model.modelName]?.rateResolutions || []) {
    try {
      const five = quoteModel(model, { seconds: 5, resolution, hasReferenceVideo: false }, factor);
      const ten = quoteModel(model, { seconds: 10, resolution, hasReferenceVideo: false }, factor);
      // Verify linear per-second billing; don't mislabel a flat/minimum price as /second.
      if (five.yuan > 0 && Math.abs(ten.yuan - five.yuan * 2) < 1e-7) {
        rates.push({ resolution, yuan: five.yuan / 5, points: five.points / 5, unit: "秒" });
        const withVideo = quoteModel(model, { seconds: 5, resolution, hasReferenceVideo: true }, factor);
        if (withVideo.referenceVideoAdjustment) referenceMultipliers.push(withVideo.referenceVideoAdjustment.multiplier);
      }
    } catch { /* Unknown/new rules keep the regular estimate. */ }
  }
  const displayPrice = price ? outputPrice
    ? `输入 ${formatNumber(price.points)} / 输出 ${formatNumber(outputPrice.points)} 积分 / 百万 Token（¥${formatNumber(price.yuan)} / ¥${formatNumber(outputPrice.yuan)}）`
    : `${formatNumber(price.points)} 积分 / ${unit}（¥${formatNumber(price.yuan)}）` : "按实际用量计费 · 暂无预估";
  const { pricing, ...safe } = model;
  const priceSummary = rates.length ? rates.map(r => `${r.resolution} ${formatNumber(r.points)} 积分/秒（¥${formatNumber(r.yuan)}）`).join(" · ") : displayPrice;
  const referenceVideoMultiplier = rates.length && referenceMultipliers.length === rates.length && referenceMultipliers.every(v => Math.abs(v - referenceMultipliers[0]) < 1e-5) ? Math.round(referenceMultipliers[0] * 10000) / 10000 : undefined;
  const billingUnit = model.type === "video" ? /u\("seconds"\)/.test(expression) ? "per_second" : "per_request" : model.type === "text" ? "per_token" : "per_request";
  return { ...safe, billingUnit, displayPrice: priceSummary, rates, referenceVideoMultiplier, price: price ? { ...price, unit } : null, outputPrice, pricingVersion: pricing.pricing_version || "", route: "auto" };
}
