import type {Knex} from "knex";
/** IF NOT EXISTS alone does not serialize concurrent PostgreSQL pg_type/index creation. */
export function withSecuritySchemaLock<T>(db:Knex,work:(trx:Knex.Transaction)=>Promise<T>){return db.transaction(async trx=>{
  if(db.client.config.client==="pg")await trx.raw("SELECT pg_advisory_xact_lock(hashtext('xoi:security-schema:'||current_schema()))");
  return work(trx);
});}
