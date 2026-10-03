import refModels from "@/data/logical-models.json";
import extraModels from "@/data/extra-models.json";
import channelNotes from "@/data/channel-notes.json";
import manualModels from "@/data/manual-models.json";
import { aicostCaps, aicostHint, aicostSchema, type AicostCaps } from "@/lib/aicost-caps";
import { seriesOfUpstream } from "@/lib/model-series";

export type Modality = "chat" | "image" | "video" | "audio";

export interface ParamOption { value: string; label: string; label_en?: string; description?: string; is_default?: boolean }
export interface ParamField {
  type?: string; label?: { zh?: string; en?: string }; description?: string; default?: unknown;
  enum?: string[]; options?: ParamOption[]; ui_widget?: string; required?: boolean; min?: number; max?: number;
  available_when?: Record<string, string[]>; max_items?: number;
}

export interface CatalogModel {
  id: string;                 // 调用时用的 model 名（new-api model_name）
  name: string;               // 展示名
  series: string;             // 系列，如 CL 系列 / GM 系列
  vendor: string;             // 厂商代号
  vendorLabel: string;
  category: Modality;
  description: string;
  /** aicost 上游模型名。非 aicost 线路为 undefined。 */
  upstream?: string;
  /** 渠道编号，如 hs-1080p。只有能推导出系列的线路才有，用于分组下拉。 */
  seriesCode?: string;
  /** 上游描述里出现的促销字样（如「限时折扣」），标在模型名后面。无促销字样时为 undefined。 */
  promo?: string;
  /** 重点推荐：渠道编号带 hs 的线路（用户 2026-09-18 要求"凡是带 hs 渠道的就写上重点推荐"）。
   *  按编号判定而不是写死清单，将来上游新增 hs 线路会自动带上。 */
  featured: boolean;
  icon: string;               // /icons/providers/xxx.svg
  tags: string[];
  capabilities: string[];
  health: number;
  price: string;              // 展示价格文案
  priceUsd: number;           // 单次/每秒/每百万 token 的站内价（元；站内 $ 即元，字段名为兼容保留）
  billingUnit: "per_request" | "per_second" | "per_1k_chars" | "per_1m_tokens";
  /** 按秒计费线路的「最低计费时长」（秒）：不足这个秒数也按这个秒数收钱。按次计费 / 无下限的线路为 undefined。 */
  minSeconds?: number;
  groups: string[];
  /** 分档计费的全部档位（按次/按秒的多清晰度、多质量档）；非分档模型为空 */
  priceTiers?: PriceTier[];
  /** 不在 default 分组里的模型（如 Claude 官方池的 Fable）：普通密钥调不到，必须用指定分组的密钥。
   *  值就是该用的分组名；default 能调到的模型这里是 undefined。 */
  needsGroup?: string;
  paramSchema: Record<string, ParamField>;
  /** aicost 线路的真实能力（模式 / 素材上限 / 时长），由上游描述 + 接口文档推导；非 aicost 线路为 undefined */
  aicost?: AicostCaps;
  inputHint?: string;
  maxPromptChars?: number;
  sort: number;
  /** 所属分组（侧栏一个入口 = 一个分组，进入后在顶部下拉里选组内模型）。没有分组的模型单独成行 */
  group?: string;
  /** 组内显示名：aicost 线路是渠道编号（hs-720p），其余是模型名 */
  groupItem?: string;
  /** 优先渠道：ccdan（sub2api 文字模型）/ aicost（视频线路）。列表里这两类排最前（站长 2026-09-19 要求） */
  source?: "ccdan" | "aicost";
}


/** 没有卡片的模型（渠道更新后新上的）按名字推断厂商与图标，否则会落进「其他」、没有图标、排到最后 */
const VENDOR_BY_PREFIX: [RegExp, string, string][] = [
  [/^claude/i, "ANT", "anthropic"], [/^(gpt|chatgpt|o\d)/i, "OPE", "openai"], [/^grok/i, "XAI", "grok"], [/^(gemini|gemma)/i, "GOO", "gemini"],
  [/^deepseek/i, "DEE", "deepseek"], [/^glm/i, "ZHI", "glm"], [/^qwen/i, "ALI", "qwen"], [/^(kimi|moonshot)/i, "MOO", "kimi"], [/^(doubao|seed)/i, "BYT", "doubao"], [/^(minimax|abab)/i, "MMX", "minimax"],
];
const inferVendor = (id: string) => VENDOR_BY_PREFIX.find(([re]) => re.test(id));
/** 版本号：取名字里第一组数字，4-8 / 4.8 都读作 4.8（claude-opus-4-8、gpt-5.6-luna、grok-4-20 → 4.2） */
function versionOf(id: string): number { const m = id.match(/(\d+)(?:[.-](\d{1,2})(?!\d))?/); return m ? Number(m[1]) + (m[2] ? Number(`0.${m[2]}`) : 0) : 0; }
/** 同版本内的档位：旗舰 → 标准 → 轻量。名字里匹配到多个取最靠后的（flash-lite 排在 flash 后） */
const TIERS: [string, number][] = [["fable", 0], ["opus", 1], ["astra", 1], ["ultra", 1], ["sol", 2], ["pro", 2], ["max", 2], ["sonnet", 3], ["plus", 3], ["terra", 5], ["flash", 6], ["haiku", 7], ["luna", 7], ["mini", 8], ["lite", 9], ["nano", 10], ["non-reasoning", 11]];
function tierOf(id: string): number { const t = id.toLowerCase(); const hit = TIERS.filter(([w]) => new RegExp(`(^|[-_.])${w}($|[-_.])`).test(t)).map(([, r]) => r); return hit.length ? Math.max(...hit) : 4; }
const BRAND_SHORT: [RegExp, string][] = [[/^claude/i, "CL"], [/^gpt/i, "GT"], [/^grok/i, "GK"], [/^gemini/i, "GM"]];
/** 无卡片模型的展示名：沿用站内命名（CL Opus 6 / GT-5.7 Terra / GK-5），其余首字母大写 */
function prettyName(id: string): string {
  const brand = BRAND_SHORT.find(([re]) => re.test(id));
  const parts = id.split(/[-_]/).filter((x) => x && !/^\d{8}$/.test(x)); const head = parts.shift() ?? id;
  const nums: string[] = []; const words: string[] = [];
  for (const x of parts) (/^\d+(\.\d+)?$/.test(x) && words.length === 0 ? nums : words).push(/^\d/.test(x) ? x : x[0].toUpperCase() + x.slice(1));
  const ver = nums.join("."); const w = words.join(" ");
  if (!brand) return [head[0].toUpperCase() + head.slice(1), ver, w].filter(Boolean).join(" ");
  return brand[1] === "CL" ? [brand[1], w, ver].filter(Boolean).join(" ") : `${brand[1]}-${ver}${w ? " " + w : ""}`;
}

