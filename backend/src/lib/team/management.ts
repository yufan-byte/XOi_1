import type {Pool,PoolClient} from "pg";
import crypto from "node:crypto";

export class TeamManagementError extends Error {constructor(message:string,public status=400){super(message);}}
export type TeamOperation="member.add"|"member.update"|"member.password"|"member.disable"|"member.enable"|"member.delete"|"team.rename";
const ACTIONS:TeamOperation[]=["member.add","member.update","member.password","member.disable","member.enable","member.delete","team.rename"];
function safeDetails(raw:Record<string,unknown>){
  const out:Record<string,unknown>={};
  for(const key of ["nickname","name","previousName"]){if(typeof raw[key]==="string")out[key]=(raw[key] as string).slice(0,40);}
  if(typeof raw.limitQuota==="number"&&Number.isSafeInteger(raw.limitQuota)&&raw.limitQuota>=0)out.limitQuota=raw.limitQuota;
  if(["day","month","total"].includes(String(raw.period)))out.period=raw.period;
  if(typeof raw.canViewAll==="boolean")out.canViewAll=raw.canViewAll;
  return out;
}
/** Owner-only management history. This never calls a model or a gateway API. */
export class TeamManagement {
  private initializing?:Promise<void>;
  constructor(private pool:Pool){}
  ensure(){return this.initializing??=this.initialize().catch(e=>{this.initializing=undefined;throw e;});}
  private async initialize(){
    const c=await this.pool.connect();
    try{
      await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(12121,7402)");
      await c.query(`CREATE TABLE IF NOT EXISTS xoi_team_operations (
        id uuid PRIMARY KEY,team_id integer NOT NULL,actor_id integer NOT NULL,action text NOT NULL,
        target_member_id integer,status text NOT NULL CHECK(status IN ('started','confirmed','needs_review')),
        details jsonb NOT NULL DEFAULT '{}'::jsonb,created_at bigint NOT NULL,updated_at bigint NOT NULL);
        CREATE INDEX IF NOT EXISTS xoi_team_operations_history ON xoi_team_operations(team_id,created_at DESC,id DESC);`);
      await c.query("COMMIT");
    }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
  }
  private async owned(ownerId:number,c:Pool|PoolClient=this.pool,lock=false){
    if(!Number.isSafeInteger(ownerId)||ownerId<1)throw new TeamManagementError("请先登录",401);
    const r=await c.query(`SELECT id,name FROM mc_teams WHERE owner_id=$1${lock?" FOR UPDATE":""}`,[ownerId]);
    if(!r.rowCount)throw new TeamManagementError("只有团队所有者可以查看管理记录或修改团队设置",403);
    return r.rows[0] as {id:number;name:string};
  }
  async start(ownerId:number,action:TeamOperation,target:number|undefined,details:Record<string,unknown>={}){
    if(!ACTIONS.includes(action)||action==="team.rename")throw new TeamManagementError("无效的团队操作");
    await this.ensure();const team=await this.owned(ownerId);
    if(target!==undefined){
      if(!Number.isSafeInteger(target)||target<1)throw new TeamManagementError("成员不存在",404);
      const found=await this.pool.query("SELECT 1 FROM mc_team_members WHERE id=$1 AND team_id=$2 AND status<>'deleted'",[target,team.id]);
      if(!found.rowCount)throw new TeamManagementError("成员不存在",404);
    }
    const id=crypto.randomUUID(),now=Date.now();
    await this.pool.query("INSERT INTO xoi_team_operations(id,team_id,actor_id,action,target_member_id,status,details,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'started',$6::jsonb,$7,$7)",[id,team.id,ownerId,action,target??null,JSON.stringify(safeDetails(details)),now]);
    return id;
  }
  async finish(ownerId:number,id:string,status:"confirmed"|"needs_review"){
    if(!["confirmed","needs_review"].includes(status))throw new TeamManagementError("无效的操作状态");
    const r=await this.pool.query(`UPDATE xoi_team_operations e SET status=$3,updated_at=$4
      FROM mc_teams t WHERE e.id=$1 AND e.team_id=t.id AND t.owner_id=$2 AND e.actor_id=$2 AND e.status='started' RETURNING e.id`,[id,ownerId,status,Date.now()]);
    if(!r.rowCount)throw new TeamManagementError("操作记录不存在或已完成",409);
  }
  async track<T>(ownerId:number,action:TeamOperation,target:number|undefined,details:Record<string,unknown>,run:()=>Promise<T>){
    const id=await this.start(ownerId,action,target,details);let value:T;
    try{value=await run();}catch(e){await this.finish(ownerId,id,"needs_review").catch(()=>{});throw e;}
    try{await this.finish(ownerId,id,"confirmed");}
    catch{throw new TeamManagementError("操作结果暂未确认，请刷新成员和管理记录核对，不要重复提交",502);}
    return value;
  }
  async rename(ownerId:number,name:string,expectedName:string){
    const clean=name.trim();if(!clean||clean.length>40)throw new TeamManagementError("团队名称需 1–40 字");
    await this.ensure();const c=await this.pool.connect();
    try{
      await c.query("BEGIN");const team=await this.owned(ownerId,c,true);
      if(team.name!==expectedName)throw new TeamManagementError("团队名称已被更新，请刷新后再修改",409);
      if(clean!==team.name){
        await c.query("UPDATE mc_teams SET name=$2 WHERE id=$1",[team.id,clean]);
        const now=Date.now();
        await c.query("INSERT INTO xoi_team_operations(id,team_id,actor_id,action,status,details,created_at,updated_at) VALUES($1,$2,$3,'team.rename','confirmed',$4::jsonb,$5,$5)",[crypto.randomUUID(),team.id,ownerId,JSON.stringify({name:clean,previousName:team.name}),now]);
      }
      await c.query("COMMIT");return {name:clean};
    }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
  }
  async list(ownerId:number,view:"ledger"|"operations",page:number){
    if(!["ledger","operations"].includes(view)||!Number.isInteger(page)||page<1||page>100000)throw new TeamManagementError("分页参数无效");
    await this.ensure();const team=await this.owned(ownerId),offset=(page-1)*20;
    if(view==="ledger"){
      const [rows,count]=await Promise.all([
        this.pool.query(`SELECT l.id::text,l.kind,l.user_id,l.amount,l.pool_after,l.actor_id,l.created_at,m.nickname
          FROM mc_team_ledger l LEFT JOIN mc_team_members m ON m.team_id=l.team_id AND m.user_id=l.user_id
          WHERE l.team_id=$1 ORDER BY l.id DESC LIMIT 20 OFFSET $2`,[team.id,offset]),
        this.pool.query("SELECT count(*)::text AS total FROM mc_team_ledger WHERE team_id=$1",[team.id]),
      ]);
      return {page,pageSize:20,total:Number(count.rows[0].total),items:rows.rows.map(r=>({id:r.id,kind:r.kind,userId:r.user_id==null?null:Number(r.user_id),amount:Number(r.amount),poolAfter:Number(r.pool_after),actorId:r.actor_id==null?null:Number(r.actor_id),at:Number(r.created_at),nickname:r.nickname||""}))};
    }
    const [rows,count]=await Promise.all([
      this.pool.query("SELECT * FROM xoi_team_operations WHERE team_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2",[team.id,offset]),
      this.pool.query("SELECT count(*)::text AS total FROM xoi_team_operations WHERE team_id=$1",[team.id]),
    ]);
    return {page,pageSize:20,total:Number(count.rows[0].total),items:rows.rows.map(r=>({id:r.id,action:r.action,status:r.status,memberId:r.target_member_id,actorId:r.actor_id,details:safeDetails(r.details),at:Number(r.created_at),updatedAt:Number(r.updated_at)}))};
  }
}
