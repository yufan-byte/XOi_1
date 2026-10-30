import type { CatalogModel } from "@/lib/models";
import { authHeaders, sessionSignal } from "@/lib/session";
import { accountFetch, assertAccountSession } from "./request";

/**
 * 服务端目录默认模型 = 该类别列表的第一个（/api/model-catalog 已按推荐度排序）。
 * 此前文件里还有 fail-closed 的直连生成函数，现全部生成走
 * adapters/generation.tsx → 服务端 durable 任务，直连通道已废，不再保留。
 */
export const defaultChatModel = (models?: CatalogModel[]) => models?.find((m) => (m as { category?: string }).category === "chat");
export const defaultImageModel = (models?: CatalogModel[]) => models?.find((m) => (m as { category?: string }).category === "image");
export const defaultVideoModel = (models?: CatalogModel[]) => models?.find((m) => (m as { category?: string }).category === "video");
/** 音色模型 = audio 类且不是 suno/音乐/克隆/音色设计这类非 TTS 条目 */
export const isSpeechModel = (m: CatalogModel) => (m as { category?: string }).category === "audio" && !/suno|music|clone|design/i.test(String(m.id || ""));
export const defaultSpeechModel = (models?: CatalogModel[]) => models?.find(isSpeechModel);
/** 视觉优先：带视觉能力的对话模型（智能剪辑看画面用）；没有就退回普通对话模型 */
export const defaultVisionModel = (models?: CatalogModel[]) =>
  models?.find((m) => (m as { category?: string }).category === "chat" && /vision|vl\b|gpt-4o|gemini|glm-4v|omni/i.test(`${m.id} ${m.name ?? ""}`)) ?? defaultChatModel(models);

