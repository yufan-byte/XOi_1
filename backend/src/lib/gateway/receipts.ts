import axios from "axios";
import { db } from "@/utils/db";
import { getGatewayRequestContext } from "./context";
import { BILLING_ID_PATTERN } from "../../../../shared/billableOperations";
import { BILLING_RECEIPT_QUERY } from "@/utils/billingReceiptQuery";
import { prepareBudgetedGatewayRequest, stopCurrentBudget } from "./budgets";
import { BillingBudgetError } from "@/utils/billingBudgetPolicy";
import { ModelConcurrency,acquireWithWait,capacityValue,releaseWhenResponseEnds } from "@/utils/modelConcurrency";
import { assertUpstreamOpen,recordUpstreamResult,upstreamKey,UpstreamBusyError } from "@/utils/upstreamBreaker";
import { requireGatewayUserId } from "./context";
import {markQueuedDispatch} from "@/lib/workspace/queueDispatch";
import { MediaRequestLinks } from "@/lib/workspace/mediaRequestLinks";
const mediaRequestLinks = new MediaRequestLinks(db);
const capacity=new ModelConcurrency(db,capacityValue("XOI_MODEL_GLOBAL_CONCURRENCY",32,2000),capacityValue("XOI_MODEL_USER_CONCURRENCY",3,20));
export const initializeGatewaySafety=()=>capacity.ensure();
let schema: Promise<unknown> | undefined;
function ensureSchema() {
  return schema ||= db.raw(`CREATE TABLE IF NOT EXISTS xoi_billing_links (
    user_id bigint NOT NULL, billing_id uuid NOT NULL, request_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,billing_id,request_id))
  `).catch(error => { schema = undefined; throw error; });
}
/** Observational only. Never mutate NewAPI quota and never infer a charge from balance changes. */
export async function recordGatewayRequest(requestId: unknown) {
  const context = getGatewayRequestContext();
  if (!context?.billingId || typeof requestId !== "string" || !requestId || requestId.length > 180) return;
  try {
    await ensureSchema();
    await db.raw("INSERT INTO xoi_billing_links(user_id,billing_id,request_id) VALUES (?,?,?) ON CONFLICT DO NOTHING", [context.userId, context.billingId, requestId]);
    if (context.mediaQueue) await mediaRequestLinks.record(context.userId, context.mediaQueue.kind, context.mediaQueue.taskId, requestId);
  } catch (error) { console.error("[billing-receipt] 无法记录关联，费用保持待核对：", (error as Error).message); }
}
export const trackedGatewayFetch: typeof fetch = async (...args) => {
  let release:(()=>Promise<void>)|undefined;
  let breakerKey:string|undefined;
  try {
  let request = new Request(...args);
  const taskSignal=getGatewayRequestContext()?.mediaQueue?.signal;
  if(taskSignal)request=new Request(request,{signal:AbortSignal.any([request.signal,taskSignal])});
  request.signal.throwIfAborted();
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.includes("application/json")) throw new BillingBudgetError("流式上传的模型费用尚不能可靠封顶，未提交收费请求");
    // 熔断检查放在 acquire 之前：上游已经在 429/5xx 时，不占并发额度、不抢锁、
    // 更不提交请求，直接把「稍后重试」还给用户。
    breakerKey=upstreamKey(request.url);
    assertUpstreamOpen(breakerKey);
    release=await acquireWithWait(capacity,requireGatewayUserId(),{signal:request.signal});
    request.signal.throwIfAborted();
    const bounded = await prepareBudgetedGatewayRequest(request.url,request.method,await request.clone().json());
    const headers = new Headers(request.headers); headers.set("Authorization",`Bearer ${bounded.apiKey}`); headers.delete("content-length");
    const queueSignal=getGatewayRequestContext()?.mediaQueue?.signal;
    request = new Request(request,{headers,body:JSON.stringify(bounded.body),signal:AbortSignal.any([request.signal,AbortSignal.timeout(5*60_000),...(queueSignal?[queueSignal]:[])])});
  }
  if(request.method==="POST")await markQueuedDispatch();
  const response = await fetch(request);
  if(breakerKey)recordUpstreamResult(breakerKey,response.status);
  await recordGatewayRequest(response.headers.get("x-oneapi-request-id") || response.headers.get("x-request-id"));
  // 只写「发生了什么」。费用结论由回执查询按真实账单补（前端 receipt 分支统一拼
  // 「费用待核对，请查积分明细。」），否则同一句话会在卡片里出现两遍。
  // 瞬态失败（429 限流、5xx 上游闪断）不停预算：new-api 对这类失败已经退款，
  // 预算单保持 active，前端自动重试才能带同一张预算单补发（每 fetch 有独立
  // X-Xoi-Billing-Step，不会重复提交同一步）。一旦这里停掉，重试会直接撞上
  // 「本轮文字预算已停止」，出现「上游已退款、用户却拿不到任何结果」的最坏体验。
  // 4xx 是确定性失败（参数/鉴权/余额），重试必然同样结果，仍立即停止。
  const transientUpstreamFailure = response.status === 429 || (response.status >= 500 && response.status < 600);
  if (request.method==="POST" && !response.ok && !transientUpstreamFailure) await stopCurrentBudget("本轮模型调用失败，已停止后续调用");
  return release?releaseWhenResponseEnds(response,release):response;
  } catch(error) {
    // 熔断本身触发的拒绝不算「上游又失败一次」，否则熔断会被自己的拒绝无限延长
    if(breakerKey && !(error instanceof UpstreamBusyError))recordUpstreamResult(breakerKey,null,error);
    await release?.().catch(()=>{});
    await stopCurrentBudget(error instanceof BillingBudgetError || error instanceof UpstreamBusyError ? error.message : "模型请求未正常完成，已停止后续调用");
    throw error;
  }
};
export function trackedGatewayAxios() {
  const client = axios.create();
  client.interceptors.request.use(async config=>{
    const taskSignal=getGatewayRequestContext()?.mediaQueue?.signal;
    if(taskSignal){taskSignal.throwIfAborted();config.signal=config.signal?AbortSignal.any([config.signal as AbortSignal,taskSignal]):taskSignal;}
    if (String(config.method||"get").toUpperCase() !== "POST") return config;
    let body = config.data;
    if (typeof body === "string") { try { body=JSON.parse(body); } catch { throw new BillingBudgetError("模型请求体无法验证预算"); } }
    if (!body || typeof body!=="object" || typeof body.getHeaders==="function" || Buffer.isBuffer(body)) throw new BillingBudgetError("该上传接口尚无可靠费用上限，未提交收费请求");
    let bounded;
    try {
      const breakerKey=upstreamKey(client.getUri(config));
      assertUpstreamOpen(breakerKey);
      (config as any).__xoiBreakerKey=breakerKey;
      (config as any).__xoiRelease=await acquireWithWait(capacity,requireGatewayUserId(),{signal:(config as any)?.signal});
      bounded = await prepareBudgetedGatewayRequest(client.getUri(config),"POST",body);
    }
    catch(error) { await (config as any).__xoiRelease?.().catch(()=>{});await stopCurrentBudget(error instanceof BillingBudgetError || error instanceof UpstreamBusyError ? error.message : "预算校验失败，已停止后续调用"); throw error; }
    config.data=bounded.body; config.headers.set("Authorization",`Bearer ${bounded.apiKey}`); config.headers.delete("content-length");
    // ⚠️ 这里不能用 AbortSignal.timeout 取代 axios 的 timeout：signal 中断抛出的
    //    CanceledError 文案是 "canceled"，业务层的「上游超时」识别（/timeout of \d+ms exceeded/）
    //    永远匹配不上，用户只会看到一句莫名的 canceled（实测 seedream 5 分钟整失败即此原因）。
    //    现在两个都留：axios timeout 负责给出标准超时文案，signal 负责真正掐断请求，
    //    并在 config 上标记 __xoiTimeoutSignal 供错误拦截器精确识别。
    const timeoutSignal = AbortSignal.timeout(600000);
    (config as any).__xoiTimeoutSignal = timeoutSignal;
    // 上限抬到 10 分钟：图编辑（seedream 5.0 等）实测可超 5 分钟，5 分钟必掐断等于功能不可用。
    config.timeout=Math.min(Number(config.timeout)||600000,600000);
    config.signal=config.signal?AbortSignal.any([config.signal as AbortSignal,timeoutSignal]):timeoutSignal;
    const queueSignal=getGatewayRequestContext()?.mediaQueue?.signal;if(queueSignal)config.signal=AbortSignal.any([config.signal as AbortSignal,queueSignal]);
    try { await markQueuedDispatch(); }
    catch(error) { await (config as any).__xoiRelease?.().catch(()=>{}); throw error; }
    return config;
  });
  client.interceptors.response.use(async response => {
    const release=(response.config as any).__xoiRelease;
    const breakerKey=(response.config as any).__xoiBreakerKey;
    if(breakerKey)recordUpstreamResult(breakerKey,response.status);
    if(response.data?.once&&response.config.responseType==="stream")for(const event of ["end","close","error"])response.data.once(event,()=>{void release?.().catch(()=>{});});
    else await release?.().catch(()=>{});
    await recordGatewayRequest(response.headers["x-oneapi-request-id"] || response.headers["x-request-id"]); return response;
  }, async error => {
    const breakerKey=error.config?.__xoiBreakerKey;
    if(breakerKey && !(error instanceof UpstreamBusyError))recordUpstreamResult(breakerKey,error.response?.status??null,error);
    await error.config?.__xoiRelease?.().catch(()=>{}); await recordGatewayRequest(error.response?.headers?.["x-oneapi-request-id"] || error.response?.headers?.["x-request-id"]); await stopCurrentBudget(error instanceof BillingBudgetError || error instanceof UpstreamBusyError ? error.message : "模型调用失败，已停止后续调用");
    // 超时被转成 CanceledError（文案 "canceled"）时，还原成可读的超时错误：
    // 上层据此走「超时 → 结果待核对 / 先查日志再重试」的既有分支，而不是当成普通失败。
    const timeoutSignal=(error.config as any)?.__xoiTimeoutSignal as AbortSignal|undefined;
    if (error && (error.code === "ERR_CANCELED" || error.name === "CanceledError") && timeoutSignal?.aborted) {
      const timeoutError: any = new Error("上游 10 分钟未返回结果（连接已中断）：任务可能仍在上游生成并已计费，请先到「绘图日志 / 任务日志」核对，确认没有出图再重新生成");
      timeoutError.code = "ECONNABORTED"; timeoutError.isTimeout = true; timeoutError.cause = error;
      throw timeoutError;
    }
    throw error; });
  return client;
}
export async function readBillingReceipt(userId: number, billingId: string) {
  if (!BILLING_ID_PATTERN.test(billingId)) throw new Error("计费记录号无效");
  await ensureSchema();
  const result = await db.raw(BILLING_RECEIPT_QUERY, [userId,billingId]);
  const entries = result.rows.map((row: any) => ({ id: String(row.id), quota: Number(row.quota), model: row.model_name, at: Number(row.created_at) }));
  return { billingId, status: entries.length ? "recorded" : "pending", quota: entries.reduce((sum: number, row: any) => sum + row.quota, 0), entries };
}
