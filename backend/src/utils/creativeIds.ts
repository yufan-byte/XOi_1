import type {Knex} from 'knex';
import {withSecuritySchemaLock} from './securitySchema';

/** Stable JS-safe numeric IDs across accounts, processes and servers. Never resets existing IDs. */
export class CreativeIds {
  private ready?:Promise<void>;
  constructor(private db:Knex){}
  ensure(){return this.ready??=withSecuritySchemaLock(this.db,async trx=>{
    // Fresh PostgreSQL installs used serial/int32 for tracks, while callers supplied int64 IDs.
    // Widen in place without replacing rows, defaults or associations.
    const column=await trx('o_videoTrack').columnInfo('id');
    if(column.type==='integer')await trx.raw('ALTER TABLE "o_videoTrack" ALTER COLUMN id TYPE bigint');
    const found=await trx.raw("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname='xoi_creative_id_seq' AND c.relkind='S'");
    if(found.rows.length)return; // Never setval an existing live sequence: another node may be allocating.
    const maximum=await trx.raw('SELECT GREATEST(COALESCE((SELECT max(id) FROM o_project),0),COALESCE((SELECT max(id) FROM "o_videoTrack"),0)) AS value');
    // A separate numeric namespace also avoids collisions with an old Date.now() node during rolling updates.
    const start=BigInt(maximum.rows[0]?.value||0)+1n>4000000000000000n?BigInt(maximum.rows[0].value)+1n:4000000000000000n;
    if(start>BigInt(Number.MAX_SAFE_INTEGER))throw Error('创作编号空间已用尽，请联系管理员');
    await trx.raw(`CREATE SEQUENCE xoi_creative_id_seq AS bigint MINVALUE 1 MAXVALUE 9007199254740991 START WITH ${start.toString()}`);
  }).catch(e=>{this.ready=undefined;throw e;});}
  async next(client:Knex|Knex.Transaction=this.db){await this.ensure();const row=await client.raw("SELECT nextval('xoi_creative_id_seq'::regclass)::text AS id"),id=Number(row.rows[0].id);if(!Number.isSafeInteger(id)||id<1)throw Error('创作编号无效，未保存项目');return id;}
}
const allocators=new WeakMap<Knex,CreativeIds>();
export function creativeIds(db:Knex){let ids=allocators.get(db);if(!ids){ids=new CreativeIds(db);allocators.set(db,ids);}return ids;}
