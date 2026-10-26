import type {Knex} from "knex";
import {withSecuritySchemaLock} from "@/utils/securitySchema";

export const releaseError=(message:string,status=409)=>Object.assign(new Error(message),{status});
const freshMs=15000;
export type ReleaseSnapshot={http:number;socket:number;media:number;claiming:boolean;ready:boolean;postgres:boolean;pending:number;legacyPending:number};
export async function ensureReleaseControl(db:Knex){
  await withSecuritySchemaLock(db,async trx=>{
  await trx.raw(`CREATE TABLE IF NOT EXISTS xoi_release_instances (
    instance_id UUID PRIMARY KEY, release VARCHAR(80) NOT NULL, label VARCHAR(60) NOT NULL,
    started_at BIGINT NOT NULL, heartbeat_at BIGINT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0, drain_requested BOOLEAN NOT NULL DEFAULT false,
    observed_draining BOOLEAN NOT NULL DEFAULT false, snapshot JSONB NOT NULL DEFAULT '{}')`);
  await trx.raw(`CREATE INDEX IF NOT EXISTS xoi_release_instances_recent ON xoi_release_instances(heartbeat_at)`);
  await trx.raw(`ALTER TABLE xoi_release_instances ADD COLUMN IF NOT EXISTS cluster_id VARCHAR(60) NOT NULL DEFAULT 'local'`);
  await trx.raw(`CREATE INDEX IF NOT EXISTS xoi_release_cluster_recent ON xoi_release_instances(cluster_id,heartbeat_at)`);
  await trx.raw(`CREATE TABLE IF NOT EXISTS xoi_release_audit (
    id BIGSERIAL PRIMARY KEY, instance_id UUID NOT NULL, release VARCHAR(80) NOT NULL,
    action VARCHAR(12) NOT NULL, operator_id BIGINT NOT NULL, revision BIGINT NOT NULL,
    reason VARCHAR(200) NOT NULL, created_at BIGINT NOT NULL)`);
  await trx.raw(`ALTER TABLE xoi_release_audit ADD COLUMN IF NOT EXISTS cluster_id VARCHAR(60) NOT NULL DEFAULT 'local'`);
  });
}
export function releaseView(row:any,now=Date.now()){
  const s=row.snapshot||{};
  const online=Number(row.heartbeat_at)>now-freshMs;
  return {instanceId:row.instance_id,release:row.release,label:row.label,startedAt:Number(row.started_at),heartbeatAt:Number(row.heartbeat_at),revision:Number(row.revision),desiredDraining:row.drain_requested,observedDraining:row.observed_draining,online,
    activity:{http:Number(s.http||0),socket:Number(s.socket||0),media:Number(s.media||0),claiming:!!s.claiming,pending:Number(s.pending||0),legacyPending:Number(s.legacyPending||0)},
    dependenciesReady:online&&s.ready===true,
    ready:online&&s.ready===true&&!row.drain_requested&&!row.observed_draining,
    // An observation, not a remote kill authorization or a guarantee about untracked legacy work.
    observedIdle:online&&row.drain_requested&&row.observed_draining&&s.http===0&&s.socket===0&&s.media===0&&s.claiming===false&&s.pending===0&&s.legacyPending===0,
  };
}
export class ReleaseControl {
  constructor(private db:Knex,private rolloutEnabled:boolean,private now=Date.now,private cluster="local"){
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(cluster))throw Error("发布部署组格式无效");
  }
  async register(id:string,release:string,label:string,standby=false){
    const now=this.now();
    await this.db("xoi_release_instances").insert({instance_id:id,cluster_id:this.cluster,release,label,started_at:now,heartbeat_at:now,drain_requested:standby,observed_draining:standby}).returning("instance_id");
  }
  async heartbeat(id:string,snapshot:ReleaseSnapshot,observedDraining:boolean){
    return this.db("xoi_release_instances").where({instance_id:id,cluster_id:this.cluster}).update({heartbeat_at:this.now(),snapshot:JSON.stringify(snapshot),observed_draining:observedDraining}).returning("drain_requested");
  }
  async desired(id:string){return !!(await this.db("xoi_release_instances").where({instance_id:id,cluster_id:this.cluster}).select("drain_requested").first())?.drain_requested;}
  async list(){const rows=await this.db("xoi_release_instances").where({cluster_id:this.cluster}).where("heartbeat_at",">",this.now()-86400000).orderBy("started_at","desc").limit(100);return rows.map(row=>releaseView(row,this.now()));}
  async audit(){return this.db("xoi_release_audit").where({cluster_id:this.cluster}).select("id","instance_id","release","action","operator_id","revision","reason","created_at").orderBy("id","desc").limit(50);}
  async change(id:string,revision:number,drain:boolean,operator:number,reason:string){
    return this.db.transaction(async trx=>{
      await trx.raw("SET LOCAL lock_timeout = '5s'");
      await trx.raw("select pg_advisory_xact_lock(hashtext('xoi:release-control'))");
      const authority=await trx("users").where({id:operator,status:1}).where("role",">=",100).whereNull("deleted_at").forShare().first();
      if(!authority)throw releaseError("发布运维仅限平台超级管理员",403);
      const row=await trx("xoi_release_instances").where({instance_id:id,cluster_id:this.cluster}).forUpdate().first();
      if(!row)throw releaseError("节点不存在",404);
      if(Number(row.revision)!==revision)throw releaseError("节点状态已变化，请刷新后重新确认");
      if(Number(row.heartbeat_at)<=this.now()-freshMs)throw releaseError("节点心跳已过期，拒绝变更；请在服务器检查，不自动重启或重放任务");
      if(!drain&&row.snapshot?.ready!==true)throw releaseError("节点依赖尚未就绪，不能恢复接流，请先排查并等待新的健康心跳");
      if(drain){
        if(!this.rolloutEnabled)throw releaseError("尚未启用多节点发布，不能摘流；请先完成共享存储及预发验收");
        if(row.snapshot?.postgres!==true)throw releaseError("画布仍是文件模式，不能按多节点发布");
        const peers=await trx("xoi_release_instances").whereNot("instance_id",id).where({cluster_id:this.cluster,drain_requested:false,observed_draining:false}).where("heartbeat_at",">",this.now()-freshMs);
        if(!peers.some(p=>p.snapshot?.ready===true&&p.snapshot?.postgres===true))throw releaseError("没有健康替代节点，不能摘流最后一个服务节点");
      }
      const next=revision+1;
      await trx("xoi_release_instances").where({instance_id:id,revision}).update({drain_requested:drain,revision:next});
      await trx("xoi_release_audit").insert({instance_id:id,cluster_id:this.cluster,release:row.release,action:drain?"drain":"resume",operator_id:operator,revision:next,reason,created_at:this.now()}).returning("id");
      return {revision:next,desiredDraining:drain};
    });
  }
}
