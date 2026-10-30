/**
 * 任务插件用量能力表：把上游的计费表达式写进网关之前，先用**本实例真实存在的插件**做一次校验。
 *
 * 背景（实测）：`billing_setting.billing_expr` 是「模型级」表达式，new-api 保存时会拿
 * **所有服务该模型的插件**的 usageSchema 去冒烟测试 —— 只要有一个插件不认识表达式里的
 * 字面量 `u("xxx")`，整个 option 就被 400 打回。
 *
 * 我们的表达式是从造物 `/api/pricing` 照搬的，里面用的是造物自家 `zaowu-video` 插件声明的
 * `billing_aspect_ratio` / `billing_resolution` / `billing_mode` 这些键；而 `grok-imagine-video`
 * 在本实例里还由官方 `xai` 插件服务（只声明 seconds / resolution / input_images …），
 * 于是这一条表达式把**整批价格与参数目录**永久卡死（日志里 1243 条同样的报错）。
 *
 * 这里不拉黑模型、也不改网关：只把「本实例承载不了」的表达式挑出来跳过，
 * 价格倍率（ModelRatio / ModelPrice）照常同步，模型照样能卖、能按次计费。
 * 以后上游新增模型/新增 key，也走同一条校验，不会再整批失败。
 */
import { adminApi } from "@/lib/agent/newapi-admin";

interface PluginMeta {
  key?: string;
  models?: string[];
  usageSchema?: Record<string, unknown>;
  usageProfiles?: Array<{ models?: string[]; schema?: Record<string, unknown> }>;
}
interface PluginEntry {
  meta?: PluginMeta;
}

/** 单个模型 → 服务它的插件及其声明的用量键 */
export type UsageCapability = Map<string, Array<{ plugin: string; keys: Set<string> }>>;

const CACHE_TTL = 5 * 60_000;
let cache: { at: number; value: UsageCapability } | null = null;

/** 表达式里出现的字面量 u("key")（动态参数没法静态校验，网关也会忽略） */
export function usedUsageKeys(expression: string): string[] {
  const out = new Set<string>();
  for (const m of expression.matchAll(/\bu\(\s*["']([^"']+)["']\s*\)/g)) out.add(m[1]);
  return [...out];
}

/** 拉本实例已装的任务插件，算出 model → 各插件声明了哪些用量键 */
export async function loadUsageCapability(force = false): Promise<UsageCapability> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.value;
  const list = await adminApi<PluginEntry[]>("/api/plugin/task/");
  const cap: UsageCapability = new Map();
  for (const entry of list ?? []) {
    const meta = entry?.meta;
    if (!meta?.key || !Array.isArray(meta.models)) continue;
    const profiles = Array.isArray(meta.usageProfiles) ? meta.usageProfiles : [];
    for (const model of meta.models) {
      if (typeof model !== "string" || !model) continue;
      // 一个模型只能落在一个 profile 里；命中 profile 时用它的 schema（替换而非合并）
      const profile = profiles.find((p) => Array.isArray(p?.models) && p.models.includes(model));
      const schema = (profile?.schema ?? meta.usageSchema ?? {}) as Record<string, unknown>;
      const keys = new Set(Object.keys(schema));
      const bucket = cap.get(model) ?? [];
      bucket.push({ plugin: meta.key, keys });
      cap.set(model, bucket);
    }
  }
  cache = { at: Date.now(), value: cap };
  return cap;
}

export interface DroppedExpression {
  model: string;
  reason: string;
}

/**
 * 就地把承载不了的表达式从 maps 里剔除。
 * @returns 被剔除的模型（用于日志点名，便于之后手工补一条兼容的表达式）
 */
export function sanitizeExpressions(
  maps: Record<string, Record<string, unknown>>,
  capability: UsageCapability,
): DroppedExpression[] {
  const expr = maps["billing_setting.billing_expr"];
  if (!expr || typeof expr !== "object") return [];
  const dropped: DroppedExpression[] = [];
  for (const [model, raw] of Object.entries(expr)) {
    if (typeof raw !== "string" || !raw.trim()) {
      delete expr[model];
      dropped.push({ model, reason: "表达式为空" });
      continue;
    }
    const keys = usedUsageKeys(raw);
    // 不读插件用量的表达式（纯 token / param 计价）任何模型都能保存，不受插件限制
    if (!keys.length) continue;
    const providers = capability.get(model);
    if (!providers?.length) {
      delete expr[model];
      dropped.push({ model, reason: `表达式要 ${keys.join("/")}，但本实例没有插件声明该模型` });
      continue;
    }
    const missing: string[] = [];
    for (const provider of providers) {
      const absent = keys.filter((k) => !provider.keys.has(k));
      if (absent.length) missing.push(`${provider.plugin} 缺 ${absent.join("/")}`);
    }
    if (missing.length) {
      delete expr[model];
      dropped.push({ model, reason: missing.slice(0, 2).join("；") });
    }
  }
  // 模式与表达式必须一一对应：网关对「模式是 tiered_expr 但没有表达式」的模型会直接
  // 回 "billing expression is required"，一样卡住整批。所以把 mode 收窄到 expr 的键集合。
  const mode = maps["billing_setting.billing_mode"];
  if (mode && typeof mode === "object") {
    const keep = new Set(Object.keys(expr));
    for (const model of Object.keys(mode)) {
      if (!keep.has(model)) delete mode[model];
    }
  }
  return dropped;
}