/* ---------- 客户端直连对话（智能剪辑的分析/方案用）：走 /api/canvas-llm + 平台预算单 ---------- */
export type MsgContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
export type Msg = { role: "system" | "user" | "assistant"; content: MsgContent };
export interface ChatResult { content: string }
type BudgetPreview = { label: string; model: string; modelId?: string; free?: boolean; quote?: { yuan: number } | null; budget: { defaultPoints: number; maxPoints: number; maxCalls: number; minutes: number } };
let llmBudget: { id: string; expiresAt: number; owner: string; model: string } | null = null;
// F3：凭据在 httpOnly cookie 里（或本页内存），手工拼 header 一律走 authHeaders()。
const token = () => sessionSignal();
async function llmApi<T>(path: string, init?: RequestInit & { billingId?: string }): Promise<T> {
  const owner = assertAccountSession();
  const res = await accountFetch(path, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), ...authHeaders(), "Content-Type": "application/json", ...(init?.billingId ? { "X-Xoi-Billing-Id": init.billingId } : {}) } });
  const body = await res.json().catch(() => null);
  assertAccountSession(owner);
  if (!res.ok || body?.success === false) throw new Error(body?.error || body?.message || `请求失败（${res.status}）`);
  return (body && typeof body === "object" && "data" in body && typeof body.data === "object" ? body.data : body) as T;
}
/** 预算确认：免费自动放行；付费弹一次原生 DOM 确认框（同一预算单内后续调用不再弹） */
/** innerHTML 插值用的 HTML 转义（模型名 / 报价里可能出现特殊字符） */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
function confirmBudget(preview: BudgetPreview): Promise<number | null> {
  return new Promise((resolve) => {
    document.getElementById("vs-llm-billing")?.remove();
    const overlay = document.createElement("div"); overlay.id = "vs-llm-billing";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#12131666;backdrop-filter:blur(4px)";
    const panel = document.createElement("section");
    panel.style.cssText = "width:min(420px,92vw);padding:24px;border:1px solid #dee1e8;border-radius:18px;background:#ffffff;color:#2e3138;font:14px/1.7 system-ui,'PingFang SC',sans-serif";
    const quote = typeof preview.quote?.yuan === "number" && preview.quote.yuan > 0 ? `单次参考约 ${(preview.quote.yuan * 10).toFixed(2)} 积分（¥${preview.quote.yuan}）` : "暂无完整预估，不代表免费";
    panel.innerHTML = `<h2 style="margin:0 0 10px;font-size:17px">${preview.label} · 费用确认</h2><p style="margin:6px 0">模型：${esc(preview.model)}</p><p style="margin:6px 0;color:#3858a4;font-weight:600">${esc(quote)}</p><label style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 0 4px;font-weight:600">本轮预算上限（积分）<input type="number" min="0.001" max="${preview.budget.maxPoints}" step="0.001" value="${preview.budget.defaultPoints}" style="width:110px;border:1px solid #ced2dc;border-radius:8px;padding:8px;font:inherit" /></label><p style="margin:6px 0;color:#7a7f8b;font-size:12px">这是安全上限不是预扣款；最多 ${preview.budget.maxCalls} 次调用，${preview.budget.minutes} 分钟内有效，仅按实际用量结算。1 元 = 10 积分。</p><footer style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button data-a="cancel" style="padding:9px 16px;border:1px solid #dee1e8;border-radius:10px;background:#ffffff;cursor:pointer;font:inherit">取消</button><button data-a="ok" style="padding:9px 16px;border:0;border-radius:10px;background:linear-gradient(135deg,#4f7be2,#3060cf);color:#ffffff;cursor:pointer;font:inherit">确认并继续</button></footer>`;
    overlay.append(panel); document.body.append(overlay);
    const input = panel.querySelector("input") as HTMLInputElement;
    const close = (v: number | null) => { overlay.remove(); resolve(v); };
    panel.querySelector('[data-a="cancel"]')!.addEventListener("click", () => close(null));
    panel.querySelector('[data-a="ok"]')!.addEventListener("click", () => { const v = Number(input.value); close(Number.isFinite(v) && v >= 0.001 && v <= preview.budget.maxPoints ? v : null); });
  });
}
async function ensureLlmBudget(model: string, inputLength: number, signal?: AbortSignal): Promise<string> {
  const owner = token();
  if (!owner) throw new Error("请先登录");
  if (llmBudget && llmBudget.owner === owner && llmBudget.model === model && Date.now() < llmBudget.expiresAt) return llmBudget.id;
  const preview = await llmApi<BudgetPreview>("/api/billing/preview", { method: "POST", body: JSON.stringify({ path: "/api/canvas-llm", body: { model, inputLength } }) });
  if (!preview?.budget) throw new Error("计费信息暂不可用，本次未调用");
  const freeOnly = preview.free === true && preview.quote?.yuan === 0 && !!preview.modelId;
  const points = freeOnly ? 0.001 : await confirmBudget(preview);
  if (points == null) throw new Error("已取消，未调用模型");
  signal?.throwIfAborted?.();
  assertAccountSession(owner);
  const authorized = await llmApi<{ id: string }>("/api/billing/authorize", { method: "POST", body: JSON.stringify({ path: "/api/canvas-llm", points, model: preview.modelId, freeOnly, automatic: freeOnly }) });
  if (!/^[0-9a-f-]{36}$/.test(authorized?.id || "")) throw new Error("预算授权失败，未调用模型");
  if (token() !== owner) throw new Error("账号已切换，请重新打开页面");
  llmBudget = { id: authorized.id, owner, model, expiresAt: Date.now() + Math.max(1, preview.budget.minutes - 1) * 60_000 };
  return authorized.id;
}
export async function chat(model: string, messages: Msg[], opts: { temperature?: number; signal?: AbortSignal; json?: boolean; reasoning_effort?: string } = {}): Promise<ChatResult> {
  // canvas-llm 的多模态形态是「单条 message + images 数组」：把图片部件从消息里拆出来，文本部件拼成 message
  const flat = (c: MsgContent) => typeof c === "string" ? { text: c, images: [] as string[] } : c.reduce<{ text: string; images: string[] }>((acc, part) => {
    if (part.type === "text") acc.text += (acc.text ? "\n" : "") + part.text;
    else acc.images.push(part.image_url.url);
    return acc;
  }, { text: "", images: [] });
  const inputLength = messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 40), 0);
  const billingId = await ensureLlmBudget(model, inputLength, opts.signal);
  const systems = messages.filter((m) => m.role === "system").map((m) => flat(m.content).text).filter(Boolean).join("\n");
  const rest = messages.filter((m) => m.role !== "system");
  const withImages = [...rest].reverse().find((m) => flat(m.content).images.length);
  const payload: Record<string, unknown> = { model };
  if (systems) payload.system_prompt = systems;
  if (withImages) {
    const f = flat(withImages.content);
    payload.message = f.text;
    payload.images = f.images;
    payload.messages = rest.filter((m) => m !== withImages).map((m) => ({ role: m.role, content: flat(m.content).text }));
  } else payload.messages = rest.map((m) => ({ role: m.role, content: flat(m.content).text }));
  const r = await llmApi<{ text?: string }>("/api/canvas-llm", { method: "POST", billingId, signal: opts.signal, body: JSON.stringify(payload) });
  return { content: r?.text ?? "" };
}
export function parseJson<T>(text: string): T {
  const raw = String(text ?? "").trim();
  const attempt = (s: string): T | undefined => { try { return JSON.parse(s) as T; } catch { return undefined; } };
  const direct = attempt(raw); if (direct !== undefined) return direct;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (fenced) { const v = attempt(fenced[1].trim()); if (v !== undefined) return v; }
  const first = raw.search(/[[{]/), lastBrace = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (first >= 0 && lastBrace > first) { const v = attempt(raw.slice(first, lastBrace + 1)); if (v !== undefined) return v; }
  throw new Error("模型没有返回有效 JSON，请重试");
}
