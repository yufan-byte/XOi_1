/** Read-only application verification; no queue insert, model, payment or balance write. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
const db=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL});
async function main(){
 await db.connect();
 const user=(await db.query("SELECT session_version FROM o_user WHERE id=1")).rows[0];
 const secret=(await db.query("SELECT value FROM o_setting WHERE key=$1",["tokenKey"])).rows[0].value;
 const token="Bearer "+jwt.sign({id:1,session_version:Number(user.session_version||0)},secret,{expiresIn:120});
 const base="http://localhost:12121";
 assert.equal((await fetch(base+"/api/healthz",{signal:AbortSignal.timeout(5000)})).status,200);
 assert.equal((await fetch(base+"/api/readyz",{signal:AbortSignal.timeout(8000)})).status,200);
 const anon=await fetch(base+"/api/workspace/generation-tasks");assert.equal(anon.status,401);
 const response=await fetch(base+"/api/workspace/generation-tasks",{headers:{Authorization:token},signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,200);const body=await response.json() as any;
 assert.ok(Array.isArray(body.data));assert.ok(body.data.length<=50);
 for(const row of body.data)for(const field of ["request","apiKey","headers","prompt","payload"])assert.equal(row[field],undefined);
 assert.match(response.headers.get("cache-control")||"",/no-store/);
 const schema=(await db.query("SELECT to_regclass('xoi_media_queue') name")).rows[0];assert.ok(schema.name);
 console.log(JSON.stringify({passed:true,health:true,readiness:true,authenticatedTaskSummary:true,anonymousBlocked:true,noRawQueuePayload:true,paidRequests:0,queueWrites:0,balanceWrites:0}));
}
void main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.end());
