import crypto from "node:crypto";
import { db } from "@/utils/db";
import { getGatewayRequestContext } from "./context";
import {allowedSceneImageUrl,sceneMediaOrigin} from '@/utils/director/sceneModels';
import {supportsBoundedQwenVision} from '@/utils/gptVisionBudget';
import { BILLING_ID_PATTERN, billableOperation, canvasTextWorkflowPath } from "../../../../shared/billableOperations";
import { BUDGET_LIFETIME_MS, BUDGET_MAX_CALLS, BUDGET_MAX_POINTS, BillingBudgetError, boundGatewayRequest, budgetCallLimit, budgetDecision, budgetModelDecision, directorBudgetDecision, freeBudgetDecision, normalizeBudgetPath } from "@/utils/billingBudgetPolicy";
import { QUOTA_PER_POINT, quotaToPoints } from "@/utils/creditUnits";
import { newApiV1BaseUrl,assertProductionModel,getUserGatewayCredentials } from "./newapi";
import { assertUserModelAccess, getUserCatalog } from "@/lib/model-catalog";
import { BUDGET_RESERVATION_QUERY } from "@/utils/budgetReservationQuery";
import { accountBudgetHold } from "@/utils/accountBudgetHold";
import {withSecuritySchemaLock} from "@/utils/securitySchema";
let schema: Promise<unknown> | undefined;
export function ensureBudgetSchema() {
  return schema ||= withSecuritySchemaLock(db,async trx=>{await trx.raw(`CREATE TABLE IF NOT EXISTS xoi_model_budgets (
    user_id bigint NOT NULL, billing_id uuid NOT NULL, operation_path text NOT NULL,
    limit_quota bigint NOT NULL CHECK(limit_quota>=0), reserved_quota bigint NOT NULL DEFAULT 0 CHECK(reserved_quota>=0),
    calls integer NOT NULL DEFAULT 0, max_calls integer NOT NULL,
    state text NOT NULL DEFAULT 'active', stop_reason text, pricing_hash text,
    token_id bigint, claimed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
    PRIMARY KEY(user_id,billing_id))`);
      await trx.raw("ALTER TABLE xoi_model_budgets ADD COLUMN IF NOT EXISTS bound_model text");
      await trx.raw("ALTER TABLE xoi_model_budgets ADD COLUMN IF NOT EXISTS free_only boolean NOT NULL DEFAULT false");
      await trx.raw("ALTER TABLE xoi_model_budgets ADD COLUMN IF NOT EXISTS allowed_models jsonb");
      await trx.raw("ALTER TABLE xoi_model_budgets ADD COLUMN IF NOT EXISTS automatic boolean NOT NULL DEFAULT false");
      await trx.raw("CREATE INDEX IF NOT EXISTS xoi_budget_account_active ON xoi_model_budgets(user_id,state,expires_at)");
      await trx.raw(`CREATE TABLE IF NOT EXISTS xoi_model_budget_steps(user_id bigint NOT NULL,billing_id uuid NOT NULL,step_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,billing_id,step_id))`);
      await trx.raw(`CREATE TABLE IF NOT EXISTS xoi_billing_links(user_id bigint NOT NULL,billing_id uuid NOT NULL,request_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,billing_id,request_id))`);
    }).catch(error=>{schema=undefined;throw error;});
}
export async function createModelBudget(userId: number, path: string, points: number, freeModel?: string, freeOnly=false,allowedModels?:string[],automatic=false,localOnly=false) {
  const directorDecision=directorBudgetDecision(path,automatic);if(directorDecision)throw new BillingBudgetError(directorDecision);
  const operation = billableOperation(path);
  if (!operation || !Number.isFinite(points) || points < 0 || (points > 0 && points < .001) || points > BUDGET_MAX_POINTS) throw new BillingBudgetError("收费预算必须为 0.001–1000 积分；明确免费模型可使用零预算");
  if (points === 0) {
    const model = String(freeModel || "").split("::").pop()!.replace(/^newapi:/, "");
    if (!model) throw new BillingBudgetError("零预算必须指定明确免费模型");
    const config = await currentPricing(userId,model);
    if (config.pricing.quota_type !== 1 || config.pricing.model_price !== 0 || config.pricing.billing_expr) throw new BillingBudgetError("当前模型不是可验证的免费模型，不能使用零预算");
    // NewAPI expires finite tokens with zero remaining quota before checking model prices.
    // Never work around this with an unlimited token or by crediting the user's balance.
    throw new BillingBudgetError("当前 NewAPI 不支持零额度令牌；免费模型请设置至少 0.001 积分预算，这只是额度上限，不扣款");
  }
  const requested=String(freeModel||"").split("::").pop()!.replace(/^newapi:/,"").trim();
  if(localOnly && (normalizeBudgetPath(path)!=='/workflow/one-stop'||!automatic||!freeOnly||requested||!Array.isArray(allowedModels)||allowedModels.length))throw new BillingBudgetError('本地媒体任务授权无效');
  if(allowedModels&&((!allowedModels.length&&!localOnly)||allowedModels.length>8||allowedModels.some(m=>typeof m!=='string'||!m||m.length>200)))throw new BillingBudgetError('授权模型列表无效');
  if(["prod","production"].includes(process.env.NODE_ENV||"")&&!requested&&(operation.multiple!==true||normalizeBudgetPath(path)==="/workflow/canvas-text"))throw new BillingBudgetError("单模型调用必须确认明确的模型型号，禁止空白授权");
  if(freeOnly&&!localOnly){
    const names=allowedModels||[requested];
    if(!names.every(Boolean))throw new BillingBudgetError("免费调用必须指定明确的模型");
    for(const name of names){const reason=freeBudgetDecision((await currentPricing(userId,name)).pricing);if(reason)throw new BillingBudgetError(reason);}
    if(points!==.001)throw new BillingBudgetError("免费调用只使用系统最小额度，不需要设置收费预算");
  }
  const boundModel=requested&&(freeOnly||operation.multiple!==true||normalizeBudgetPath(path)==="/workflow/canvas-text")?requested:null;
  if(boundModel){
    const catalog=await getUserCatalog(userId);
    if(!catalog.models.some(m=>m.modelName===boundModel&&m.selectable))throw new BillingBudgetError("确认的模型当前不可用，未授权任何调用");
  }
  await ensureBudgetSchema();
  return db.transaction(async trx=>{
  const user = await trx("users").where("id",userId).select("quota","status").forUpdate().first();
  if (!user || Number(user.status)!==1) throw new BillingBudgetError("当前账号不可用");
  const limit = automatic ? 100000 * QUOTA_PER_POINT : Math.floor(points * QUOTA_PER_POINT);
  const held=automatic?0:await accountBudgetHold(trx,userId,process.env.XOI_NEWAPI_QUOTA_MODE==="sync");
  const available = Math.max(0,Number(user.quota)-held);
  if (automatic) {
    // 一站式批量任务不逐轮预占，但仍必须至少有一分钱余额：
    // 否则余额耗尽后还能无限创建 automatic 预算，整条扣费完全依赖网关后扣，
    // 遇到免费/零价模型或后扣滞后就会被当成免费额度反复薅。
    if (available <= 0) throw new BillingBudgetError(`积分余额不足（当前 ${quotaToPoints(Number(user.quota)).toFixed(2)} 积分），请先充值或让管理员发放积分后再生成；本次未提交模型请求`);
  } else if (limit > available) {
    // 余额为 0 时说「被其他任务占用」会误导用户去找不存在的任务；把两种情况分开说清楚
    const balancePoints = quotaToPoints(Number(user.quota)), heldPoints = quotaToPoints(held);
    throw new BillingBudgetError(
      balancePoints <= 0.01
        ? `积分余额不足（当前 ${balancePoints.toFixed(2)} 积分），请先充值或让管理员发放积分后再生成；本次未提交模型请求`
        : heldPoints > 0.01
          ? `其他任务或待核对账单占用了预算（已占用 ${heldPoints.toFixed(2)} 积分，余额 ${balancePoints.toFixed(2)} 积分）；本轮预算不能超过剩余可授权积分，请停止不用的任务或核对账单`
          : `本轮预算上限 ${points} 积分超过当前余额 ${balancePoints.toFixed(2)} 积分，请调低上限或充值后再试；本次未提交模型请求`,
    );
  }
  const active = await trx.raw("SELECT count(*) AS count FROM xoi_model_budgets WHERE user_id=? AND state='active' AND expires_at>now() AND free_only=false AND automatic=false",[userId]);
  if (!automatic && !freeOnly && Number(active.rows[0].count)>=20) throw new BillingBudgetError("未使用的预算确认过多，请稍后重试");
  const id = crypto.randomUUID(), expiresAt = new Date(Date.now()+(automatic?2*60*60_000:BUDGET_LIFETIME_MS)),maxCalls=automatic?1000:budgetCallLimit(path),limitQuota=automatic?limit:Math.min(limit,available);
  await trx.raw("INSERT INTO xoi_model_budgets(user_id,billing_id,operation_path,limit_quota,max_calls,expires_at,bound_model,free_only,allowed_models,automatic) VALUES (?,?,?,?,?,?,?,?,?::jsonb,?)",[userId,id,normalizeBudgetPath(path),limitQuota,maxCalls,expiresAt,boundModel,freeOnly,allowedModels?JSON.stringify(allowedModels):null,automatic]);
  return {id,limitPoints:automatic?undefined:quotaToPoints(limitQuota),maxCalls,expiresAt,freeOnly,automatic};
  });
}
export async function claimModelBudget(userId:number,id:string,path:string,stepId?:string) {
  if (!BILLING_ID_PATTERN.test(id)) throw new BillingBudgetError("请先确认本轮预算");
  await ensureBudgetSchema();
  if(stepId) {
    if(!BILLING_ID_PATTERN.test(stepId)||!canvasTextWorkflowPath(path))throw new BillingBudgetError("工作流调用编号或接口无效");
    return db.transaction(async trx=>{
      const result=await trx.raw("SELECT * FROM xoi_model_budgets WHERE user_id=? AND billing_id=? FOR UPDATE",[userId,id]);
      const row=result.rows[0];
      if(!row||row.operation_path!=="/workflow/canvas-text"||budgetDecision(row,0))throw new BillingBudgetError("本轮文字预算已停止、到期或不属于此工作流");
      const count=await trx.raw("SELECT count(*) AS count FROM xoi_model_budget_steps WHERE user_id=? AND billing_id=?",[userId,id]);
      if(Number(count.rows[0].count)>=Number(row.max_calls))throw new BillingBudgetError("本轮文字请求数量异常，已暂停以防误触发，请联系管理员");
      const inserted=await trx.raw("INSERT INTO xoi_model_budget_steps(user_id,billing_id,step_id) VALUES (?,?,?) ON CONFLICT DO NOTHING RETURNING step_id",[userId,id,stepId]);
      if(!inserted.rows.length)throw new BillingBudgetError("工作流请求已提交，不会自动重复调用");
      await trx.raw("UPDATE xoi_model_budgets SET claimed_at=coalesce(claimed_at,now()) WHERE user_id=? AND billing_id=?",[userId,id]);
    });
  }
  const result = await db.raw("UPDATE xoi_model_budgets SET claimed_at=now() WHERE user_id=? AND billing_id=? AND operation_path=? AND (? OR automatic=false) AND claimed_at IS NULL AND state='active' AND expires_at>now() RETURNING billing_id",[userId,id,normalizeBudgetPath(path),budgetCallLimit(path)!==1]);
  if (!result.rows.length) throw new BillingBudgetError("预算已使用、停止或不属于本次操作，请重新确认；不会自动重试");
}
export async function stopModelBudget(userId:number,id:string) {
  if (!BILLING_ID_PATTERN.test(id)) throw new BillingBudgetError("预算编号无效");
  await ensureBudgetSchema();
  const result = await db.raw("UPDATE xoi_model_budgets SET state='stopped',stop_reason='用户已停止后续调用' WHERE user_id=? AND billing_id=? RETURNING billing_id",[userId,id]);
  if (!result.rows.length) throw new BillingBudgetError("未找到本账号的任务预算");
  await (await import("@/lib/workspace/mediaQueueRuntime")).mediaQueue.cancelBudget(userId,id);
}
export async function stopCurrentBudget(reason:string) {
  const context=getGatewayRequestContext();
  if (!context?.billingId) return;
  await ensureBudgetSchema();
  // A failed item must not cancel all siblings in a normal automatic batch.
  await db.raw("UPDATE xoi_model_budgets SET state='stopped',stop_reason=? WHERE user_id=? AND billing_id=? AND state='active' AND automatic=false",[reason.slice(0,300),context.userId,context.billingId]);
}
/** Cheap early stop, before loading vendor templates or repeatedly preparing large media. */
export async function assertCurrentBudgetOpen() {
  const context=getGatewayRequestContext();
  if(!context?.billingId)throw new BillingBudgetError("模型调用缺少本轮预算，请确认后再试");
  await ensureBudgetSchema();
  const result=await db.raw("SELECT state,expires_at,reserved_quota,limit_quota,calls,max_calls,claimed_at,automatic FROM xoi_model_budgets WHERE user_id=? AND billing_id=?",[context.userId,context.billingId]);
  const row=result.rows[0];
  if(!row?.claimed_at)throw new BillingBudgetError("预算未确认或不属于当前账号");
  const reason=budgetDecision(row,0);
  if(reason){await stopCurrentBudget(reason);throw new BillingBudgetError(reason);}
}
export async function readModelBudget(userId:number,id:string) {
  if (!BILLING_ID_PATTERN.test(id)) throw new BillingBudgetError("预算编号无效");
  await ensureBudgetSchema();
  const result = await db.raw("SELECT state,stop_reason,limit_quota,reserved_quota,calls,max_calls,expires_at,automatic FROM xoi_model_budgets WHERE user_id=? AND billing_id=?",[userId,id]);
  const row = result.rows[0];
  return row ? {state:row.state,reason:row.stop_reason,automatic:row.automatic===true,limitPoints:row.automatic?undefined:quotaToPoints(Number(row.limit_quota)),reservedPoints:row.automatic?undefined:quotaToPoints(Number(row.reserved_quota)),remainingPoints:row.automatic?undefined:quotaToPoints(Math.max(0,Number(row.limit_quota)-Number(row.reserved_quota))),calls:Number(row.calls),maxCalls:Number(row.max_calls),expiresAt:row.expires_at} : null;
}
/** Read the authoritative options, not the public catalog's 30-second price cache. */
async function currentPricing(userId:number,model:string) {
  const options = await db.raw("SELECT key,value FROM options WHERE key IN ('ModelPrice','ModelRatio','CompletionRatio','CacheRatio','CreateCacheRatio','CreateCacheRatio1h','GroupRatio','GroupGroupRatio','billing_setting.billing_expr','billing_setting.billing_mode') ORDER BY key");
  const maps = Object.fromEntries(options.rows.map((row:any)=>[row.key,JSON.parse(row.value||"{}")]));
  const user = await db("users").where("id",userId).whereNull("deleted_at").select("group","status").first();
  if (!user || Number(user.status)!==1) throw new BillingBudgetError("账号不可用，已停止模型调用");
  const group = String(user.group||"default");
  let factor = Number(maps.GroupGroupRatio?.[group]?.[group] ?? maps.GroupRatio?.[group]);
  if (!Number.isFinite(factor)) {
    // NewAPI built-in defaults (including VIP) may not have an options row.
    // Read its real runtime group ratio rather than assuming a free/default rate.
    const response=await fetch(`${newApiV1BaseUrl().replace(/\/v1$/,"")}/api/pricing`,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new BillingBudgetError("分组价格暂不可用，未提交模型请求");
    factor=Number((await response.json()).group_ratio?.[group]);
    if(!Number.isFinite(factor))throw new BillingBudgetError("当前分组没有可靠价格，未提交模型请求");
  }
  const hasPrice = Object.prototype.hasOwnProperty.call(maps.ModelPrice||{},model);
  const expression = maps["billing_setting.billing_expr"]?.[model];
  const mode = maps["billing_setting.billing_mode"]?.[model];
  if (!hasPrice && !expression && maps.ModelRatio?.[model]===undefined) throw new BillingBudgetError("该模型没有可验证的预算价格，未提交请求");
  if (expression && mode !== "tiered_expr") throw new BillingBudgetError("该计费模式尚未验证预算边界，未提交请求");
  const pricing = {model_name:model,quota_type:hasPrice?1:0,model_price:maps.ModelPrice?.[model],model_ratio:maps.ModelRatio?.[model],completion_ratio:maps.CompletionRatio?.[model]??1,billing_expr:expression};
  const cacheFactor = Math.max(1,...["CacheRatio","CreateCacheRatio","CreateCacheRatio1h"].map(key=>Number(maps[key]?.[model]??1)));
  return {pricing,factor,cacheFactor,group,hash:crypto.createHash("sha256").update(JSON.stringify({options:options.rows,group,factor})).digest("hex")};
}
/** Persist before network I/O. Pessimistic reservations are never released on missing/late logs. */
export async function prepareBudgetedGatewayRequest(url:string,method:string,body:Record<string,any>) {
  const context = getGatewayRequestContext();
  if (!context?.billingId) throw new BillingBudgetError("模型调用缺少本轮预算，请确认后再试");
  await assertCurrentBudgetOpen();
  const base = new URL(newApiV1BaseUrl()), target = new URL(url);
  if (target.origin!==base.origin || !target.pathname.startsWith(base.pathname.replace(/\/$/,"")+"/")) throw new BillingBudgetError("模型请求不在受控网关范围内");
  const model = String(body.model||"");
  assertProductionModel(model);
  if (!model || method.toUpperCase()!=="POST") throw new BillingBudgetError("模型预算参数无效");
  if (/^seedance2\.[05]-line1(?:-fast)?-xoi$/i.test(model)) {
    const resolution = String(body.resolution ?? "").toLowerCase().replace(/^(480|720|1080)$/, "$1p");
    if (!["480p", "720p"].includes(resolution)) throw new BillingBudgetError("该专线此清晰度的计费尚未核实，未提交模型请求");
  }
  try { await assertUserModelAccess(context.userId, model); }
  catch (error) { throw new BillingBudgetError((error as Error).message); }
  const config = await currentPricing(context.userId,model);
  const credential=await getUserGatewayCredentials(context.userId);
  await ensureBudgetSchema();
  const mode=(await db.raw('SELECT automatic,operation_path FROM xoi_model_budgets WHERE user_id=? AND billing_id=?',[context.userId,context.billingId])).rows[0];
  const directorDecision=directorBudgetDecision(mode?.operation_path||'',mode?.automatic===true);if(directorDecision)throw new BillingBudgetError(directorDecision);
  let bounded;
  let allowRemoteImage:((url:string)=>boolean)|undefined;
  if(supportsBoundedQwenVision(model)&&JSON.stringify(body.messages||[]).includes('https:')){
    const key=await db('o_setting').where({key:'tokenKey'}).first('value');
    const origin=sceneMediaOrigin();
    allowRemoteImage=url=>allowedSceneImageUrl(url,context.userId,String(key?.value||''),origin);
  }
  try{bounded=boundGatewayRequest(target.pathname,body,config.pricing,config.factor,config.cacheFactor,allowRemoteImage);}
  catch(error){
    if(!mode?.automatic)throw error;
    const n=Number(body.n??1),output=Number(body.max_tokens??body.max_completion_tokens??body.max_output_tokens??8192);
    if(!Number.isFinite(n)||n<1||n>1000||!Number.isFinite(output)||output<1||output>131072)throw new BillingBudgetError('请求数量或输出长度异常，未提交；请联系管理员核对');
    bounded={body:{...body},quota:0}; // Unknown estimate is not a zero charge; gateway wallet/logs remain authoritative.
  }
  const result = await db.transaction(async trx=>{
    const job=context.mediaQueue;
    const queueRow=job?await trx("xoi_media_queue").where({kind:job.kind,task_id:job.taskId,user_id:context.userId,lease_token:job.leaseToken,worker_id:job.workerId}).forUpdate().first():undefined;
    if(job&&(!queueRow||queueRow.state!=="running"||Number(queueRow.lease_until)<=Date.now()||job.signal?.aborted))return {error:"任务已取消或执行租约失效，未提交上游"};
    const found = await trx.raw("SELECT * FROM xoi_model_budgets WHERE user_id=? AND billing_id=? FOR UPDATE",[context.userId,context.billingId!]);
    const row = found.rows[0];
    if (!row || !row.claimed_at) return {error:"预算尚未确认或不属于当前账号"};
    const modelReason=budgetModelDecision(row.bound_model,model,row.allowed_models);if(modelReason)return {error:modelReason};
    const reason = (row.free_only ? freeBudgetDecision(config.pricing,bounded.quota) : undefined) || budgetDecision(row,row.automatic?0:bounded.quota) || (!row.automatic && row.pricing_hash && row.pricing_hash!==config.hash ? "计费规则已更新，已停止本轮任务，请重新确认预算" : undefined);
    if (reason) { await trx.raw("UPDATE xoi_model_budgets SET state='stopped',stop_reason=? WHERE user_id=? AND billing_id=?",[reason,context.userId,context.billingId!]); return {error:reason}; }
    if(row.automatic){
      if(bounded.quota>100000*QUOTA_PER_POINT)return {error:'单次请求估算超过一万元，疑似异常大额请求，未提交；请联系管理员核对'};
      await trx.raw('UPDATE xoi_model_budgets SET calls=calls+1,pricing_hash=? WHERE user_id=? AND billing_id=?',[config.hash,context.userId,context.billingId!]);
      if(queueRow)await trx('xoi_media_queue').where('id',queueRow.id).update({dispatch_started_at:queueRow.dispatch_started_at??Date.now()});
      // Normal requests use the existing account-scoped gateway wallet, not a guessed per-task escrow.
      return {apiKey:credential.apiKey};
    }
    // 与造物一致：直接用账号级网关令牌（不限额度），不再为每轮任务新建临时预算令牌。
    // new-api 会按「预估消耗」预扣，临时令牌那点额度在长上下文下会被判成 402「余额不足」，
    // 而造物的做法就是拿用户自己的 sk- 走 /v1/*，额度控制全在自己代码里做。
    if (!credential.apiKey) return {error:"账号网关凭据不可用，请联系平台核对"};
    await trx.raw("UPDATE xoi_model_budgets SET reserved_quota=reserved_quota+?,calls=calls+1,pricing_hash=? WHERE user_id=? AND billing_id=?",[bounded.quota,config.hash,context.userId,context.billingId!]);
    if(queueRow)await trx("xoi_media_queue").where("id",queueRow.id).update({dispatch_started_at:queueRow.dispatch_started_at??Date.now()});
    return {apiKey:credential.apiKey};
  });
  if (result.error || !result.apiKey) throw new BillingBudgetError(result.error||"预算不可用");
  return {body:bounded.body,apiKey:result.apiKey};
}
