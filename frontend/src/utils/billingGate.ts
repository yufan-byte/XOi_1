import { billableOperation, canvasTextWorkflowPath } from "../../../shared/billableOperations";
import { formatPointsFromYuan, formatPoints, formatYuan, isValidYuan, yuanToPoints } from "./points";
import {checkDailySpendReminder} from './dailySpend';
import {authHeaders,sessionSignal,sessionUserId} from './session';
export type BillingPreview = { label: string; model: string; modelId?:string; free?:boolean; count: number; multiple?: boolean; quote?: { yuan: number } | null; basis?: string; budget?:{defaultPoints:number;maxPoints:number;maxCalls:number;maxOutputTokens:number;minutes:number} };
export type BillingTicket = { id: string; label: string; token: string; limitPoints?:number; freeOnly?:boolean; issuedAt?:number; automatic?:boolean };
export class BillingCancelled extends Error { constructor() { super("已取消模型调用，未提交收费请求"); this.name = "BillingCancelled"; } }
let rawFetch: typeof fetch;
let queue = Promise.resolve();
const completed = new Set<string>();
const approvedTickets = new Map<string, BillingTicket>();
const textWorkflows=new WeakMap<AbortSignal,{ticket?:BillingTicket;pending?:Promise<BillingTicket|undefined>;stop:()=>void;stopped:boolean}>();
const workflowStops=new Map<string,()=>void>();
/** Only related text requests share a budget; media retains explicit separate consent. */
export function beginCanvasTextBudget(signal:AbortSignal,stop:()=>void) {
  const scope={stop,stopped:false} as {ticket?:BillingTicket;pending?:Promise<BillingTicket|undefined>;stop:()=>void;stopped:boolean};
  textWorkflows.set(signal,scope);
  return ()=>{scope.stopped=true;if(scope.ticket)workflowStops.delete(scope.ticket.id);textWorkflows.delete(signal);};
}
function transport() { return rawFetch ||= globalThis.fetch.bind(globalThis); }
/**
 * F3：这里要的是「当前账号的信号」（比对请求期间有没有换号），不是凭据原文 ——
 * 凭据已进 httpOnly cookie，JS 读不到；手工拼 header 的地方统一用 authHeaders()。
 */