/** 各分类的厂商顺序（厂商代号）。同一分类内先按厂商分组，组内旗舰（卡片权重高）在前——
 *  以前全局只按卡片权重排，图片里 OpenAI / 火山 / Google / 阿里交错出现，用户反馈「很不美观」（2026-09-19）。
 *  没列出的厂商排在该分类最后。 */
const VENDOR_ORDER: Record<string, string[]> = {
  chat: ["ANT", "OPE", "XAI", "DEE", "ZHI", "ALI", "GOO", "MOO"],
  image: ["OPE", "GOO", "BYT", "MID", "ALI", "XAI", "BFL", "KUA", "TIA"],
  video: ["BYT", "OPE", "GOO", "KUA", "XAI", "ALI", "MMX", "PIX", "VID"],
  audio: ["OPE", "GOO", "MMX"],
};
/** aicost 视频线路按家族分组（家族内版本号新到旧）。按家族而不是按具体系列列表：上游出了 seedance3.0 这种新一代时，
 *  它会自动排在 seedance2.5 之前，而不是落到列表最后 */
const AICOST_FAMILY_ORDER = ["seedance", "sora", "grok-imagine", "minimax"];
const familyRank = (series: string) => { const i = AICOST_FAMILY_ORDER.findIndex((f) => series.startsWith(f)); return i < 0 ? 999 : i; };
const rankIn = (list: string[] | undefined, key: string) => { const i = list?.indexOf(key) ?? -1; return i < 0 ? 999 : i; };
const natural = new Intl.Collator("zh", { numeric: true, sensitivity: "base" });
const CATEGORY_ORDER = ["chat", "image", "video", "audio"];
/** 每个模型一个固定排序键，逐项比较（必须是全序，否则 Array.sort 会排乱）。全部由规则推导，不列具体模型——
 *  渠道更新、同步脚本自动上新时，新模型会自己落到正确的分组与位置（站长 2026-09-19：「更新渠道时也要保证排版一致」）。
 *  · 优先渠道（ccdan / aicost，来自 new-api 渠道标签）整体在前
 *  · 聊天：厂商顺序 → 版本号新到旧 → 档位（旗舰 → 标准 → 轻量）
 *  · aicost 视频线路：家族顺序 → 家族内版本号新到旧 → 系列内按名称自然序
 *  · 其余：厂商顺序 → 卡片权重 → 版本号 → 档位 */
function sortKey(m: CatalogModel): (number | string)[] {
  const src = m.source ? 0 : 1; const cat = rankIn(CATEGORY_ORDER, m.category); const vendor = rankIn(VENDOR_ORDER[m.category], m.vendor);
  if (m.category === "chat") return [src, cat, vendor, m.seriesCode ? m.series : "", -versionOf(m.id), tierOf(m.id), m.name];
  if (m.source === "aicost" && m.category === "video") return [src, cat, familyRank(m.series), -versionOf(m.series), m.series, 0, m.name];
  return [src, cat, vendor, -m.sort, -versionOf(m.id), tierOf(m.id), m.name];
}
function compareCatalog(a: CatalogModel, b: CatalogModel): number {
  const ka = sortKey(a), kb = sortKey(b);
  for (let i = 0; i < ka.length; i++) {
    const x = ka[i], y = kb[i]; if (x === y) continue;
    return typeof x === "number" && typeof y === "number" ? x - y : natural.compare(String(x), String(y));
  }
  return 0;
}


export interface RefModel {
  id: string; public_id: string; display_name_zh: string; display_name_en?: string; category: string;
  description_zh?: string; description?: string; icon_key?: string; provider?: string; tags?: string[];
  capabilities?: string[]; health_score?: number; param_schema?: Record<string, ParamField>; input_hint_zh?: string;
  max_prompt_chars?: number; sort_weight?: number;
  /** 上游快照标了「已下架」（available: false）的模型：前台不再列出，免得用户点了才发现出不来 */
  available?: boolean;
  /** aicost 上游模型名，如 seedance2.0-hs-1080p。只有 aicost 线路有。 */
  upstream?: string;
  /** 卡片指定的分组与组内名（同步任务写入，如官转线路单独成组）；不填则按下面的规则推导 */
  group?: string;
  group_item?: string;
}

export interface PricingRow {
  model_name: string; quota_type: number; model_ratio: number; model_price: number; completion_ratio: number;
  enable_groups: string[]; supported_endpoint_types: string[]; billing_mode?: string; billing_expr?: string; owner_by?: string;
  /** 上游描述。由同步任务从 aicost 搬运，并已把成本价改写成我们的售价，可直接展示。 */
  description?: string;
}

// ⚠️ 相对造物源码的改动：造物部署在站点根路径，图标写死 `/icons/providers/...` 就行；
//    本子应用挂在 `/console/` 下（vite base），根绝对路径会 404。
//    Vite 的 baseMiddleware 会先把 `/console/` 剥掉再匹配 public 目录，
//    所以 **必须** 带 base 前缀，且只能用 BASE_URL 拼（写死字面量会让 dev 与 prod 行为不一致）。
//    与 components/login/orbit-data.ts 同一处坑，见 frontend/console/README.md「静态资源」。
const ICON_BASE = `${import.meta.env.BASE_URL}icons/providers/`;

