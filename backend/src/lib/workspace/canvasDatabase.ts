import type { Knex } from "knex";
import { canvasError } from "./canvasFiles";

export const CANVAS_LIMIT_BYTES=12*1024*1024;
export function canvasId(id:string) {
  if(typeof id!=="string"||!/^[a-zA-Z0-9_-]{1,160}$/.test(id))throw canvasError("无效的画布编号",400);
}
function user(userId:number) {if(!Number.isSafeInteger(userId)||userId<1)throw canvasError("未登录",401);}
export function canvasPayload(value:any) {
  if(!value||typeof value!=="object"||Array.isArray(value))throw canvasError("画布内容无效",400);
  canvasId(value.id);
  const json=JSON.stringify(value);
  if(Buffer.byteLength(json)>CANVAS_LIMIT_BYTES)throw canvasError("画布超过12MB，请拆分项目",413);
  return json;
}
function revision(value:unknown) {const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0)throw canvasError("画布版本无效",400);return n;}
function stamp(value:any,previous?:any) {
  const next=revision(previous?.revision)+1;
  if(!Number.isSafeInteger(next))throw canvasError("画布版本已达上限，请联系管理员",409);
  value.revision=next;
  value.updated_at=Math.max(Date.now(),Number(previous?.updated_at||0)+1);
  const project=value.settings?.atelier?.project;
  if(project){project.cloudRevision=next;project.updatedAt=new Date(value.updated_at).toISOString();}
  return value;
}
function values(value:any) {
  const json=canvasPayload(value);
  const metadata={id:value.id,userId:value.userId,title:value.title||"未命名画布",icon:value.icon||"layers",kind:value.kind||"classic",owner:value.owner||"",color:value.color||"",pinned:!!value.pinned,created_at:value.created_at,updated_at:value.updated_at,revision:value.revision,deleted_at:value.deleted_at,
    // Keep the list format hint without copying the whole project graph into metadata.
    ...(value.settings?.atelier?{settings:{atelier:{}}}:{})};
  return {canvas_id:value.id,user_id:value.userId,revision:revision(value.revision),updated_at:Number(value.updated_at||0),pinned:!!value.pinned,deleted_at:value.deleted_at?Number(value.deleted_at):null,purged:!!value.purged,metadata:JSON.stringify(metadata),payload:json};
}
function payload(row:any) {return structuredClone(typeof row.payload==="string"?JSON.parse(row.payload):row.payload);}
async function boundTransaction(trx:Knex.Transaction) {
  await trx.raw("SET LOCAL lock_timeout = '5s'");
  await trx.raw("SET LOCAL statement_timeout = '10s'");
}

export async function ensureCanvasDatabase(db:Knex) {
  await db.raw(`CREATE TABLE IF NOT EXISTS xoi_canvas_documents (
    canvas_id VARCHAR(160) PRIMARY KEY, user_id BIGINT NOT NULL,
    revision BIGINT NOT NULL CHECK(revision>=0), updated_at BIGINT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT false, deleted_at BIGINT,
    purged BOOLEAN NOT NULL DEFAULT false, metadata JSONB NOT NULL, payload JSONB NOT NULL,
    legacy_checksum VARCHAR(64), imported_at TIMESTAMPTZ)`);
  await db.raw(`CREATE INDEX IF NOT EXISTS xoi_canvas_owner_active ON xoi_canvas_documents(user_id,pinned DESC,updated_at DESC,canvas_id) WHERE purged=false AND deleted_at IS NULL`);
  await db.raw(`CREATE INDEX IF NOT EXISTS xoi_canvas_owner_trash ON xoi_canvas_documents(user_id,deleted_at DESC,canvas_id) WHERE purged=false AND deleted_at IS NOT NULL`);
}

