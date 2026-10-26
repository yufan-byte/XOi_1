import crypto from "node:crypto";
import type { Knex } from "knex";

export interface DurableQuotaInput {
  userId:number;delta:number;type:string;idempotencyKey?:string;operatorId?:number;
  description?:string;referenceType?:string;referenceId?:string;
}
export class QuotaOperationError extends Error {
  constructor(message:string,public status=409){super(message);this.name="QuotaOperationError";}
}
/** At most one external attempt. Unknown outcomes require reconciliation, never automatic retry. */
export class QuotaOperations {
  private ready?:Promise<void>;
  constructor(private db:Knex,private adjust:(uid:number,delta:number)=>Promise<number|null>){}
  ensure(){return this.ready ||= this.db.schema.hasTable("xoi_quota_operations").then(async exists=>{
    if(exists)return;
    await this.db.schema.createTable("xoi_quota_operations",t=>{
      t.string("operation_key",200).primary();t.bigInteger("user_id").notNullable();t.bigInteger("delta").notNullable();
      t.string("fingerprint",64).notNullable();t.string("state",20).notNullable();t.bigInteger("quota_after");
      t.bigInteger("created_at").notNullable();t.bigInteger("updated_at").notNullable();t.index(["user_id","state"]);
    }).catch(async error=>{if(!await this.db.schema.hasTable("xoi_quota_operations"))throw error;});
  }).catch(error=>{this.ready=undefined;throw error;});}
  async apply(input:DurableQuotaInput):Promise<{applied:boolean;quotaAfter:number|null}>{
    if(!Number.isSafeInteger(input.userId)||input.userId<=0||!Number.isSafeInteger(input.delta)||input.delta===0)throw new QuotaOperationError("用户和额度必须是有效整数",400);
    const key=input.idempotencyKey;
    if(typeof key!=="string"||key.length<6||key.length>200||/[\x00-\x1f]/.test(key))throw new QuotaOperationError("额度变更必须提供有效的唯一操作编号",400);
    const fingerprint=crypto.createHash("sha256").update(JSON.stringify([input.userId,input.delta,input.type,input.operatorId??null,input.referenceType??null,input.referenceId??null,input.description??null])).digest("hex");
    await this.ensure();
    const claimed=await this.db.transaction(async trx=>{
      if(this.db.client.config.client==="pg")await trx.raw("select pg_advisory_xact_lock(hashtext(?))",[`xoi:quota-operation:${input.userId}`]);
      const existing=await trx("xoi_quota_operations").where("operation_key",key).first();
      if(existing){
        if(existing.fingerprint!==fingerprint)throw new QuotaOperationError("同一操作编号不能用于不同用户、金额或用途");
        if(existing.state==="applied")return {applied:false,quotaAfter:existing.quota_after===null?null:Number(existing.quota_after)};
        throw new QuotaOperationError("额度变更正在处理或结果待核对，请勿换编号重复发放");
      }
      // Compatibility with previously committed audit rows; validate ownership and amount.
      const old=await trx("o_quota_ledger").where("idempotency_key",key).first();
      if(old){if(Number(old.user_id)!==input.userId||Number(old.delta)!==input.delta||old.type!==input.type)throw new QuotaOperationError("该操作编号已有不同的额度记录");return {applied:false,quotaAfter:old.quota_after===null?null:Number(old.quota_after)};}
      const pending=await trx("xoi_quota_operations").where("user_id",input.userId).whereIn("state",["processing","unknown"]).first();
      if(pending)throw new QuotaOperationError("该账号有未核对的额度变更，已阻止再次发放，请先核对流水");
      await trx("xoi_quota_operations").insert({operation_key:key,user_id:input.userId,delta:input.delta,fingerprint,state:"processing",created_at:Date.now(),updated_at:Date.now()}).returning("operation_key");
      return null;
    });
    if(claimed)return claimed;
    try{
      const quotaAfter=await this.adjust(input.userId,input.delta);
      await this.db.transaction(async trx=>{
        await trx("o_quota_ledger").insert({user_id:input.userId,delta:input.delta,quota_after:quotaAfter,type:input.type,description:input.description??null,operator_id:input.operatorId??null,reference_type:input.referenceType??null,reference_id:input.referenceId??null,idempotency_key:key,created_at:new Date().toISOString()});
        await trx("xoi_quota_operations").where("operation_key",key).update({state:"applied",quota_after:quotaAfter,updated_at:Date.now()});
      });
      return {applied:true,quotaAfter};
    }catch{
      await this.db("xoi_quota_operations").where("operation_key",key).where("state","processing").update({state:"unknown",updated_at:Date.now()}).catch(()=>{});
      throw new QuotaOperationError("额度变更结果待核对，已阻止自动重复入账；请由站长核对网关与操作流水");
    }
  }
}
