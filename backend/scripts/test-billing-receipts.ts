/** Only session-local PostgreSQL temp fixtures; rollback leaves all real balances/logs untouched. */
import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";
import { BILLING_RECEIPT_QUERY } from "../src/utils/billingReceiptQuery";
async function main() {
  const client = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL });
  const id = "fe5a3ab2-23d6-41b5-8a66-57eb8e432a8e";
  try {
    await client.connect(); await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE logs(id bigint,user_id bigint,request_id text,quota bigint,type int,model_name text,created_at bigint) ON COMMIT DROP");
    await client.query("CREATE TEMP TABLE xoi_billing_links(user_id bigint,billing_id uuid,request_id text) ON COMMIT DROP");
    await client.query("INSERT INTO xoi_billing_links VALUES (1,$1,'fixture-request'),(2,$1,'fixture-request')",[id]);
    await client.query("INSERT INTO logs VALUES (1,1,'fixture-request',100000,2,'fixture',0),(2,2,'fixture-request',200000,2,'fixture',0),(3,1,'fixture-request',-25000,2,'fixture',0),(4,1,'fixture-request',999999,1,'topup',0)");
    let index=0; const sql = BILLING_RECEIPT_QUERY.replace(/\?/g,()=>`$${++index}`);
    const one = (await client.query(sql,[1,id])).rows, two = (await client.query(sql,[2,id])).rows;
    assert.deepEqual(one.map(row=>Number(row.id)),[1,3]);assert.deepEqual(two.map(row=>Number(row.id)),[2]);
    assert.equal(one.reduce((sum,row)=>sum+Number(row.quota),0)/50000,1.5);
    assert.equal((await client.query(sql,[3,id])).rowCount,0);
    assert.equal((await client.query(sql,[1,"05da3ab2-23d6-41b5-8a66-57eb8e432a8e"])).rowCount,0);
    console.log(JSON.stringify({passed:true,crossAccountLeak:false,refundSignPreserved:true,realBalanceChanges:0,paidRequests:0}));
  } finally {await client.query("ROLLBACK").catch(()=>{});await client.end();}
}
void main().catch(()=>{console.error("费用回执临时夹具测试失败，未修改真实账单");process.exitCode=1;});