const ICONS: Record<string, string> = {
  // openai 用标准标志（2026-09-19：风格化的 sculpted 版在列表里看着像个灰圈，站长反馈「GPT 图标是错的」）。
  // 注释必须单独成行：曾写在这一行末尾，把同行的 doubao / bytedance 一起注释掉，Seedance 与豆包全部没了图标
  openai: `${ICON_BASE}openai-logo.svg`, doubao: `${ICON_BASE}bytedance.svg`, bytedance: `${ICON_BASE}bytedance.svg`,
  gemini: `${ICON_BASE}google.svg`, google: `${ICON_BASE}google.svg`, anthropic: `${ICON_BASE}sculpted/claude.svg`,
  grok: `${ICON_BASE}sculpted/grok.svg`, xai: `${ICON_BASE}sculpted/grok.svg`, qwen: `${ICON_BASE}external/qwen.svg`,
  alibaba: `${ICON_BASE}alibaba.svg`, aliyun: `${ICON_BASE}alibaba.svg`, wan: `${ICON_BASE}alibaba.svg`,
  minimax: `${ICON_BASE}minimax.svg`, kling: `${ICON_BASE}kuaishou.svg`, deepseek: `${ICON_BASE}deepseek.svg`,
  glm: `${ICON_BASE}external/zai.svg`, kimi: `${ICON_BASE}external/moonshot_bai.svg`, flux: `${ICON_BASE}external/flux_bai.svg`,
  midjourney: `${ICON_BASE}midjourney.svg`, vidu: `${ICON_BASE}vidu.svg`, pixverse: `${ICON_BASE}pixverse.svg`,
  // sora 用 Sora 应用的云朵角色；扁平版 sora.svg 画成了一朵花，不对
  sora: `${ICON_BASE}sculpted/sora.svg`, jimeng: `${ICON_BASE}jimeng.svg`, suno: `${ICON_BASE}external/suno.svg`,
  banana: `${ICON_BASE}sculpted/banana.svg`, "face-repaint": `${ICON_BASE}external/face-repaint_bai.svg`, happyhorse: `${ICON_BASE}external/happyhorse.svg`,
};

export const VENDOR_LABELS: Record<string, string> = {
  OPE: "OpenAI", GOO: "Google", ALI: "阿里云", BYT: "火山引擎", ANT: "Anthropic", XAI: "xAI", MMX: "MiniMax", KUA: "快手可灵",
  DEE: "DeepSeek", ZHI: "智谱", PIX: "PixVerse", BFL: "Black Forest Labs", HON: "HappyHorse", MOO: "月之暗面", MID: "Midjourney", VID: "生数科技", TIA: "TIA",
};

function seriesOf(name: string, iconKey?: string) {
  if (/^CL|Claude/i.test(name)) return "CL 系列";
  if (/^GT|GPT|Codex/i.test(name)) return "GT 系列";
  if (/^GM|Gemini|VO-|Veo/i.test(name)) return "GM 系列";
  if (/^GK|Grok/i.test(name)) return "GK 系列";
  if (/Seedance|Seedream|豆包|Doubao|即梦/i.test(name)) return "字节系列";
  if (/Kling|可灵/i.test(name)) return "可灵系列";
  if (/Qwen|Wan|通义/i.test(name)) return "通义系列";
  if (/MiniMax|Hailuo|海螺/i.test(name)) return "MiniMax 海螺";
  const map: Record<string, string> = { deepseek: "深度求索", glm: "智谱 GLM", kimi: "月之暗面", midjourney: "MJ 图像", pixverse: "PixVerse 视频", vidu: "Vidu 视频", suno: "Suno 音乐", happyhorse: "HappyHorse", flux: "FX 图像", aliyun: "阿里云", gemini: "GM 系列", openai: "SR 视频模型", "face-repaint": "人脸转绘", sora: "SR 视频模型", jimeng: "火山引擎" };
  return (iconKey && map[iconKey]) || (iconKey ? `${iconKey} 系列` : "通用模型");
}

/** 分组键：aicost 线路按「系列 · 计费口径」二级分组，非 aicost 线路返回 undefined（不参与折叠）。
 *
 * 为什么要把计费口径也放进键里：同一系列里混着两种口径——seedance2.0 的 480p 是 ¥3.50/次，
 * 而 480p-100% 是 ¥0.77/秒，跑 10 秒实际 ¥7.70。并排列在一个分组里，数值小的看着更便宜，
 * 实际更贵。分开是为了挡误购，不是分类洁癖。
 *
 * 只有 seedance 细分：minimax-h3 全站仅 1 条线路，拆了会得到一个空组和一个单条组；
 * seedance2.5 现有 5 条全是按秒，所以它实际只会出现「· 按秒」一个入口，这是数据决定的，
 * 不是逻辑遗漏——哪天上游给 2.5 上了按次线路，这里会自动多出一个入口。
 *
 * **下拉、侧边栏折叠、条数徽标三处必须共用本函数。** 各写一份判断必然漂移：徽标曾因为
 * 与折叠条件写成两份，在未折叠时照样显示「共 N 条」。 */
/** 聊天入口（按渠道分组）的重命名与说明：见 data/channel-notes.json。
 *  重命名只用来消歧——「OpenAI · 聊天」和「GPT · Pro 号池」并排时分不出谁是谁。 */
const CH = channelNotes as { rename: Record<string, string>; notes: Record<string, string> };
export const channelName = (group: string) => CH.rename[group] ?? group;
export const channelNote = (group?: string) => (group ? CH.notes[group] : undefined);

export function groupKeyOf(m: CatalogModel): string | undefined {
  // 分组在 buildCatalog 里统一算好（见那里的注释），这里只读，保证侧栏折叠、条数徽标、顶部下拉用的是同一个键
  return m.group;
}

