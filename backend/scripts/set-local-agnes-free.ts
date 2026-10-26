/** Explicit approval: local dev pricing only. Never update balances or generate content. */
import "dotenv/config";
for(const key of ["HTTP_PROXY","HTTPS_PROXY","http_proxy","https_proxy","ALL_PROXY","all_proxy"])delete process.env[key];
import {requireDb} from "../src/lib/agent/db";
import {getOptions,putOption} from "../src/lib/agent/newapi-admin";
async function main(){
  if(process.env.NODE_ENV!=="dev" || !process.argv.includes('--approved-local-test-only'))throw new Error("仅允许显式批准的本地开发测试配置");
  const db=requireDb(),client=await db.connect();let locked=false;
  try {
    locked=(await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked",['xoi:upstream-pricing-options'])).rows[0].locked;
    if(!locked)throw new Error("价格同步正在执行，请稍后重试");
    const channels=(await db.query("SELECT id,name,models FROM channels WHERE id=1 AND status=1")).rows;
    if(!channels.length)throw new Error("本地测试渠道不存在");
    const names=String(channels[0].models).split(',');
    if(!names.length || names.some(name=>!/^agnes(?:-|$)/i.test(name)))throw new Error("渠道包含非 Agnes 型号，已拒绝批量零价操作");
    const options=await getOptions(),prices=JSON.parse(options.ModelPrice||"{}"),expressions=JSON.parse(options['billing_setting.billing_expr']||"{}");
    if(names.some(name=>expressions[name]))throw new Error("测试型号存在表达式计费，需单独审核，未修改价格");
    await db.query("CREATE TABLE IF NOT EXISTS xoi_local_pricing_repairs(id bigserial PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),models jsonb NOT NULL,previous_model_price text NOT NULL)");
    await db.query("INSERT INTO xoi_local_pricing_repairs(models,previous_model_price) VALUES ($1,$2)",[JSON.stringify(names),options.ModelPrice||"{}"]);
    for(const name of names)prices[name]=0;
    await putOption('ModelPrice',JSON.stringify(prices));
    console.log(JSON.stringify({changedModels:names.length,zeroPriceModels:names,markupChanged:false,zaowuPricesChanged:false,paidRequests:0}));
  } finally {if(locked)await client.query("SELECT pg_advisory_unlock(hashtext($1))",['xoi:upstream-pricing-options']);client.release();await db.end();}
}
void main().catch(error=>{console.error(`本地测试零价配置失败：${error.message}`);process.exitCode=1;});
