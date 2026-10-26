// No upstream access: a minimal isolated page and fake transport validate consent and receipts.
import assert from "node:assert/strict";
import http from "node:http";
import { build } from "esbuild";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const result = await build({ entryPoints:["src/utils/billingGate.ts"],bundle:true,format:"esm",write:false });
const server = http.createServer((req,res) => {
  if (req.url === "/gate.js") { res.setHeader("content-type","text/javascript");res.end(result.outputFiles[0].text);return; }
  res.setHeader("content-type","text/html");res.end(`<html><body><button id="start">测试生成</button><script type="module">
    import { installBillingFetchGuard } from '/gate.js';
    localStorage.setItem('token','fixture-token');
    window.calls=[];window.phase='success';window.result='';
    window.fetch=async(input,init)=>{
      const r=new Request(typeof input==='string'?new URL(input,location.href):input,init),path=new URL(r.url).pathname;
      if(path==='/api/billing/preview') return new Response(JSON.stringify({data:{label:'图片生成',model:'测试模型',count:1,quote:window.phase==='unknown'?null:{yuan:.75},budget:{defaultPoints:10,maxPoints:100,maxCalls:20,maxOutputTokens:4096,minutes:30}}}),{status:window.phase==='preview-error'?503:200,headers:{'content-type':'application/json'}});
      if(path==='/api/billing/authorize'){window.authorizedPoints=JSON.parse(await r.text()).points;return new Response(JSON.stringify({data:{id:crypto.randomUUID(),limitPoints:window.authorizedPoints}}),{headers:{'content-type':'application/json'}});}
      if(path.endsWith('/stop')){window.stopped=true;return new Response(JSON.stringify({data:{stopped:true}}),{headers:{'content-type':'application/json'}});}
      if(path.startsWith('/api/billing/receipt')) return new Response(JSON.stringify({data:{status:window.phase==='recorded'?'recorded':'pending',points:3.9}}),{headers:{'content-type':'application/json'}});
      window.calls.push({path,id:r.headers.get('x-xoi-billing-id')});
      return new Response(JSON.stringify({data:[]}),{status:window.phase==='failure'?500:200,headers:{'content-type':'application/json'}});
    };
    installBillingFetchGuard();
    document.getElementById('start').onclick=()=>{window.result='';fetch('/api/v1/images/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'fixture',prompt:'图片'})}).then(()=>window.result='done').catch(e=>window.result=e.message)};
    window.ready=true;
  </script></body></html>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:"chrome",headless:true});const page=await browser.newPage();
await page.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
try {
  await page.goto(origin);await page.waitForFunction(()=>window.ready);
  await page.locator('#start').click();await page.getByRole('dialog').getByText(/7.5 积分/).waitFor();
  await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForFunction(()=>window.result.includes('已取消'));
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.locator('#start').click();assert.equal(await page.getByRole('spinbutton').isVisible(),false);await page.getByText('调整上限 / 计费说明',{exact:true}).click();await page.getByRole('spinbutton',{name:'本轮预算上限（积分）'}).fill('101');assert.equal(await page.getByRole('button',{name:'确认并调用'}).isDisabled(),true);
  await page.getByRole('spinbutton',{name:'本轮预算上限（积分）'}).fill('9');await page.getByRole('button',{name:'确认并调用'}).click();await page.waitForFunction(()=>window.result==='done');assert.equal(await page.evaluate(()=>window.authorizedPoints),9);
  assert.equal(await page.evaluate(()=>window.calls.length),1);assert.match(await page.evaluate(()=>window.calls[0].id),/^[0-9a-f-]{36}$/);
  await page.locator('#xoi-billing-notice').getByText(/费用结算中/).waitFor();
  await page.evaluate(()=>window.phase='recorded');await page.locator('#xoi-billing-notice').getByText(/已消耗 3.9 积分/).waitFor();
  assert.equal(await page.locator('#xoi-billing-notice').evaluate(node=>node.classList.contains('is-compact')),true);
  assert.equal(await page.getByRole('button',{name:'停止后续调用'}).count(),0);
  await page.evaluate(()=>window.phase='unknown');await page.locator('#start').click();await page.getByRole('dialog').getByText(/暂无可靠完整预估，不代表免费/).waitFor();await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.evaluate(()=>window.phase='preview-error');await page.locator('#start').click();await page.waitForFunction(()=>window.result.includes('未提交模型请求'));assert.equal(await page.evaluate(()=>window.calls.length),1);
  await page.evaluate(()=>window.phase='failure');await page.locator('#start').click();await page.getByRole('button',{name:'确认并调用'}).click();await page.locator('#xoi-billing-notice').getByText(/费用状态待核对/).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),2);
  // A one-shot request has no local follow-up workflow, so presenting a stop action is misleading.
  assert.equal(await page.getByRole('button',{name:'停止后续调用'}).count(),0);
  console.log(JSON.stringify({passed:true,cancelledRequests:0,confirmedRequests:2,upstreamPaidRequests:0}));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
