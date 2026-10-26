import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Knex } from "knex";
import { isDeepStrictEqual } from "node:util";
import { CanvasDatabase, CANVAS_LIMIT_BYTES, ensureCanvasDatabase } from "./canvasDatabase";

type Source = { name:string; checksum:string; value:any };
const checksum=(bytes:Buffer)=>crypto.createHash("sha256").update(bytes).digest("hex");
const migrationError=(message:string)=>Object.assign(new Error(message),{canvasMigration:true});

async function sources(directory:string):Promise<Source[]> {
  const names=await fs.readdir(directory).catch(e=>{if(e.code==="ENOENT")return [];throw e;});
  const result:Source[]=[];
  for(const name of names.sort()) {
    if(!name.endsWith(".json"))continue;
    if(!/^[a-zA-Z0-9_-]{1,160}\.json$/.test(name))throw migrationError("旧画布文件名无效；未修改任何文件");
    const file=path.join(directory,name),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.size>CANVAS_LIMIT_BYTES)throw migrationError("旧画布不是普通文件或超过12MB；请先核对");
    const bytes=await fs.readFile(file);
    let value:any;
    try {value=JSON.parse(bytes.toString("utf8"));}catch{throw migrationError("旧画布 JSON 无效；原文件保留待核对");}
    if(!value||value.id!==name.slice(0,-5))throw migrationError("旧画布编号与文件名不一致；拒绝迁移");
    for(const key of ["updated_at","created_at","deleted_at"]) {
      if(value[key]!==undefined&&(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>8640000000000000))throw migrationError("旧画布时间戳无效；拒绝迁移");
    }
    if(value.revision!==undefined&&(!Number.isSafeInteger(value.revision)||value.revision<0))throw migrationError("旧画布版本无效；拒绝迁移");
    const digest=checksum(bytes);
    // Validate owner, shape and size without stamping or altering the original payload.
    CanvasDatabase.legacyValues(value,digest);
    result.push({name,checksum:digest,value});
  }
  return result;
}

async function unchanged(directory:string,original:Source[]) {
  const current=await sources(directory);
  if(!isDeepStrictEqual(current.map(x=>[x.name,x.checksum]),original.map(x=>[x.name,x.checksum])))throw migrationError("旧画布在迁移期间发生变化；事务已取消，请停止旧写入后重试");
}

async function checkRows(db:Knex,source:Source[],required:boolean) {
  const exists=await db.schema.hasTable("xoi_canvas_documents");
  let imported=0;
  if(!exists) {if(required&&source.length)throw migrationError("旧画布尚未迁移，禁止切换数据库存储");return 0;}
  for(const item of source) {
    const row=await db("xoi_canvas_documents").where({canvas_id:item.value.id}).select("user_id","legacy_checksum").first();
    if(!row) {if(required)throw migrationError("旧画布迁移不完整，禁止切换数据库存储");continue;}
    if(Number(row.user_id)!==item.value.userId||row.legacy_checksum!==item.checksum)throw migrationError("数据库记录与旧文件不匹配；不会覆盖任何一方");
    imported++;
  }
  return imported;
}

/** Startup gate: old files may stay, but every one must have a matching import receipt. */
export async function verifyCanvasImports(db:Knex,directory:string) {
  const source=await sources(directory);
  await checkRows(db,source,true);
  return {verified:source.length};
}

/** Read-only by default. Apply only with old writers stopped; source files are never modified. */
export async function migrateCanvasFiles(db:Knex,directory:string,apply=false) {
  const source=await sources(directory);
  const owners=[...new Set(source.map(x=>x.value.userId))];
  const known=owners.length?await db("users").whereIn("id",owners).select("id"):[];
  if(new Set(known.map(x=>Number(x.id))).size!==owners.length)throw migrationError("旧画布存在未知用户；先确认归属，拒绝自动分配");
  const imported=await checkRows(db,source,false);
  const report={files:source.length,alreadyImported:imported,toImport:source.length-imported,legacyRevisions:source.filter(x=>x.value.revision===undefined).length,purged:source.filter(x=>x.value.purged).length,sourceFilesPreserved:true,applied:apply};
  if(!apply)return report;
  await ensureCanvasDatabase(db);
  await db.transaction(async trx=>{
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))",["xoi:canvas-migration"]);
    for(const item of source) {
      const rows=await trx("xoi_canvas_documents").insert(CanvasDatabase.legacyValues(item.value,item.checksum)).onConflict("canvas_id").ignore().returning("canvas_id");
      if(!rows.length) {
        const row=await trx("xoi_canvas_documents").where({canvas_id:item.value.id}).first();
        if(Number(row?.user_id)!==item.value.userId||row?.legacy_checksum!==item.checksum)throw migrationError("迁移记录冲突；整批回滚，不覆盖已有数据");
        continue; // Already imported, possibly edited since: never restore old contents over newer work.
      }
      const row=await trx("xoi_canvas_documents").where({canvas_id:item.value.id}).first();
      const value=typeof row.payload==="string"?JSON.parse(row.payload):row.payload;
      if(!isDeepStrictEqual(value,item.value)||Number(row.revision)!==Number(item.value.revision??0))throw migrationError("迁移内容或版本校验失败；整批回滚");
    }
    await unchanged(directory,source);
    await checkRows(trx,source,true);
  });
  return report;
}