/** 顶部下拉要列的分节：当前分组 + 同系列里只因计费口径被拆开的兄弟组（seedance2.5 · 按次 / · 按秒）。
 *
 * 上游把 seedance2.5-md-720p（按秒 ¥0.336/秒）与 seedance2.5-md-720p-2（按次 ¥6.30/次）当作
 * 两条并列线路。只列当前组时，站在「按次」里的用户看不到 md-720p，会判断我们漏接了上游线路
 * （2026-09-27 站长反馈，附上游渠道列表截图）。换组虽然能从侧栏进，但那条路径没人找得到。
 *
 * 仍然**分节 + 每行带单位**，不要合并成一节按价格排序：¥0.336 看着比 ¥6.30 便宜，跑 30 秒却
 * 要 ¥10.08。两个数值不可比，并排排序必然误导，这是挡误购，不是视觉洁癖。
 *
 * 只吸收「系列 · 口径」形状的键：聊天渠道（键是渠道名）、厂商分组（键是「厂商 · 类别」）
 * 都命中不了这个前缀，行为与改动前一致。 */
export function groupSectionsOf(models: CatalogModel[], current: CatalogModel | null): { group: string; items: { m: CatalogModel; code: string }[] }[] {
  const group = current ? groupKeyOf(current) : undefined;
  if (!current || !group) return [];
  const prefix = `${current.series} · `;
  const split = group.startsWith(prefix);   // 当前组本身就是按口径拆出来的，才去找兄弟组
  const sections = new Map<string, { m: CatalogModel; code: string }[]>();
  for (const m of models) {
    const code = m.groupItem;
    const k = groupKeyOf(m);
    if (!code || !k) continue;
    if (k !== group && !(split && m.series === current.series && k.startsWith(prefix))) continue;
    sections.set(k, [...(sections.get(k) ?? []), { m, code }]);
  }
  // 当前组永远排第一，其余按组名排（按次 / 按秒 的相对顺序因此是稳定的）
  const keys = [...sections.keys()].sort((a, b) => (a === group ? -1 : b === group ? 1 : a.localeCompare(b, "zh")));
  return keys.map((k) => {
    const items = sections.get(k) ?? [];
    // 聊天渠道里的模型保持目录顺序（版本新到旧、旗舰在前）；aicost 线路按渠道编号排
    return { group: k, items: current.source !== "aicost" ? items : [...items].sort((a, b) => a.code.localeCompare(b.code, "zh", { numeric: true })) };
  });
}

// aicost 描述里的促销字样，命中则标在模型名后面。词表只收「促销/时效优惠」这一类。
// 实测 32 条在售线路：只有「限时折扣」真正命中，恰好是 4 条 hs 线路，上游原文为
// 「火山引擎限时折扣」（逗号与句号两种写法都有，所以用 includes 而不是整句匹配）。
// 「满血」(7 条)、「稳定」(5 条)、「官方」(3 条) 有意不收录——它们是产品特性不是促销：
// 「满血933」说的是算力规格，「官方火山引擎的…超级稳定」说的是渠道来源。
const PROMO_WORDS = ["限时折扣"];
function promoOf(desc?: string) {
  return desc ? PROMO_WORDS.find((w) => desc.includes(w)) : undefined;
}

// 线上「最低计费时长」的表达式形态：tier("<档>", u("seconds") < N ? <保底价> : u("seconds") * <每秒价>)
// 这一形态里每秒价在三元表达式的 else 分支上，老的 tier("default", u("seconds") * X) 正则匹配不到，必须单独认。
const FLOOR_DEFAULT = /tier\("default",\s*u\("seconds"\)\s*<\s*[\d.]+\s*\?\s*[\d.]+\s*:\s*u\("seconds"\)\s*\*\s*([\d.]+)/;
const FLOOR_ANY = /tier\("[^"]*",\s*u\("seconds"\)\s*<\s*[\d.]+\s*\?\s*[\d.]+\s*:\s*u\("seconds"\)\s*\*\s*([\d.]+)/;
// 按字符计费的形态：tier("<档>", p * <每字符价×1e6>)。p 是结算时的输入字符数（语音合成按成本价，逐字计费）。
// 这一形态里 tier( 后面紧跟的是 p 而不是数字，下面那两条正则都匹配不到，不单独认就会被误判成按 token 计费。
const PER_CHAR = /tier\("[^"]*",\s*p\s*\*\s*([\d.]+)/;

/** 从计费表达式里取最低计费时长；多档（每档一个下限）时取最小的那个，避免高估用户要付的钱。 */
function parseMinSeconds(expr: string): number | undefined {
  const re = /u\("seconds"\)\s*<\s*([\d.]+)\s*\?/g;
  let min: number | undefined;
  for (let m = re.exec(expr); m; m = re.exec(expr)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && (min === undefined || n < min)) min = n;
  }
  return min;
}