function accountSignal() { return sessionSignal(); }
// 低于该阈值（本轮预算上限，积分）的调用自动确认，不再弹费用确认弹窗；
// 只有花费超过阈值或计费出错时才提示。持久化在浏览器本地。
const AUTO_APPROVE_KEY = "xoiBillingAutoApprovePoints";
function approvalKey(){const id=sessionUserId();return /^[1-9]\d*$/.test(id)?`${AUTO_APPROVE_KEY}:${id}`:null;}
export function billingAutoApprovePoints() {
  const key=approvalKey(),stored = key?localStorage.getItem(key):null;
  if (stored === null) return 0;
  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
export function setBillingAutoApprovePoints(points: number) { const key=approvalKey();if (key && Number.isFinite(points) && points >= 0) localStorage.setItem(key, String(points)); }
export function billingPreviewText(preview: BillingPreview) {
  const price = preview.quote && isValidYuan(preview.quote.yuan) ? `${formatPointsFromYuan(preview.quote.yuan)}（${formatYuan(preview.quote.yuan)}）` : "暂无可靠完整预估，不代表免费";
  return `${preview.multiple ? "单次调用参考" : "本次参考预估"}：${price}`;
}
function injectStyle() {
  if (document.getElementById("xoi-billing-style")) return;
  const style = document.createElement("style"); style.id = "xoi-billing-style";
  style.textContent = `.xoi-billing-overlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:#17151166;backdrop-filter:blur(4px)}
  .xoi-billing-dialog{width:min(430px,100%);max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;padding:25px;border:1px solid #e9e4dd;border-radius:20px;background:#fff;color:#39332d;box-shadow:0 22px 80px #0003;font:14px/1.65 system-ui,"PingFang SC",sans-serif}.xoi-billing-dialog h2{margin:0 0 14px;font-size:18px}.xoi-billing-dialog p{margin:8px 0}.xoi-billing-dialog small{display:block;color:#8d8278;font-size:12px}.xoi-billing-dialog footer{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.xoi-billing-dialog button{padding:9px 16px;border:1px solid #e9e4dd;border-radius:10px;background:#fff;color:#645a50;font:inherit;cursor:pointer}.xoi-billing-dialog .primary{background:#28231e;color:#fff;border-color:#28231e}.xoi-billing-dialog button:disabled{opacity:.4;cursor:not-allowed}
  .xoi-billing-notice{position:fixed;right:18px;bottom:20px;z-index:2147482999;width:min(360px,calc(100vw - 36px));box-sizing:border-box;padding:12px 12px 12px 13px;border:1px solid #eae2d8;border-radius:16px;background:rgba(255,255,255,.94);backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);color:#4a423a;box-shadow:0 14px 38px #2b211612,0 2px 6px #2b21160a;font:13px/1.6 system-ui,"PingFang SC",sans-serif;display:flex;gap:10px;align-items:flex-start;animation:xoi-billing-in .22s cubic-bezier(.22,.61,.36,1) both;transition:opacity .2s ease,transform .2s ease}.xoi-billing-notice.is-leaving{opacity:0;transform:translateY(6px)}
  @keyframes xoi-billing-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
  .xoi-billing-notice .xoi-bn-dot{flex:none;width:7px;height:7px;border-radius:999px;margin-top:7px;background:#f57400;box-shadow:0 0 0 3px #f5740017}.xoi-billing-notice.is-recorded .xoi-bn-dot{background:#3f9d6b;box-shadow:0 0 0 3px #3f9d6b17}.xoi-billing-notice.is-clear .xoi-bn-dot{background:#b3a89c;box-shadow:0 0 0 3px #b3a89c17}
  .xoi-billing-notice .xoi-bn-body{min-width:0;flex:1}
  .xoi-billing-notice .xoi-bn-title{display:block;margin:0 0 2px;font-size:12px;font-weight:600;color:#7a6d5f;letter-spacing:.01em}
  .xoi-billing-notice p{margin:0;color:#4a423a;word-break:break-word}
  .xoi-billing-notice .xoi-bn-actions{display:flex;align-items:center;gap:10px;margin-top:7px}
  .xoi-billing-notice a{color:#c2611f;text-decoration:none;font-size:12px;font-weight:500}.xoi-billing-notice a:hover{color:#f57400}
  .xoi-billing-notice .xoi-bn-stop{border:0;background:none;padding:0;color:#9a8f84;font:inherit;font-size:12px;cursor:pointer}.xoi-billing-notice .xoi-bn-stop:hover{color:#6b5f52}
  .xoi-billing-notice .xoi-bn-close{flex:none;border:0;background:none;color:#a89e93;cursor:pointer;padding:0 2px;font-size:16px;line-height:1.1;border-radius:6px}.xoi-billing-notice .xoi-bn-close:hover{color:#6b5f52;background:#f4efe9}
  .xoi-billing-notice.is-compact{display:flex;align-items:center;gap:9px;width:auto;max-width:min(360px,calc(100vw - 36px));padding:8px 11px;border-radius:999px;box-shadow:0 8px 22px #2b21160f}.xoi-billing-notice.is-compact .xoi-bn-dot{margin-top:0}.xoi-billing-notice.is-compact .xoi-bn-title{display:none}.xoi-billing-notice.is-compact p{min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.xoi-billing-notice.is-compact .xoi-bn-actions{margin:0;flex:none;gap:8px}.xoi-billing-notice.is-compact a{font-size:12px}
  .xoi-billing-notice.is-embed{left:50%;right:auto;bottom:22px;transform:translateX(-50%);width:min(420px,calc(100vw - 40px))}.xoi-billing-notice.is-embed.is-leaving{transform:translateX(-50%) translateY(6px)}`;
  document.head.append(style);
}
function paragraph(text: string, tag = "p") { const node = document.createElement(tag); node.textContent = text; return node; }
function confirmPreview(preview: BillingPreview, signal?:AbortSignal): Promise<number | null> {
  if(signal?.aborted)return Promise.resolve(null);
  injectStyle();
  return new Promise(resolve => {
    const previous = document.activeElement as HTMLElement | null;
    const overlay = document.createElement("div"); overlay.className = "xoi-billing-overlay";
    const panel = document.createElement("section"); panel.className = "xoi-billing-dialog";
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", "模型调用费用确认");
    panel.append(paragraph(`${preview.label} · 费用确认`, "h2"), paragraph(`模型：${preview.model}`), paragraph(billingPreviewText(preview)));
    if (preview.count > 1) panel.append(paragraph(`共 ${preview.count} 项，累计计费，到达上限自动停止。`,"small"));
    const budget=preview.budget!;
    const cap=paragraph(`本轮最多 ${formatPoints(budget.defaultPoints)}（${formatYuan(budget.defaultPoints/10)}）`);panel.append(cap);
    panel.append(paragraph("这是安全上限，不是预扣款；仅按实际用量扣积分。","small"));
    const details=document.createElement("details");details.style.cssText="margin-top:12px;color:#8d8278;font-size:12px";
    const summary=document.createElement("summary");summary.textContent="调整上限 / 计费说明";summary.style.cursor="pointer";details.append(summary);
    const label=document.createElement("label"); label.textContent="本轮预算上限 "; label.style.cssText="display:flex;align-items:center;gap:10px;margin:16px 0 4px;font-weight:600";
    const input=document.createElement("input");input.type="number";input.min="0.001";input.max=String(budget.maxPoints);input.step="0.001";input.value=String(budget.defaultPoints);input.setAttribute("aria-label","本轮预算上限（积分）");input.style.cssText="width:100px;border:1px solid #ddd5cd;border-radius:8px;padding:8px;font:inherit;color:inherit";
    label.append(input,paragraph("积分","span"));details.append(label);
  // 自动确认阈值：低于该值（本轮预算上限，积分）的调用不再弹窗。
  const autoLabel=document.createElement("label"); autoLabel.textContent="自动确认阈值 "; autoLabel.style.cssText=label.style.cssText;
  const autoInput=document.createElement("input"); autoInput.type="number"; autoInput.min="0"; autoInput.step="0.1"; autoInput.value=String(billingAutoApprovePoints()); autoInput.style.cssText=input.style.cssText;
  autoInput.setAttribute("aria-label","自动确认阈值（积分）"); autoInput.onchange=()=>setBillingAutoApprovePoints(Number(autoInput.value));
  autoLabel.append(autoInput,paragraph("积分（低于此值的调用自动确认，不再弹窗）","span"));details.append(autoLabel);
    const value=paragraph("​","small");details.append(value);
    details.append(paragraph(`最多 ${budget.maxCalls} 次调用，${budget.minutes} 分钟内有效；达到上限自动停止。`,"small"), paragraph(preview.basis || "最终按实际用量结算。", "small"),paragraph("停止后不再发起新调用；已提交任务的费用请查积分明细。","small"));
    panel.append(details,paragraph("1 元 = 10 积分", "small"));
    const footer = document.createElement("footer"); const cancel = document.createElement("button"), accept = document.createElement("button");
    cancel.textContent = "取消"; accept.textContent = "确认并调用"; accept.className = "primary";
    let closed = false;
    const abort=()=>close(null);
    const close = (answer: number|null) => { if (closed) return; closed = true; signal?.removeEventListener("abort",abort); overlay.remove(); if(previous?.isConnected)previous.focus(); resolve(answer); };
    signal?.addEventListener("abort",abort,{once:true});
    const update=()=>{const points=Number(input.value),valid=Number.isFinite(points)&&points>=.001&&points<=budget.maxPoints;accept.disabled=!valid;cap.textContent=valid?`本轮最多 ${formatPoints(points)}（${formatYuan(points/10)}）`:"当前额度无法授权";value.textContent=valid?`最多授权 ${formatPoints(points)}（${formatYuan(points/10)}）；按最高费用保守预留，可能提前停止。`:`可授权额度不足或超出范围（可用 ${formatPoints(budget.maxPoints)}）。`;if(!valid)details.open=true;};
    input.oninput=update;update();
    cancel.onclick = () => close(null); accept.onclick = () => {if(!accept.disabled)close(Number(input.value));};
    overlay.onkeydown = event => { if (event.key === "Escape") {event.stopPropagation();close(null);} if (event.key === "Tab") { event.preventDefault(); const controls=[summary,...(details.open?[input]:[]),cancel,...(accept.disabled?[]:[accept])];const index=controls.indexOf(document.activeElement as any);controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus(); } };
    footer.append(cancel, accept); panel.append(footer); overlay.append(panel); document.body.append(overlay); cancel.focus();if(signal?.aborted)close(null);
  });
}
/** Send only pricing metadata; never duplicate uploaded binary/base64 data in the preview request. */
export function pricingBody(body: any) {
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (typeof FormData !== "undefined" && body instanceof FormData) body = Object.fromEntries([...body.entries()].filter(([,value]) => typeof value === "string"));
  const envelope = body && typeof body === "object" ? body : {};
  // 画布媒体任务（生图/生视频等）是信封结构：{ endpoint, ..., request: { model, prompt, ... } }，
  // model 在内层 request 里。统一解包，否则费用预检拿不到 model 直接 400。
  const input = typeof envelope.endpoint === "string" && envelope.request && typeof envelope.request === "object" ? {...envelope,...envelope.request} : envelope;
  const result: Record<string, any> = {};
  for (const key of ["model","modelName","textModel","projectId","resolution","size","quality","seconds","duration","videoDuration","aspect_ratio","mode","n","count","type"]) if (["string","number"].includes(typeof input[key])) result[key] = input[key];
  result.inputLength = String(input.prompt || input.content || input.input || input.intent || "").length;
  // 导演接口的场景已经是纯参数；预估只提交长度，不重复发送场景和对话内容。
  if (input.scene && typeof input.scene === "object") result.inputLength += JSON.stringify(input.scene).length;
  if (Array.isArray(input.history)) result.inputLength += input.history.reduce((sum:number,message:any)=>sum+(typeof message?.content === "string" ? message.content.length : 0),0);
  if (Array.isArray(input.messages)) result.inputLength += input.messages.reduce((sum: number, message: any) => sum + (typeof message?.content === "string" ? message.content.length : Array.isArray(message?.content) ? message.content.reduce((n: number, part: any) => n + (typeof part?.text === "string" ? part.text.length : 0), 0) : 0), 0);
  result.hasReferenceVideo = !!input.videos?.length || input.hasReferenceVideo === true;
  result.hasReferenceImage = !!input.images?.length || !!input.analysisImages?.length || !!input.analysisVideo || !!input.base64;
  for (const key of ["items","ids","assetIds","assetsIds","novelIds","storyboardIds","data","trackIds","trackData"]) if (Array.isArray(input[key])) result[key] = Array.from({length: Math.min(input[key].length, 10000)}, () => 0);
  return result;
}
async function cancelUnusedAuthorization(id:string){
  // F3：header 由 authHeaders() 给（内存有凭据才带），否则靠同源 cookie。
  try{await transport()(`/api/billing/budget/${id}/stop`,{method:"POST",headers:{...authHeaders()},signal:AbortSignal.timeout(5000)});}
  catch{ /* Authorization expires server-side; never infer a debit or retry the model. */ }
}
export async function authorizeModelCall(path: string, body: unknown, signal?: AbortSignal): Promise<BillingTicket | undefined> {
  if (!billableOperation(path)) return;
  if (signal?.aborted) throw new BillingCancelled();
  const token = accountSignal();
  if(!token)throw new BillingCancelled();
  const expectedUser=token.split(":")[0];
  const response = await transport()("/api/billing/preview", { method: "POST", headers: { ...authHeaders(), "X-Xoi-Expected-User":expectedUser, "Content-Type": "application/json" }, body: JSON.stringify({ path, body: pricingBody(body) }), signal });
  if (!response.ok) {
    // 把后端给的真实原因透出来（模型没配 / 登录过期 / 计费服务异常），别再一律糊成「暂不可用」
    let reason = "";
    try { reason = String((await response.json())?.message || ""); } catch { /* body 可能不是 JSON */ }
    if (response.status === 401) throw new Error("登录已过期，费用确认失败；请重新登录后再试");
    throw new Error(reason ? `费用确认失败：${reason}` : `计费信息暂不可用（HTTP ${response.status}），未提交模型请求，请稍后重试`);
  }
  const data = (await response.json()).data as BillingPreview;
  if (!data?.label || !data.model || !data.budget || !Number.isFinite(data.budget.maxPoints)) throw new Error("计费与预算信息不完整，未提交模型请求，请刷新页面");
  let accepted: number|null = null;
  let automatic = false;
  const freeOnly=data.free===true && data.quote?.yuan===0 && !!data.modelId;
  const confirmation = queue.then(async () => {
    if (signal?.aborted || accountSignal() !== token) return;
    if(freeOnly){
      if(data.budget!.maxPoints<.001)throw new Error("当前网关需要最低可用额度才能启动免费模型，暂不能提交；不会扣款，请联系平台处理。");
      // The server re-checks the authoritative price on authorization AND every actual call.
      accepted=.001;
    }else{
      // 只有用户主动设置了自动确认阈值，且可靠预估没有超过阈值时才静默授权。
      // 默认阈值为 0：所有付费模型调用都先让用户确认费用。
      const estimatedPoints = data.quote && isValidYuan(data.quote.yuan)
        ? yuanToPoints(data.quote.yuan) * Math.max(1, Number(data.count) || 1)
        : Number.NaN;
      const threshold = billingAutoApprovePoints();
      if (threshold > 0 && Number.isFinite(estimatedPoints) && estimatedPoints <= threshold) {
        accepted = data.budget!.defaultPoints;
        automatic = true;
      } else {
        accepted = await confirmPreview(data, signal);
      }
    }
  });
  queue = confirmation.catch(() => {}); await confirmation;
  if (accepted===null || signal?.aborted || accountSignal() !== token) throw new BillingCancelled();
  const authorization=await transport()("/api/billing/authorize",{method:"POST",headers:{...authHeaders(),"X-Xoi-Expected-User":expectedUser,"Content-Type":"application/json"},body:JSON.stringify({path,points:accepted,model:data.modelId,freeOnly,automatic}),signal});
  const result=await authorization.json();
  if (!authorization.ok || !/^[0-9a-f-]{36}$/.test(result?.data?.id)) throw new Error(result?.message || "预算授权失败，未提交模型请求");
  if(freeOnly && result.data.freeOnly!==true){await cancelUnusedAuthorization(result.data.id);throw new Error("免费调用保护未启用，未提交模型请求，请刷新或联系平台");}
  if (signal?.aborted || accountSignal()!==token){await cancelUnusedAuthorization(result.data.id);throw new BillingCancelled();}
  const ticket = { id: result.data.id as string, label: data.label, token,limitPoints:Number(result.data.limitPoints),freeOnly,issuedAt:Date.now(),automatic };
  if (approvedTickets.size > 500) approvedTickets.clear();
  approvedTickets.set(ticket.id, ticket);
  modelCallSubmitted(ticket);
  return ticket;
}
function notice(ticket: BillingTicket, message: string, state:"pending"|"recorded"|"not_submitted"="pending", points?:number) {
  if (accountSignal() !== ticket.token) return;
  const event=new CustomEvent("xoi:model-billing-state",{cancelable:true,detail:{id:ticket.id,label:ticket.label,message,state,points,freeOnly:ticket.freeOnly,issuedAt:ticket.issuedAt}});
  const inline=!window.dispatchEvent(event);
  if(document.getElementById("xoi-billing-notice")?.dataset.billingId===ticket.id)document.getElementById("xoi-billing-notice")?.remove();
  const compact=state==="recorded"&&Number.isFinite(points)&&!/(停止|到期|待核对)/.test(message);
  // 2026-10-27 用户口径：正常跑完的扣费、以及"已调用 X/20 次"这类进度，一律不要弹浮层
  // （扣费本身已有确认弹窗，Agent 面板也有状态）。浮层只留给"需要用户知道或处理"的场景：
  // 失败、被停止、预算到期、费用待核对、退回积分。
  const silent=state==="recorded"&&!/(失败|停止|到期|待核对|未完成|退回|异常)/.test(message);
  // Successful receipts are informational: keep them small and transient. Full cards are
  // reserved for failures/uncertain states where the user may actually need to intervene.
  if(!inline && !silent && (!ticket.automatic||!compact)){
  injectStyle(); document.getElementById("xoi-billing-notice")?.remove();
  // 画布是 iframe，右下角正好压着 Agent 输入框；嵌在 iframe 里时改到底部居中。
  const embed = window.parent !== window;
  const box = document.createElement("aside");
  box.className = `xoi-billing-notice${compact?" is-compact":""}${embed?" is-embed":""}${state==="recorded"?" is-recorded":""}${state==="not_submitted"?" is-clear":""}`;
  box.id = "xoi-billing-notice"; box.setAttribute("role", "status"); box.setAttribute("aria-live","polite"); box.dataset.billingId=ticket.id;
  let timer = 0;
  const dismiss = () => {
    window.clearTimeout(timer);
    if (!box.isConnected || box.classList.contains("is-leaving")) return;
    box.classList.add("is-leaving");
    window.setTimeout(() => box.remove(), 220);
  };
  const dot = document.createElement("span"); dot.className = "xoi-bn-dot";
  const body = document.createElement("div"); body.className = "xoi-bn-body";
  if(!compact){
    const title = document.createElement("span"); title.className = "xoi-bn-title";
    // 只说状态，不复述一遍费用结论（正文里已经有了）。
    title.textContent = state==="recorded" ? "费用已结算" : state==="not_submitted" ? "未发起模型调用" : "本轮未完成";
    body.append(title);
  }
  body.append(paragraph(`${ticket.label}：${message}`));
  const actions = document.createElement("div"); actions.className = "xoi-bn-actions";
  const link = document.createElement("a"); link.href = "/console/usage"; link.target = "_top"; link.textContent = compact?"明细":"查看积分明细 →";
  actions.append(link);
  // 只有真正还在跑的多步工作流才有"后续调用"可停；单次请求、以及已经失败/停止的轮次
  // 挂这个按钮只会让人以为还有东西在烧钱。
  if(workflowStops.has(ticket.id) && !/(失败|已停止|待核对)/.test(message)){
    const stop=document.createElement("button"); stop.type="button"; stop.className="xoi-bn-stop"; stop.textContent=compact?"停止":"停止后续调用";
    stop.onclick=async()=>{stop.disabled=true;workflowStops.get(ticket.id)?.();try{const response=await transport()(`/api/billing/budget/${ticket.id}/stop`,{method:"POST",headers:{...authHeaders()}});if(!response.ok)throw new Error();notice(ticket,"已停止后续模型调用；已提交任务可能仍会完成，实际费用请查积分明细。");}catch{stop.disabled=false;stop.textContent="停止失败，点击重试";}};
    actions.append(stop);
  }
  body.append(actions);
  box.append(dot, body);
  if(!compact){
    const close = document.createElement("button"); close.type="button"; close.className="xoi-bn-close"; close.textContent="×";
    close.setAttribute("aria-label","关闭通知"); close.onclick = () => dismiss();
    box.append(close);
  }
  document.body.append(box);
  // 通知只负责"告知"，不该长期钉在画面上：悬停暂停计时，移开后短暂延时自动收起。
  timer = window.setTimeout(dismiss, compact ? 4500 : 14000);
  box.addEventListener("mouseenter", () => window.clearTimeout(timer));
  box.addEventListener("mouseleave", () => { window.clearTimeout(timer); timer = window.setTimeout(dismiss, 2600); });
  }
  window.dispatchEvent(new Event("xoi:billing-updated"));
  void checkDailySpendReminder();
  if (window.parent !== window) window.parent.postMessage({ type: "xoi:billing-updated" }, window.location.origin);
}
export function modelCallSubmitted(ticket: BillingTicket | undefined, failed = false) {
  if (!ticket) return;
  if (completed.has(ticket.id)) {if(failed)notice(ticket,"提交未完成，费用状态待核对；请勿自动重发。");return;}
  completed.add(ticket.id); if (completed.size > 500) completed.clear();
  // 提交阶段不再弹右下角通知（2026-10-24 用户拍板）：Agent 面板已有生成状态与积分预估，
  // "正在生成"浮条只会挡住输入区。状态事件照常广播；失败/预算停止/费用异常仍会提示。
  if (failed) notice(ticket, "本次请求未完成，请查看原任务状态；费用以积分明细为准。");
  // No response amount is fabricated. Only correlated, user-scoped NewAPI logs can show actual usage.
  void (async () => {
    let lastRecordedPoints: number | undefined;
    let lastBudgetMessage="";
    for (const delay of [1500,3500,8000,15000,30000,60000,120000,180000]) {
      await new Promise(resolve => setTimeout(resolve, delay));
      if (accountSignal() !== ticket.token) return;
      try {
        const response = await transport()(`/api/billing/receipt/${ticket.id}`, { headers: { ...authHeaders() } });
        if (!response.ok) continue;
        const data = (await response.json()).data;
        const budget=data?.budget;
        if(data?.status==="not_submitted"){
          if(!ticket.freeOnly)notice(ticket,"本次未发起模型调用，未产生模型费用。","not_submitted",0);return;
        }
        if (budget?.state==="stopped" || (budget?.expiresAt && Date.parse(budget.expiresAt)<=Date.now())) {
          const key=`stopped:${budget.reason}:${data.status}:${data.points}`;
          if(lastBudgetMessage!==key){lastBudgetMessage=key;
            // 历史预算行里可能已经写着「费用待核对」，先剔掉再按真实回执补一句，避免同一句出现两遍。
            const reason=String(budget.reason||"").replace(/[；;，,]?\s*已?产生?费用待核对\s*。?/g,"").trim()||"本轮预算已到期，后续调用已停止";
            const tail=data.status==="recorded"?`账单已记录${data.points<0?"退回":"消耗"} ${formatPoints(Math.abs(data.points))}。`:/待核对/.test(reason)?"":"费用待核对，请查积分明细。";
            notice(ticket,`${reason}。${tail}`,data.status==="recorded"?"recorded":"pending",data.points);}continue;
        }
        if (data?.status === "recorded" && Number.isFinite(data.points)) {
          // 免费调用只在「真的产生了消耗 / 退回」时才提示；0 积分记账静默。
          if (ticket.freeOnly && data.points === 0) continue;
          if (data.points === lastRecordedPoints) continue;
          lastRecordedPoints = data.points;
          const message = data.points < 0 ? `已退回 ${formatPoints(Math.abs(data.points))} 积分` : `已消耗 ${formatPoints(data.points)} 积分`;
          notice(ticket, message,"recorded",data.points);
        }
        // 「已调用 X/20 次、剩余可预留预算」这类进度不再弹浮层：它不是异常，也不需要用户处理，
        // 却会一直悬在画布右下角挡输入框。状态照旧通过 xoi:model-billing-state 事件广播（见 notice 开头）。
      } catch { /* Keep honest pending state and the billing link. */ }
    }
  })();
}
/** Covers raw fetch paths, including inherited React image/video/audio/workflow services. */
export function installBillingFetchGuard() {
  const host = window as Window & { __xoiBillingGuard?: boolean };
  if (host.__xoiBillingGuard) return; host.__xoiBillingGuard = true;
  const original = transport();
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    if (url.origin !== window.location.origin || !billableOperation(url.pathname, method)) return original(input, init);
    const request = new Request(input, init);
    const ownerToken=accountSignal();
    const body = request.headers.get("content-type")?.includes("multipart/form-data") ? await request.clone().formData() : await request.clone().text();
    const sourceSignal=init?.signal || (input instanceof Request?input.signal:undefined);
    // canvas-agent 把调用方 signal 包进 AbortSignal.any；执行器在合并 signal 上挂了原引用，
    // 沿标记找回工作流预算，避免 Agent 循环里每步都单独弹费用确认。
    const workflowSignal=(sourceSignal as (AbortSignal&{__xoiWorkflowSignal?:AbortSignal})|undefined);
    const workflow=sourceSignal&&canvasTextWorkflowPath(url.pathname)?textWorkflows.get(workflowSignal?.__xoiWorkflowSignal??sourceSignal):undefined;
    if(workflow?.stopped)throw new BillingCancelled();
    const existing = approvedTickets.get(request.headers.get("x-xoi-billing-id") || "");
    const ticket = existing?.token === accountSignal() ? existing : workflow ? await (workflow.pending ||= authorizeModelCall("/workflow/canvas-text",body,request.signal).then(ticket=>{workflow.ticket=ticket;if(ticket)workflowStops.set(ticket.id,()=>{workflow.stopped=true;workflow.stop();});return ticket;})) : await authorizeModelCall(url.pathname, body, request.signal);
    if(workflow?.stopped||request.signal.aborted||accountSignal()!==ownerToken||(ticket&&ticket.token!==ownerToken)){if(ticket&&!workflow)await cancelUnusedAuthorization(ticket.id);throw new BillingCancelled();}
    const headers = new Headers(request.headers); if (ticket) headers.set("X-Xoi-Billing-Id", ticket.id);
    headers.set("X-Xoi-Expected-User",ownerToken.split(":")[0]);
    if(workflow&&ticket)headers.set("X-Xoi-Billing-Step",crypto.randomUUID());
    try { const response = await original(new Request(request, { headers })); if(accountSignal()!==ownerToken)throw new BillingCancelled(); modelCallSubmitted(ticket, !response.ok); return response; }
    catch (error) { modelCallSubmitted(ticket, true); throw error; }
  };
}
