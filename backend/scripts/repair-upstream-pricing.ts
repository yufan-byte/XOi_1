/** Explicit operator approval required: removes incompatible models, syncs prices, no generation. */
import "dotenv/config";
for (const name of ["HTTP_PROXY","HTTPS_PROXY","http_proxy","https_proxy","ALL_PROXY","all_proxy"]) delete process.env[name];
async function main() {
  if (!process.argv.includes("--quarantine-incompatible")) throw new Error("需要显式指定 --quarantine-incompatible 才允许下架不兼容型号");
  const { syncUpstreamPricing } = await import("../src/lib/model-catalog/sync");
  const result = await syncUpstreamPricing({quarantineExistingUnsupported:true});
  console.log(JSON.stringify({ ...result, paidRequests:0 }));
}
void main().then(()=>process.exit(0)).catch(error=>{console.error(`价格修复未完成：${error.message}`);process.exit(1);});