/** PostgreSQL is the only authority in this mode. Never fall back to stale local files. */
export class CanvasDatabase {
  constructor(private db:Knex) {}
  private transaction<T>(work:(trx:Knex.Transaction)=>Promise<T>) {
    return this.db.transaction(async trx=>{await boundTransaction(trx);return work(trx);}).catch(error=>{
      if(["55P03","57014","40P01"].includes(error?.code))throw canvasError("云端保存暂时繁忙，本机修改仍保留，请稍后重新打开核对",503);
      throw error;
    });
  }
  async get(id:string,userId:number,includeDeleted=false) {
    canvasId(id);user(userId);
    const query=this.db("xoi_canvas_documents").where({canvas_id:id,user_id:userId,purged:false});
    if(!includeDeleted)query.whereNull("deleted_at");
    const row=await query.select("payload").first();return row?payload(row):null;
  }
  async list(userId:number,includeDeleted=false) {
    user(userId);
    const query=this.db("xoi_canvas_documents").where({user_id:userId,purged:false});
    if(!includeDeleted)query.whereNull("deleted_at");
    const rows=await query.select("payload").orderBy("pinned","desc").orderBy("updated_at","desc").orderBy("canvas_id");
    return rows.map(payload);
  }
  async listMetadata(userId:number,includeDeleted=false) {
    user(userId);
    const query=this.db("xoi_canvas_documents").where({user_id:userId,purged:false});
    if(!includeDeleted)query.whereNull("deleted_at");
    const rows=await query.select("metadata").orderBy("pinned","desc").orderBy("updated_at","desc").orderBy("canvas_id");
    return rows.map(row=>typeof row.metadata==="string"?JSON.parse(row.metadata):row.metadata);
  }
  async create(value:any,userId:number) {
    user(userId);canvasId(value?.id);
    const next=stamp({...structuredClone(value),userId});
    return this.transaction(async trx=>{
      // Per-account creation limit is cross-instance, not an in-memory counter.
      await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))",[`xoi:canvas-create:${userId}`]);
      const count=await trx("xoi_canvas_documents").where({user_id:userId,purged:false}).count("canvas_id as count").first();
      if(Number(count?.count)>=200)throw canvasError("云端画布已达200份，请整理后再新建；已有内容不会被删除",413);
      const rows=await trx("xoi_canvas_documents").insert(values(next)).onConflict("canvas_id").ignore().returning("canvas_id");
      if(!rows.length)throw canvasError("画布编号已存在或已删除，请重新创建");
      return next;
    });
  }
  private async mutate(id:string,userId:number,change:(value:any)=>any,includeDeleted:boolean,expected?:{revision?:unknown;timestamp?:unknown}) {
    canvasId(id);user(userId);
    return this.transaction(async trx=>{
      const row=await trx("xoi_canvas_documents").where({canvas_id:id,user_id:userId}).forUpdate().first();
      if(!row)throw canvasError("画布不存在",404);
      if(row.purged||(!includeDeleted&&row.deleted_at))throw canvasError("画布已删除，请在回收站明确恢复",expected?409:404);
      const previous=payload(row);
      if(expected) {
        const matches=expected.revision!==undefined?Number.isSafeInteger(expected.revision)&&expected.revision===Number(row.revision):typeof expected.timestamp==="number"&&expected.timestamp===Number(row.updated_at);
        if(!matches)throw canvasError("画布已在其他页面更新或缺少版本信息，本机修改仍保留，请重新打开并核对");
      }
      const changed=change(structuredClone(previous));
      if(!changed||typeof changed!=="object"||Array.isArray(changed)||typeof changed.then==="function")throw canvasError("画布保存操作无效",400);
      const next=stamp({...changed,id,userId},{...previous,revision:Number(row.revision),updated_at:Number(row.updated_at)});
      const saved=await trx("xoi_canvas_documents").where({canvas_id:id,user_id:userId,revision:row.revision}).update(values(next)).returning("canvas_id");
      if(!saved.length)throw canvasError("画布已在其他页面更新，本机修改仍保留");
      return next;
    });
  }
  update(id:string,userId:number,expected:{revision?:unknown;timestamp?:unknown},change:(value:any)=>any) {return this.mutate(id,userId,change,false,expected);}
  command(id:string,userId:number,change:(value:any)=>any,includeDeleted=false) {return this.mutate(id,userId,change,includeDeleted);}
  /** Additive migration only; callers must freeze old writers and verify source checksums. */
  static legacyValues(value:any,checksum:string) {
    user(value?.userId);
    return {...values(value),legacy_checksum:checksum,imported_at:new Date()};
  }
}
