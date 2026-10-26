// Simulated billing only: no connection to XOi, NewAPI or any upstream.
import assert from "node:assert/strict";
import http from "node:http";
import { build } from "esbuild";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const result = await build({ stdin: { contents: "export * from './src/utils/billingGate'; export * from '../shared/billableOperations';", resolveDir: process.cwd(), loader: "ts" }, bundle: true, format: "esm", platform: "browser", write: false });
const server = http.createServer((req,res) => {
  if (req.url === "/audit.js") { res.setHeader("content-type", "text/javascript"); res.end(result.outputFiles[0].text); return; }
  res.setHeader("content-type", "text/html");
  res.end(`<html><body><script type="module">
    import {installBillingFetchGuard,billableRoutes,billableOperation} from '/audit.js';
    localStorage.setItem('token','fake-only'); window.routes=Object.keys(billableRoutes);window.calls=[];window.zeroBalance=false;window.done=false;
    window.fetch=async(input,init)=>{const r=new Request(typeof input==='string'?new URL(input,location.href):input,init),path=new URL(r.url).pathname;
      if(path==='/api/billing/preview')return new Response(JSON.stringify({data:{label:'模型测试',model:'模拟模型',modelId:'fixture',free:window.zeroBalance,quote:{yuan:window.zeroBalance?0:.2},count:1,budget:{defaultPoints:window.zeroBalance?0:10,maxPoints:window.zeroBalance?0:100,maxCalls:20,maxOutputTokens:4096,minutes:30}}}),{headers:{'content-type':'application/json'}});
      window.calls.push(path);return new Response('{}',{headers:{'content-type':'application/json'}});
    };installBillingFetchGuard();
    window.start=path=>{window.done=false;window.error='';void fetch('/api'+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(e=>window.error=e.message).finally(()=>window.done=true)};
    window.ready=true;
  </script></body></html>`);
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel:"chrome",headless:true});
try {
  const page = await browser.newPage();
  await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin); await page.waitForFunction(()=>window.ready);
  const routes = await page.evaluate(()=>window.routes);
  for (const path of routes) {
    await page.evaluate(path=>window.start(path),path);
    await page.getByRole("dialog").getByText(/2 积分（¥0.2）/).waitFor();
    await page.getByRole("button",{name:"取消",exact:true}).click();
    await page.waitForFunction(()=>window.done);
  }
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  const legacy = ["/setting/vendorConfig/modelTest/textTest","/setting/vendorConfig/modelTest/imageTest","/setting/vendorConfig/modelTest/videoTest"];
  for(const path of legacy)assert.ok(routes.includes(path));
  await page.evaluate(()=>{window.zeroBalance=true;window.start('/v1/chat/completions')});
  await page.waitForFunction(()=>window.done);
  const zeroBalanceBlocked = await page.evaluate(()=>window.error.includes('最低可用额度') && window.calls.length===0);
  assert.equal(zeroBalanceBlocked,true);assert.equal(await page.getByRole('dialog').count(),0);
  console.log(JSON.stringify({declaredRoutes:routes.length,cancelledDeclaredSubmissions:0,legacyRoutesCovered:legacy.length,freeModelAtZeroBalanceBlocked:zeroBalanceBlocked,paidRequests:0}));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
