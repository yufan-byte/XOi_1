import crypto from "node:crypto";
import type { Knex } from "knex";
import { capacityValue } from "@/utils/modelConcurrency";
import {getGatewayRequestContext} from "@/lib/gateway/context";

export interface DurableTask { status: string; result?: any; error?: string; upstreamId?: string; modelKey?: string; recoveryRequired?: boolean; queueManaged?: boolean }
export const taskWorkerId = crypto.randomUUID();
/** Database is the source of truth: never acknowledge a task that wasn't committed. */
export class DurableTasks<T extends DurableTask> {
  constructor(private db: Knex, private kind: string, private onExpire: (id: string) => void = () => {}, private worker: string = taskWorkerId) {}
  async create(id: string, userId: number, value: T) {
    if (!Number.isSafeInteger(userId) || userId <= 0) return false;
    return this.db.transaction(async trx => {
      if (this.db.client.config.client === "pg") await trx.raw("select pg_advisory_xact_lock(hashtext('xoi:media-task-capacity'))");
      const running=()=>trx("xoi_generation_tasks").whereIn("status",["running","unknown"]).where("updated_at",">",Date.now()-45*60*1000);
      const count=await running().where("user_id",userId).count("id as count").first();
      if(Number(count?.count)>=capacityValue("XOI_MEDIA_USER_CONCURRENCY",6,50))return false;
      const total=await running().count("id as count").first();
      if(Number(total?.count)>=capacityValue("XOI_MEDIA_GLOBAL_CONCURRENCY",64,2000))return false;
      const context=getGatewayRequestContext();
      const rows = await trx("xoi_generation_tasks").insert({ task_id: id, user_id: userId, kind: this.kind, worker_id: this.worker, updated_at: Date.now(), status: value.status, payload: JSON.stringify({...value,...(context?.userId===userId&&context.billingId?{billingId:context.billingId}:{})}) })
        .onConflict(["kind", "task_id"]).ignore().returning(["id", "task_id"]);
      return rows.length > 0;
    });
  }
  async set(id: string, value: T) {
    // Keep model/upstream identity when a terminal result replaces the running payload.
    await this.db.transaction(async trx => {
      const job=getGatewayRequestContext()?.mediaQueue;
      let lease:any;
      if(job){
        lease=await trx("xoi_media_queue").where({kind:this.kind,task_id:id,lease_token:job.leaseToken,worker_id:job.workerId}).forUpdate().first();
        if(!lease)throw new Error("任务执行租约失效，拒绝旧执行器改写状态");
        if(lease.state!=="running"||Number(lease.lease_until)<=Date.now()){
          // A late create response may carry the only recoverable upstream identity.
          if(value.upstreamId&&lease.state==="unknown"){
            const record=await trx("xoi_generation_tasks").where({kind:this.kind,task_id:id}).first();
            if(record && !["succeeded","failed","cancelled"].includes(record.status))await trx("xoi_generation_tasks").where({id:record.id}).update({payload:JSON.stringify({...JSON.parse(record.payload),upstreamId:value.upstreamId,status:"unknown"})});
            return;
          }
          throw new Error("任务已取消或租约已过期，拒绝旧执行器改写状态");
        }
      }
      const row = await trx("xoi_generation_tasks").where({ kind: this.kind, task_id: id }).forUpdate().first();
      if (!row) throw new Error("任务记录不存在");
      const previous = JSON.parse(row.payload);
      if (["succeeded", "failed","cancelled"].includes(row.status)) return;
      await trx("xoi_generation_tasks").where({ id: row.id }).update({ status: value.status, updated_at: Date.now(), payload: JSON.stringify({ ...previous, ...value }) });
    });
  }
  async get(id: string): Promise<T | undefined> {
    const row = await this.db("xoi_generation_tasks").where({ kind: this.kind, task_id: id }).first();
    return row ? JSON.parse(row.payload) : undefined;
  }
  async getForUser(id: string, userId: number): Promise<T | undefined> {
    const row = await this.db("xoi_generation_tasks").where({ kind: this.kind, task_id: id, user_id: userId }).first();
    if(!row)return;const payload=JSON.parse(row.payload);
    if(payload.queueManaged){const lease=await this.db("xoi_media_queue").where({kind:this.kind,task_id:id,user_id:userId}).select("state","lease_until").first();return {...payload,recoveryRequired:row.status==="unknown"||(row.status==="running"&&(!lease||Number(lease.lease_until)<=Date.now()))};}
    return { ...payload, recoveryRequired: ["running", "unknown"].includes(row.status) && (row.worker_id !== this.worker || Date.now() - Number(row.updated_at) > 30 * 60 * 1000) };
  }
  async listForUser(userId: number) {
    const rows = await this.db("xoi_generation_tasks").where({ kind: this.kind, user_id: userId }).orderBy("updated_at", "desc").limit(50);
    const leases=rows.some(row=>JSON.parse(row.payload).queueManaged)?await this.db("xoi_media_queue").where({kind:this.kind,user_id:userId}).whereIn("task_id",rows.map(row=>row.task_id)).select("task_id","lease_until"):[];
    const byId=new Map(leases.map(row=>[row.task_id,row]));
    return rows.map(row=>{const payload=JSON.parse(row.payload) as T;const lease=byId.get(row.task_id);return { ...payload,id:row.task_id,recoveryRequired:payload.queueManaged?row.status==="unknown"||(row.status==="running"&&(!lease||Number(lease.lease_until)<=Date.now())):["running","unknown"].includes(row.status)&&(row.worker_id!==this.worker||Date.now()-Number(row.updated_at)>30*60*1000)};});
  }
  async deleteForUser(id: string, userId: number) {
    const count = await this.db("xoi_generation_tasks").where({ kind: this.kind, task_id: id, user_id: userId }).whereIn("status", ["succeeded", "failed","cancelled"]).delete();
    if (count) this.onExpire(id);
    return count > 0;
  }
}