function priceLabel(p: PricingRow, category: Modality): { text: string; usd: number; unit: CatalogModel["billingUnit"]; minSeconds?: number } {
  // 站内 "$" = 元。按表达式形态判断倍率：含 param( 的 http 表达式（图片/音频）或旧版 tier("flat", …) 写 元×1e6；
  // 其余任务表达式（视频等）直接写元。展示默认档价格（无 default 档时取第一档）。
  // category 只影响没有分档表达式（或表达式解析不到价格）的行：决定按秒/按次/千字/1M tokens 展示。
  if (p.billing_mode === "tiered_expr" && p.billing_expr) {
    const expr = p.billing_expr;
    const httpScaled = expr.includes("param(") || /tier\("flat",/.test(expr);
    const minSeconds = parseMinSeconds(expr);
    // 先认「带最低计费时长」的按秒档：它的每秒价在三元表达式的 else 分支上，
    // 不单独认的话下面那两条正则会整条匹配失败，模型被误判成按 token 计费。
    const floor = FLOOR_DEFAULT.exec(expr) ?? FLOOR_ANY.exec(expr);
    if (floor) {
      const yuan = httpScaled ? Number(floor[1]) / 1e6 : Number(floor[1]);
      return { text: `¥${fmtYuan(yuan)} / 秒`, usd: yuan, unit: "per_second", minSeconds };
    }
    // 按字符档：表达式里写的是每字符价，展示统一按千字，和其它音频模型的口径一致。
    const perChar = PER_CHAR.exec(expr);
    if (perChar) {
      // p * X 是 http 表达式（同步脚本 exprs.py：p * rmb×HTTP_SCALE），X 永远是 元×1e6，与是否含 param( 无关。
      // 以前只按"含 param("判断倍率，这一形态被当成直接写元，tts-1-hd 就显示成了 ¥2275560.00 / 千字
      //（2026-09-18 用户截图），实际是 ¥2.28 / 千字。
      const per1k = (Number(perChar[1]) / 1e6) * 1000;
      return { text: `¥${fmtYuan(per1k)} / 千字`, usd: per1k, unit: "per_1k_chars" };
    }
    const m = /tier\("default",\s*(u\("seconds"\)\s*\*\s*)?([\d.]+)/.exec(expr) ?? /tier\("[^"]*",\s*(u\("seconds"\)\s*\*\s*)?([\d.]+)/.exec(expr);
    if (m) {
      const perSecond = !!m[1];
      const yuan = httpScaled ? Number(m[2]) / 1e6 : Number(m[2]);
      return { text: `¥${fmtYuan(yuan)} / ${perSecond ? "秒" : "次"}`, usd: yuan, unit: perSecond ? "per_second" : "per_request", minSeconds: perSecond ? minSeconds : undefined };
    }
  }
  if (p.quota_type === 1 || p.model_price > 0) {
    const usd = p.model_price;
    if (category === "video") return { text: `¥${fmtYuan(usd)} / 秒`, usd, unit: "per_second" };
    return { text: `¥${fmtYuan(usd)} / 次`, usd, unit: "per_request" };
  }
  if (category === "audio") { const usd = p.model_ratio * 0.002; return { text: `¥${fmtYuan(usd)} / 千字`, usd, unit: "per_1k_chars" }; }
  const usd = p.model_ratio * 2;
  return { text: `¥${usd.toFixed(2)} / 1M tokens`, usd, unit: "per_1m_tokens" };
}

/** 代理客户的价格系数（1 + 代理加价%）：网关按分组专属倍率多扣，前台报价同步放大，展示价 = 实扣价 */
export function applyPriceFactor(models: CatalogModel[], factor: number): CatalogModel[] {
  if (!(factor > 0) || factor === 1) return models;
  return models.map((m) => {
    const usd = m.priceUsd * factor;
    const price = m.price.replace(/¥([\d.]+)/, (_, n: string) => `¥${m.billingUnit === "per_1m_tokens" ? (Number(n) * factor).toFixed(2) : fmtYuan(Number(n) * factor)}`);
    // 档位价也要跟着代理加价走，否则按档估价会漏掉加价（2026-09-21）
    const tiers = m.priceTiers?.map((t) => ({ ...t, yuan: t.yuan * factor }));
    return { ...m, priceUsd: usd, price, priceTiers: tiers };
  });
}

/** 元价格展示：≥1 最多 3 位小数，<1 最多 4 位小数；去掉尾随 0 但至少保留 2 位。 */
function fmtYuan(v: number) {
  const s = Number(v.toFixed(v >= 1 ? 3 : 4)).toString();
  const [i, d = ""] = s.split(".");
  return `${i}.${d.padEnd(2, "0")}`;
}

/** 代理商在「模型管理」里禁用的模型（reseller.models.disabled）：目录默认隐藏它们。由 BrandProvider 加载配置后写入并使 catalog 查询失效。 */
const hiddenModelIds = new Set<string>();
export function setHiddenModels(ids: string[]) { hiddenModelIds.clear(); for (const id of ids) hiddenModelIds.add(id); }
export function isModelHidden(id: string) { return hiddenModelIds.has(id); }

/** 同一模型在多个渠道时，非默认渠道的售卖 id 带后缀（claude-opus-5-official、gpt-5.5-enterprise）。
 *  卡片沿用原模型，名称后加后缀标记好在平铺的模型下拉里区分。这里只是后缀的中文译名，没登记的后缀原样显示，
 *  所以在 new-api 里用新后缀接入也能直接用 */
const CHANNEL_SUFFIXES: Record<string, string> = { official: "官方", enterprise: "企业" };
/** 逐段去掉 id 末尾的「-xxx」直到找到卡片，返回卡片与去掉的后缀（最多去两段，避免把 gpt-image-2-c 这类退到太短的 id） */
function baseCardOf(id: string, byId: Map<string, RefModel>): [RefModel | undefined, string | undefined] {
  const parts = id.split("-");
  for (let cut = 1; cut <= 2 && parts.length - cut >= 2; cut++) {
    const hit = byId.get(parts.slice(0, -cut).join("-"));
    if (hit) return [hit, parts.slice(-cut).join("-")];
  }
  return [undefined, undefined];
}

/** 同一个对话模型在备用号池上的别名（claude-opus-5-official）：网关两个名字都认，
 *  但客户把密钥导出到第三方工具时该填标准名，所以别名不进目录。
 *  只对「标准名也在售的对话模型」生效——gpt-image-2-official、sora-2-official、
 *  seedance-2.0-480p-official 是上游各自独立的线路，不是别名，必须照常上架。
 *
 *  -enterprise 不在此列（2026-09-22 站长要求）：GPT 的两个号池是两条各自可选的线路，
 *  企业池要在侧边栏有自己的入口（渠道备注已写好说明），藏起来就只剩一张卡、看不出有两条。 */
const aliasOf = (id: string) => (/-official$/.test(id) ? id.replace(/-official$/, "") : null);

/** 分档计费表达式里的全部档位：`tier("2K", 79296 * …)` / `tier("快速", u("seconds") * 0.637)`。
 *  档名就是触发它的参数值（同步脚本 exprs.py 这样生成），所以估价时拿用户选中的参数值去对即可。
 *  只认 default 一档会让「选 1080p」这类非默认档报价差一倍（2026-09-21 审查查出）。 */
export interface PriceTier {
  name: string; yuan: number; perSecond: boolean;
  /** 这一档每一段读的参数名与判断方式（从表达式条件里解析），顺序与档名的段一致。
   *  neg = 该段写成「不属于其余取值」——也就是这一维的默认值那一支，参数缺省时它照样成立。 */
  dims?: { key: string; neg: boolean }[];
}

/** 从一段条件里解析出「读哪个参数、怎么判断」。
 *  http 表达式是 param("size")，任务表达式是 u("billing_resolution") / u("seconds")。
 *  n / count 是生成数量，乘在金额上而不是计费维度，必须排除，否则会混进维度列表。 */
function condDims(cond: string): { key: string; neg: boolean }[] {
  const found: { at: number; key: string; neg: boolean }[] = [];
  const name = (raw: string) => (raw === "seconds" ? "duration" : raw.replace(/^billing_/, ""));
  for (const re of [/!\((?:param|u)\("([^"]+)"\)\s+in\s+\[/g, /(?:param|u)\("([^"]+)"\)\s*==\s*"/g]) {
    const neg = re.source.startsWith("!");
    for (let m = re.exec(cond); m; m = re.exec(cond)) found.push({ at: m.index, key: name(m[1]), neg });
  }
  found.sort((a, b) => a.at - b.at);
  const out: { key: string; neg: boolean }[] = [];
  for (const f of found) if (f.key !== "n" && f.key !== "count" && !out.some((o) => o.key === f.key)) out.push({ key: f.key, neg: f.neg });
  return out;
}

export function priceTiers(expr: string, httpScaled: boolean): PriceTier[] {
  const out: PriceTier[] = [];
  const re = /tier\("([^"]*)",\s*(?:u\("seconds"\)\s*<\s*[\d.]+\s*\?\s*[\d.]+\s*:\s*)?(u\("seconds"\)\s*\*\s*)?([\d.]+)/g;
  let prev = 0;
  for (let m = re.exec(expr); m; m = re.exec(expr)) {
    const yuan = httpScaled ? Number(m[3]) / 1e6 : Number(m[3]);
    const dims = condDims(expr.slice(prev, m.index));   // 这一档的条件就在上一个 tier( 与本 tier( 之间
    prev = re.lastIndex;
    if (Number.isFinite(yuan) && yuan > 0) out.push({ name: m[1], yuan, perSecond: !!m[2], dims: dims.length ? dims : undefined });
  }
  return out;
}

/** 当前参数下真正会走的档位价（元）。参数值命中某个档名就用那档，否则用 default / 第一档。 */
export function tierPriceOf(m: Pick<CatalogModel, "priceTiers" | "priceUsd">, values: Record<string, unknown> | undefined): number {
  const tiers = m.priceTiers ?? [];
  if (!tiers.length || !values) return m.priceUsd;
  const picked = new Set(Object.values(values).filter((v) => typeof v === "string" || typeof v === "number").map(String));
  // 档名是各计费维度用 "|" 拼起来的，维度顺序固定（同步脚本 exprs.py："10|1080p"、"high|4K"）。
  //
  // 「每一段都要在用户的取值里」这条太严了：有的维度用户根本不选，我们也不发（gpt-image 的
  // quality），于是 high|4K 一个都匹配不上，报价停在 default ¥0.0413，网关却按 high|4K 扣
  // ¥0.0663 —— 少报多扣（2026-09-22 在 22 个出图模型 73 种组合上逐一比对查出 7 处）。
  //
  // 所以按「位置」判断：某一维用户选了值，该位就必须相等；没选就不约束。剩下多个候选时取最高的，
  // 宁可报价偏高也不能扣得比报价多（面板另有「最高」一行说明）。
  const named = tiers.filter((t) => t.name !== "default" && t.name);
  const fallback = tiers.find((t) => t.name === "default")?.yuan ?? m.priceUsd;
  // 档名每一段都在用户的取值里 —— 单维（"1080p"）和把每一维都拨过的多维都走这里
  const exact = named.find((t) => t.name.split("|").every((part) => picked.has(part)));
  if (exact) return exact.yuan;
  // 否则要按「档名第 i 段是哪个参数」来对，光看档名会猜错：gpt-image 的 quality 我们根本不发，
  // doubao-seedream 只列了 2k 那一半档。参数缺省时，网关走的是该维「取反」的那一支（默认值），
  // 没有这样一支就落到 default —— 2026-09-22 拿 22 个出图模型 73 种组合逐一比对过。
  const hits = named.filter((t) => {
    const parts = t.name.split("|"); const dims = t.dims;
    if (!dims || dims.length !== parts.length) return false;
    return parts.every((part, i) => {
      const v = values[dims[i].key];
      const s = typeof v === "string" || typeof v === "number" ? String(v) : undefined;
      return s === undefined ? dims[i].neg : s === part;
    });
  });
  const prices = [...new Set(hits.map((h) => h.yuan))];
  return prices.length === 1 ? prices[0] : fallback;
}

export function buildCatalog(pricing: PricingRow[], opts: { includeHidden?: boolean; sources?: Record<string, { tag: string; label: string }>; refs?: RefModel[] } = {}): CatalogModel[] {
  const sold = new Set(pricing.map((p) => p.model_name));
  // 上游快照 + 手工补充条目；extra-models.json 后写入，同 id 时以补充条目为准，
  // 这样快照重新生成也不会把手工补的元数据（图标/中文名/厂商/排序）弄丢。
  // opts.refs：同步任务落下的 taozi 最新卡片（/api/catalog/logical，只含经 taozi 路由的模型），排在提交的
  // 快照之后，同 id 以它为准——上游改了参数表或新接了模型，前台下一轮同步后就跟上。
  const refs = [...(refModels as unknown as { models: RefModel[] }).models, ...(opts.refs ?? [])];
  const extras = (extraModels as unknown as { models: RefModel[] }).models;
  const manual = (manualModels as unknown as { models: RefModel[] }).models;   // 非 aicost 的手工卡片（ccdan 文字模型等）
  const byId = new Map<string, RefModel>();
  for (const r of [...refs, ...extras, ...manual]) { byId.set(r.public_id, r); byId.set(r.id, r); }
  const out: CatalogModel[] = [];
  for (const p of pricing) {
    if (!opts.includeHidden && hiddenModelIds.has(p.model_name)) continue;
    // 只有「按 token 计费的对话模型」才可能是备用号池的别名：媒体线路一律带 tiered_expr
    // （gpt-image-2-official、sora-2-official 就是靠这条留在目录里的）。
    const base = aliasOf(p.model_name);
    if (!opts.includeHidden && base && sold.has(base) && !p.billing_expr && p.billing_mode !== "tiered_expr" && (p.quota_type ?? 0) === 0) continue;
    // 同一模型在另一渠道上的售卖 id（在 new-api 里加个后缀 + 模型映射即可，如 gpt-5.5-enterprise）沿用原模型卡片：
    // 逐段去掉末尾的「-xxx」找卡片。站长在 new-api 后台自己接入新渠道时不需要改前端代码
    let [ref, variant] = byId.has(p.model_name) ? [byId.get(p.model_name), undefined] : baseCardOf(p.model_name, byId);
    // 上游新上的 aicost 线路（seedance-2.5-480p-2 这类）会「撞」上相近线路的卡片（seedance-2.5-480p），
    // 借来的卡片会把它显示成「seedance2.5 · 480p · 2」、编号也记成 480p，和同组的另一条撞名。
    // 站长 2026-09-20 的要求是新线路一律按上游原名走，所以只有 official / enterprise 这类
    // 我们自己加的渠道后缀才准借卡片，其余能按上游名解析出系列的一律用原名。
    if (variant && !CHANNEL_SUFFIXES[variant] && seriesOfUpstream(p.model_name)) { ref = undefined; variant = undefined; }
    if (!opts.includeHidden && ref?.available === false) continue;
    const src = opts.sources?.[p.model_name];
    const endpoint = p.supported_endpoint_types?.[0] ?? "openai";
    // 自动接入的线路没有卡片：同步脚本让它的站点名就是上游原名，于是可以直接按名推导系列与编号，
    // 落进四类分组、hs 自动打「重点推荐」。只对**完全没有卡片**的行这么做：有卡片但没 upstream 的
    // 是 taozi 等其它家族（如 sora-2-official），按名推会把它们错归到 sora 系列。
    const auto = !ref ? seriesOfUpstream(p.model_name) : null;
    // 能按上游名识别出系列的无卡片行都是 aicost 视频线路（含 seedance3.0 / minimax-h4 这类新一代）
    const category: Modality = (ref?.category as Modality) ?? (auto || /^(seedance-2\.|minimax-h3-)/i.test(p.model_name) ? "video" : /tts|speech|voice|music|audio/i.test(p.model_name) ? "audio" : /image|flux|mj_|seedream|imagine-image/i.test(p.model_name) ? "image" : /video|seedance|kling|veo|sora|wan|vidu|pixverse|happyhorse|omni|hailuo|minimax-h3/i.test(p.model_name) ? "video" : "chat");
    const price = priceLabel(p, category);
    const AUTO_ICON: Record<string, [string, string]> = { seedance: ["doubao", "BYT"], sora: ["sora", "OPE"], "grok-imagine": ["grok", "XAI"], minimax: ["minimax", "MMX"] };
    // 按家族前缀取图标/厂商：minimax-h4、seedance3.0 这类新一代也能对上
    const autoMeta = auto ? Object.entries(AUTO_ICON).find(([k]) => auto.series.startsWith(k))?.[1] : undefined;
    const guess = !ref && !auto ? inferVendor(p.model_name) : undefined;   // 无卡片、非 aicost 自动线路：按名推断厂商/图标
    // Sora 系列（aicost 的 sora 线路、taozi 的 SR-2）一律用 Sora 自己的图标，不借 OpenAI 标志
    const iconKey = /^sora/i.test(p.model_name) ? "sora" : ref?.icon_key ?? (auto ? autoMeta?.[0] ?? "" : guess?.[2] ?? "");
    const baseName = ref?.display_name_zh ?? (auto ? `${auto.series} · ${auto.code}` : prettyName(p.model_name));
    // 官方渠道的同名模型在平铺列表（智能体、PPT 等的模型下拉）里要能和 kiro 渠道的区分开
    const name = variant ? `${baseName} · ${CHANNEL_SUFFIXES[variant] ?? variant}` : baseName;
    // aicost 线路的系列/编号由上游名推导；其余上百个模型沿用按展示名归类的旧规则。
    //
    // ⚠ 已知的中间态：32 条在售 aicost 线路里只有 13 条有卡片（也就只有这 13 条带 upstream），
    // 另外 19 条没有卡片，于是落回 seriesOf() 的旧正则，被归成「字节系列」「通用模型」「GK 系列」。
    // 后果是按 series 分组的界面（如 api-docs/sidebar.tsx）会同时出现新旧两套系列名。
    // 这是「无卡片线路先不补」这个产品决定的直接后果，不是 bug：补上卡片它们就会自动收敛。
    // 不要为此改 seriesOf() 去从售卖 id 猜系列——id 是 seedance-2.0-* 而上游是 seedance2.0-*，
    // 要多造一层规范化映射，且编号仍然只能从 upstream 推（从 id 推会切出 480p-discount 这种
    // 上游根本不存在的假编号）。
    const upstream = ref?.upstream ?? (auto ? p.model_name : undefined);
    const si = upstream ? seriesOfUpstream(upstream) : null;
    // aicost 线路：参数表不再用手写卡片（那是照 taozi 的模式抄的，首帧 / 首尾帧上游并不认），改由上游描述推导
    const caps = aicostCaps(p.model_name, upstream ?? p.model_name, p.description ?? "", ref?.param_schema);
    out.push({
      // 聊天模型按渠道分组（像 SD 那样先选渠道、再在渠道里选模型）：系列 = 渠道显示名，编号 = 模型名
      id: p.model_name, name, series: category === "chat" && src?.label ? src.label : si?.series ?? seriesOf(name, iconKey), seriesCode: category === "chat" && src?.label ? baseName : si?.code, upstream,
      // 促销字样取自上游描述原文，和 description 同源——上游撤下折扣，标记会在下一次同步后自动消失。
      promo: promoOf(p.description),
      // 重点推荐：hs 线路，以及视频主渠道的线路（卡片带 primary 标签，2026-10-01 起主渠道换成任务式上游）
      featured: (!!si?.code && /(^|-)hs(-|$)/.test(si.code)) || (ref?.tags ?? []).includes("primary"),
      vendor: ref?.provider ?? (auto ? autoMeta?.[1] ?? "" : guess?.[1] ?? ""),
      vendorLabel: VENDOR_LABELS[ref?.provider ?? (auto ? autoMeta?.[1] ?? "" : guess?.[1] ?? "")] ?? (ref?.provider ?? "其他"),
      // 描述的唯一真相是 /api/pricing（同步任务从 aicost 搬运，已把成本价改写成售价）。
      // 本地文件只在上游没给描述时兜底，否则手写副本会像 2026-09-16 之前那样与 aicost 长期不一致。
      // 空串也要回落，?? 不够：今天上游对无描述行是整个键缺席（实测无 "" 值），但这依赖 new-api
      // 的 omitempty 序列化，哪天上游改成非 omitempty 就会给出 ""，?? 不会短路，全站描述静默清空。
      //
      // ⚠ 这里展示的是 aicost 写给分销商看的原文，2026-09-17 逐条看过全部 32 条后明确选择照搬。
      // 里面确实有「网友反馈画质有点差，自行使用！！」「就是贵！」「需要提示词30元。联系管理」
      // 这类话，它们会出现在工作台 hero 大字块、侧边栏、价格弹窗和导出的 SKILL.md 里。这不是
      // 疏漏——**不要加文案过滤层，也不要在卡片里写回本地描述**（后者会被
      // test_cards_carry_no_description 拦下），那恰好会破坏「与上游一致」这个要求本身。
      // 代价是上游改文案会在一小时内自动上线，同步脚本的 warning 只打日志、不阻断。
      // 已逐条比对：32 条描述里出现的价格数字与各自 billing_expr 解出的售价一致，未泄露成本。
      category, description: (p.description?.trim() || ref?.description_zh) ?? "", icon: ICONS[iconKey] ?? "", tags: ref?.tags ?? [], capabilities: ref?.capabilities ?? [],
      health: ref?.health_score ?? 99, price: price.text, priceUsd: price.usd, billingUnit: price.unit, minSeconds: price.minSeconds,
      priceTiers: p.billing_mode === "tiered_expr" && p.billing_expr ? priceTiers(p.billing_expr, p.billing_expr.includes("param(") || /tier\("flat",/.test(p.billing_expr)) : undefined,
      groups: p.enable_groups ?? [], needsGroup: (p.enable_groups ?? []).length && !(p.enable_groups ?? []).includes("default") ? (p.enable_groups ?? [])[0] : undefined,
      aicost: caps, paramSchema: caps ? aicostSchema(caps, ref?.param_schema ?? {}) : ref?.param_schema ?? {}, inputHint: caps ? aicostHint(caps) : ref?.input_hint_zh, maxPromptChars: ref?.max_prompt_chars, sort: ref?.sort_weight ?? 0,
      // 优先渠道来自 new-api 渠道标签（/api/catalog/sources）；取不到时 aicost 线路仍可由能力推导识别
      // tag 来自 /api/catalog/sources，对外已脱敏成 p1/p2（p1 = 第一优先来源），这里只用它区分展示口径
      source: src?.tag === "ccdan" || src?.tag === "p1" ? "ccdan" : src?.tag === "aicost" || src?.tag === "p2" || caps ? "aicost" : undefined,
    });
    void endpoint;
    // 分组规则只在这里定义，侧栏 / 顶部下拉 / 线路健康 / API 密钥渠道选择都读 group，保证处处一致：
    //  · ccdan 聊天模型：按渠道（new-api 渠道备注）
    //  · 卡片自带 group 的（Seedance 任务式渠道的官转线路）：照卡片
    //  · aicost 视频线路：按系列 + 计费口径（¥/次 与 ¥/秒 不能并排，见 groupKeyOf 旧注释）
    //  · 其余：按厂商 + 类别（OpenAI · 图片、火山引擎 · 图片、Google · 视频…）
    const cm = out[out.length - 1];
    if (cm.category === "chat" && src?.label) { cm.group = channelName(src.label); cm.groupItem = baseName; }
    else if (ref?.group) { cm.group = ref.group; cm.groupItem = ref.group_item ?? baseName; }
    else if (si && cm.seriesCode) { const unit = cm.billingUnit === "per_second" ? "按秒" : cm.billingUnit === "per_request" ? "按次" : undefined; cm.group = unit ? `${cm.series} · ${unit}` : cm.series; cm.groupItem = cm.seriesCode; }
    else if (cm.vendor && VENDOR_LABELS[cm.vendor]) { cm.group = channelName(`${VENDOR_LABELS[cm.vendor]} · ${MODALITY_LABEL[cm.category]}`); cm.groupItem = name; }
  }
  // ccdan / aicost 两类优先渠道整体排在最前，组内仍按卡片权重
  return out.sort(compareCatalog);
}

export const MODALITY_LABEL: Record<Modality | "all" | "mine", string> = { all: "全部", chat: "聊天", image: "图片", video: "视频", audio: "音频", mine: "我的" };
