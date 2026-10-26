/** Authorized local app smoke: short-lived server-signed token, read/quote endpoints only. */
import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
async function main() {
  const client = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL });
  try {
    await client.connect();
    const id = Number(process.env.XOI_BILLING_SMOKE_USER_ID || 1);
    const user = (await client.query('SELECT id,session_version FROM "o_user" WHERE id=$1',[id])).rows[0];
    const secret = (await client.query('SELECT value FROM "o_setting" WHERE key=$1',["tokenKey"])).rows[0]?.value;
    assert.ok(user && secret);
    const token = jwt.sign({id:Number(user.id),session_version:Number(user.session_version || 0)},String(secret),{expiresIn:120,algorithm:"HS256"});
    const base = "http://127.0.0.1:12121";
    const headers = {Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
    const response = await fetch(`${base}/api/model-catalog`,{headers}); assert.equal(response.status,200);
    const models = (await response.json()).data;
    const verified = [];
    for (const [kind,path] of [["text","/v1/chat/completions"],["image","/v1/images/generations"],["video","/v1/videos"],["audio","/v1/audio/speech"]]) {
      const model = models.find((row:any)=>row.type===kind && !/^agnes/.test(row.modelName) && row.price);
      if (!model) {verified.push({kind,status:"no-priced-model"});continue;}
      const preview = await fetch(`${base}/api/billing/preview`,{method:"POST",headers,body:JSON.stringify({path,body:{model:model.modelName,inputLength:100,seconds:5,resolution:"720p",n:1}})});
      assert.equal(preview.status,200);
      const data = (await preview.json()).data;
      assert.ok(data.model);assert.ok(data.quote===null || Math.abs(data.quote.points-data.quote.yuan*10)<1e-8);
      assert.equal(data.budget.maxCalls,20);assert.equal(data.budget.maxOutputTokens,4096);assert.ok(data.budget.maxPoints<=1000);
      verified.push({kind,status:data.quote?"quoted":"explicit-unknown",model:data.model});
    }
    const receipt = await fetch(`${base}/api/billing/receipt/fe5a3ab2-23d6-41b5-8a66-57eb8e432a8e`,{headers});assert.equal(receipt.status,200);
    assert.equal((await receipt.json()).data.status,"pending");
    const anonymous = await fetch(`${base}/api/billing/preview`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});assert.equal(anonymous.status,401);
    const oversize = await fetch(`${base}/api/billing/authorize`,{method:"POST",headers,body:JSON.stringify({path:"/v1/images/generations",points:1001})});assert.equal(oversize.status,400);
    const authorization=await fetch(`${base}/api/billing/authorize`,{method:"POST",headers,body:JSON.stringify({path:"/v1/images/generations",points:.001})});assert.equal(authorization.status,200);
    const budget=(await authorization.json()).data;assert.equal(budget.limitPoints,.001);
    const stop=await fetch(`${base}/api/billing/budget/${budget.id}/stop`,{method:"POST",headers});assert.equal(stop.status,200);
    const stopped=await fetch(`${base}/api/billing/receipt/${budget.id}`,{headers});assert.equal((await stopped.json()).data.budget.state,"stopped");
    console.log(JSON.stringify({passed:true,verified,anonymousRejected:true,pendingNotFree:true,budgetAuthorizedAndStopped:true,oversizeBudgetRejected:true,paidRequests:0}));
  } finally {await client.end();}
}
void main().catch(()=>{console.error("本地计费接口检查失败；没有调用生成接口");process.exitCode=1;});
