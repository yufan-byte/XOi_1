import crypto from "node:crypto";
import type {Knex} from "knex";
import {withSecuritySchemaLock} from "./securitySchema";
export class SharedRateLimit {
  private ready?:Promise<void>;
  constructor(private db:Knex){}
  ensure(){return this.ready ||= withSecuritySchemaLock(this.db,async trx=>{await trx.raw(`CREATE TABLE IF NOT EXISTS xoi_rate_windows (
    scope varchar(64) NOT NULL,key_hash varchar(64) NOT NULL,bucket bigint NOT NULL,count integer NOT NULL,
    expires_at bigint NOT NULL,PRIMARY KEY(scope,key_hash,bucket))`);}).catch(e=>{this.ready=undefined;throw e;});}
  async take(scope:string,key:string,windowMs:number,max:number,now=Date.now()){
    if(!/^[a-z0-9:-]{1,64}$/i.test(scope)||!Number.isSafeInteger(windowMs)||windowMs<1000||!Number.isSafeInteger(max)||max<1)throw new Error("Invalid rate policy");
    await this.ensure();const bucket=Math.floor(now/windowMs),until=(bucket+1)*windowMs;
    const hash=crypto.createHash("sha256").update(key).digest("hex");
    const r=await this.db.raw(`INSERT INTO xoi_rate_windows(scope,key_hash,bucket,count,expires_at) VALUES (?,?,?,1,?)
      ON CONFLICT(scope,key_hash,bucket) DO UPDATE SET count=xoi_rate_windows.count+1 RETURNING count`,[scope,hash,bucket,until]);
    return {allowed:Number(r.rows[0].count)<=max,retryAfter:Math.max(1,Math.ceil((until-now)/1000))};
  }
  async clean(now=Date.now()){await this.ensure();await this.db("xoi_rate_windows").where("expires_at","<",now-3600000).delete();}
}
