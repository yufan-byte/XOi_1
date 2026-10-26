import { billingExpressionUpperBound } from "../lib/model-catalog/expression";
import { QUOTA_PER_YUAN } from "./creditUnits";
export const BUDGET_MAX_CALLS = 20;
// 输出上限：4096 时 DeepSeek 思考模型的思维链会把额度吃光，正文被截成空内容
// （实测 completion_tokens 恰好 4096、finish_reason=length）。放宽到 8192，上游实测可接受。
export const BUDGET_OUTPUT_TOKENS = 8192;
export const BUDGET_LIFETIME_MS = 30 * 60_000;
export const BUDGET_MAX_POINTS = 1000;
export class BillingBudgetError extends Error {
  code = "BUDGET_STOPPED";
  constructor(message: string) { super(message); this.name = "BillingBudgetError"; }
}
export function normalizeBudgetPath(path: string) { return path.split("?")[0].replace(/^\/api(?=\/)/i, "").replace(/\/$/, "").toLowerCase(); }
export function budgetCallLimit(path:string){return /^\/aiassistant\/director\/(plan|compose)$/.test(normalizeBudgetPath(path))?1:BUDGET_MAX_CALLS;}
export function budgetModelDecision(boundModel:string|null|undefined,actualModel:string,allowedModels?:unknown){if(allowedModels!==undefined&&allowedModels!==null&&(!Array.isArray(allowedModels)||!allowedModels.includes(actualModel)))return '当前模型不在本轮确认的组合中，请重新确认费用';return boundModel&&boundModel!==actualModel?"本轮只授权所确认的模型，禁止更换型号；请重新确认费用":undefined;}
/** Automatic consent is valid ONLY for a verifiably free, explicitly priced model. */
export function freeBudgetDecision(pricing:Record<string,any>,quota=0){
  return pricing.quota_type===1 && pricing.model_price===0 && !pricing.billing_expr && quota===0
    ? undefined : "模型已不是免费价格，已停止调用；收费操作需要先确认费用";
}
export function budgetDecision(row: {state:string;expires_at:string|Date;reserved_quota:number|string;limit_quota:number|string;calls:number;max_calls:number;automatic?:boolean}, quota: number, now = Date.now()) {
  if (row.state !== "active") return "本轮任务已停止，请重新确认预算后再继续";
  if (!Number.isFinite(new Date(row.expires_at).getTime()) || new Date(row.expires_at).getTime() <= now) return "本轮预算已到期，已停止后续模型调用";
  if (Number(row.calls) >= Number(row.max_calls)) return "已达到本轮模型调用次数上限，已停止后续调用";
  if (!Number.isSafeInteger(quota) || quota < 0) return "模型费用无法可靠预留，已停止调用";
  if (!row.automatic && Number(row.reserved_quota) + quota > Number(row.limit_quota)) return "剩余预算不足，已停止后续模型调用；继续需要重新确认";
}
/** Upper-bound reservation, NOT a debit. No refund/release on unknown settlement or failed transport. */
export function boundGatewayRequest(path: string, source: Record<string, any>, pricing: Record<string, any>, factor: number, cacheFactor = 1) {
  if (!/\/v1\/(chat\/completions|responses|images\/(generations|edits)|videos|audio\/speech)$/.test(path)) throw new BillingBudgetError("该模型接口尚未验证费用上限，未提交收费请求");
  // Only top-level output parameters are changed; avoid copying large reference images twice.
  const body = {...source};
  // DeepSeek 思考模型默认就思考；reasoning_effort=high 会被上游映射成超大思维链预算，
  // 连同正文一起吃光输出额度（finish_reason=length 且正文为空）。网关层统一剥离，
  // 旧版客户端或其他模块传进来也不再生效。
  if (/deepseek/i.test(String((pricing as any).model_name || ""))) {
    delete body.reasoning_effort; delete body.reasoning;
    // 省略 thinking 会回到上游默认思考，必须保留调用方显式关闭的意图。
    if (body.thinking?.type === "disabled") body.thinking = { type: "disabled" };
    else delete body.thinking;
  }
  const expression = String(pricing.billing_expr || "");
  if (/upstream_cost/.test(expression)) throw new BillingBudgetError("费用依赖未知上游实际成本，本次不自动调用");
  const n = Number(body.n ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 8 || !Number.isFinite(factor) || factor < 0) throw new BillingBudgetError("生成数量或计费倍率无法安全封顶");
  const text = /\/(chat\/completions|responses)$/.test(path);
  const video = /\/videos$/.test(path);
  const speech = /\/audio\/speech$/.test(path);
  const perRequest = pricing.quota_type === 1 || Number(pricing.model_price) > 0;
  if (/\/audio\/speech$/.test(path) && (typeof body.input!=="string" || body.input.length>10000)) throw new BillingBudgetError("语音需要明确的文本输入，最多 10000 字，请拆分内容");
  let inputTokens = 0;
  if (expression && !text) {
    // Image/audio output tokens are not controlled by chat's output limit.
    if (/\b(?:c|cr|cc|cc1h|len)\b(?!\s*\()/.test(expression) || (!speech && /\bp\b/.test(expression))) throw new BillingBudgetError("该媒体模型按 Token 用量结算，输出费用尚无可靠上限，未提交收费请求");
    if (speech) inputTokens=Buffer.byteLength(JSON.stringify(body.input),"utf8")*2+4096;
  }
  if (text) {
    if (n!==1) throw new BillingBudgetError("文本模型每次只允许一条输出，请拆分为独立任务");
    // Plain text is bounded by serialized UTF-8 bytes plus framing/tool overhead.
    // Non-text token inputs need an authoritative tokenizer/context bound first.
    const payload = JSON.stringify(body);
    const paidToken = !perRequest || !!expression;
    if (paidToken && /"type"\s*:\s*"(?:image|input_image|image_url|video|audio|input_audio)|"(?:image_url|audio_url|video_url)"\s*:/.test(payload)) throw new BillingBudgetError("参考图片、视频或音频的 Token 上限尚未验证，本次不自动调用；请改为纯文本或已支持的定价模型");
    if (body.web_search_options || body.audio || body.modalities?.some((item:string)=>item!=="text") || body.tools?.some((tool:any)=>tool.type!=="function")) throw new BillingBudgetError("内置搜索、音频等额外费用尚无可靠上限，本次不自动调用");
    if (paidToken && (body.previous_response_id || body.conversation || /"(?:file_id|file_url|file_data)"\s*:/.test(payload))) throw new BillingBudgetError("远程历史或文件的 Token 用量无法可靠封顶，请提交明确的纯文本内容");
    if (paidToken) for (const message of [...(Array.isArray(body.messages)?body.messages:[]),...(Array.isArray(body.input)?body.input:[])]) {
      const content=message?.content;
      if (content!==undefined && content!==null && typeof content!=="string" && (!Array.isArray(content) || content.some((part:any)=>!["text","input_text","output_text"].includes(part?.type) || typeof part.text!=="string"))) throw new BillingBudgetError("非文本内容的 Token 上限尚未验证，本次不自动调用");
    }
    const bytes = Buffer.byteLength(payload, "utf8");
    // 中文约 1 字 ≈ 1 token ≈ 3 字节：350KB 上限对应约 11.6 万 token，
    // 落在 DeepSeek 128K 上下文之内，同时给输出留余量。
    // 之前的 128KB（≈4.3 万汉字）比模型真实上下文小太多，画布长对话会被提前拦死。
    if (bytes > (paidToken ? 350_000 : 16 * 1024 * 1024)) throw new BillingBudgetError("上下文过长，无法在本轮预算内安全执行，请拆分内容");
    inputTokens = bytes * 2 + 4096;
    const requested = Number(body.max_completion_tokens ?? body.max_output_tokens ?? body.max_tokens ?? BUDGET_OUTPUT_TOKENS);
    if (!Number.isFinite(requested) || requested <= 0) throw new BillingBudgetError("输出长度参数无效");
    const output = Math.max(1, Math.min(BUDGET_OUTPUT_TOKENS, Math.floor(requested)));
    delete body.max_tokens; delete body.max_completion_tokens; delete body.max_output_tokens;
    if (/\/responses$/.test(path)) body.max_output_tokens = output;
    else if (source.max_completion_tokens !== undefined) body.max_completion_tokens = output;
    else body.max_tokens = output;
    if (/\/responses$/.test(path)) delete body.n;
    else body.n = n;
  }
  if (video) {
    const seconds = Number(body.seconds ?? body.duration);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) throw new BillingBudgetError("视频必须明确指定 1–60 秒时长，不能使用未知默认时长");
  }
  let yuan: number;
  if (expression) {
    const output = Number(body.max_completion_tokens ?? body.max_output_tokens ?? body.max_tokens ?? BUDGET_OUTPUT_TOKENS) * n;
    const bounds = {p:inputTokens,c:output,cr:inputTokens,cc:inputTokens,cc1h:inputTokens,len:inputTokens+output};
    const seconds = Number(body.seconds ?? body.duration ?? 0);
    // Reserve the most expensive possible task tier/reference surcharge. Submitted
    // parameters or model aliases must not trick us into under-reserving a fallback.
    const unknownTier = {low:0,high:1};
    const usage = {...(video?{seconds}:{}),billing_resolution:unknownTier,billing_quality:unknownTier,billing_mode:unknownTier,billing_ref_video:unknownTier,billing_generate_audio:unknownTier,billing_aspect_ratio:unknownTier,billing_model_variant:unknownTier,billing_tier:unknownTier};
    const params={...body,n,...Object.fromEntries(["resolution","size","quality","mode","tier","model_variant","generate_audio","aspect_ratio"].map(key=>[key,unknownTier]))};
    try { yuan = billingExpressionUpperBound(expression,bounds,params,usage) / (video ? 1 : 1_000_000); }
    catch {
      // 用户决策（2026-10-20）：静态封顶解释器覆盖不全时不再拦截模型请求。
      // 预留只是软校验；实际费用由本轮已确认预算令牌的 remain_quota 硬性约束（网关后扣），不会超出用户确认的额度。
      // 能按次定价的仍按次价预留；否则不预留（quota=0）放行。
      yuan = perRequest && Number.isFinite(Number(pricing.model_price)) ? Number(pricing.model_price) * n : 0;
    }
  } else if (perRequest) yuan = Number(pricing.model_price) * n;
  else {
    if (!text || !Number.isFinite(pricing.model_ratio) || !Number.isFinite(pricing.completion_ratio)) throw new BillingBudgetError("该接口缺少可验证的费用上限，暂不自动调用");
    yuan = Number(pricing.model_ratio) * 2 * (inputTokens * Math.max(1,cacheFactor) + Number(body.max_completion_tokens ?? body.max_output_tokens ?? body.max_tokens) * n * Number(pricing.completion_ratio)) / 1_000_000;
  }
  const amount = yuan * factor * QUOTA_PER_YUAN;
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 2) throw new BillingBudgetError("模型费用无法安全封顶");
  // NewAPI rounds integral quota; ceiling already bounds it, including the one-quota minimum.
  return {body,quota:Math.ceil(amount)};
}
