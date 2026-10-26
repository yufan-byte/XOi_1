import type {Pool} from "pg";
import {isDeepStrictEqual} from "node:util";
import {DEFAULT_DATA,type ResellerData,type Section,type AuditEntry} from "./types";
export class ConfigConflict extends Error {constructor(){super("设置已被其他管理员更新，请刷新后再修改；未覆盖对方的更改");}}
export interface ConfigPatchOptions {expectedValue?:unknown;audit?:AuditEntry}

export function validConfigKey(key:string) {
  if(key!=="platform"&&!/^agent-\d+$/.test(key))throw Error("bad store key");
}
export function completeConfig(raw:Partial<ResellerData>):ResellerData {
  const result={...structuredClone(DEFAULT_DATA),...raw};
  for(const k of ["site","domain","theme","models","customerService","settings","recruit","finance","activities"] as const)
    (result as any)[k]={...structuredClone(DEFAULT_DATA[k]),...raw[k]};
  return result;
}

/** Shared authority: no process-local cache; PostgreSQL serializes updates to one row. */
export class PgResellerStore {
  private initializing?:Promise<void>;
  constructor(private pool:Pool,private seed:(key:string)=>Promise<ResellerData>){}
  async ensure() {
    this.initializing??=this.initialize().catch(e=>{this.initializing=undefined;throw e;});
    return this.initializing;
  }
  private async initialize() {
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(12121, 7301)");
      await c.query(`CREATE TABLE IF NOT EXISTS xoi_reseller_config (
        config_key text PRIMARY KEY, data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
        revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now())`);
      await c.query("COMMIT");
    }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
  }
  private async seedKey(key:string) {
    validConfigKey(key);await this.ensure();
    const exists=await this.pool.query("SELECT 1 FROM xoi_reseller_config WHERE config_key=$1",[key]);
    if(exists.rowCount)return;
    // Import legacy files once. A second instance can never replace an existing row.
    const initial=await this.seed(key);
    await this.pool.query("INSERT INTO xoi_reseller_config(config_key,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING",[key,JSON.stringify(initial)]);
  }
  async read(key:string):Promise<ResellerData> {
    validConfigKey(key);await this.ensure();
    let r=await this.pool.query("SELECT data FROM xoi_reseller_config WHERE config_key=$1",[key]);
    if(!r.rowCount){await this.seedKey(key);r=await this.pool.query("SELECT data FROM xoi_reseller_config WHERE config_key=$1",[key]);}
    return completeConfig(r.rows[0].data);
  }
  async write(key:string,data:ResellerData) {
    await this.seedKey(key);
    await this.pool.query("UPDATE xoi_reseller_config SET data=$2::jsonb,revision=revision+1,updated_at=now() WHERE config_key=$1",[key,JSON.stringify(data)]);
  }
  async patch<K extends Section>(key:string,section:K,value:ResellerData[K],options:ConfigPatchOptions={}):Promise<ResellerData> {
    if(!(section in DEFAULT_DATA)&&section!=="agreementSignedAt")throw Error("bad section");
    await this.seedKey(key);
    const c=await this.pool.connect();
    try{
      await c.query("BEGIN");
      const r=await c.query("SELECT data FROM xoi_reseller_config WHERE config_key=$1 FOR UPDATE",[key]);
      const current=completeConfig(r.rows[0].data);
      if(Object.hasOwn(options,"expectedValue")&&!isDeepStrictEqual(current[section],options.expectedValue))throw new ConfigConflict();
      const next={...current,[section]:value};
      if(options.audit)next.audit=[options.audit,...current.audit].slice(0,500);
      await c.query("UPDATE xoi_reseller_config SET data=$2::jsonb,revision=revision+1,updated_at=now() WHERE config_key=$1",[key,JSON.stringify(next)]);
      await c.query("COMMIT");return next;
    }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
  }
  async audit(key:string,entry:AuditEntry) {
    await this.seedKey(key);
    await this.pool.query(`UPDATE xoi_reseller_config SET data=jsonb_set(data,'{audit}',
      (SELECT COALESCE(jsonb_agg(item ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements($2::jsonb || COALESCE(data->'audit','[]'::jsonb)) WITH ORDINALITY AS a(item,ord) WHERE ord<=500)),
      revision=revision+1,updated_at=now() WHERE config_key=$1`,[key,JSON.stringify([entry])]);
    return entry;
  }
}
