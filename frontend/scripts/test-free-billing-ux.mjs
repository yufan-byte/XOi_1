// Isolated browser fixture: no real API, account, gateway or model request.
import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({entryPoints:['src/utils/billingGate.ts'],bundle:true,format:'esm',write:false});
const server=http.createServer((req,res)=>{
  if(req.url==='/gate.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  res.setHeader('content-type','text/html; charset=utf-8');res.end(`<html><body><script type="module">
    import {authorizeModelCall} from '/gate.js';
    localStorage.setItem('token','fixture');window.mode='free';window.calls=0;window.auth=[];
    window.fetch=async(input,init)=>{
      const path=String(input);
      if(path==='/api/billing/preview')return new Response(JSON.stringify({data:{label:'导演 AI 助手',model:'Agnes',modelId:'agnes-2.5-flash',free:true,quote:{yuan:0},count:1,budget:{defaultPoints:.001,maxPoints:1,maxCalls:20,maxOutputTokens:4096,minutes:30}}}));
      if(path==='/api/billing/authorize'){
        window.auth.push(JSON.parse(init.body));
        if(window.mode==='price-change')return new Response(JSON.stringify({message:'模型已不是免费价格，收费操作需要先确认费用'}),{status:400});
        return new Response(JSON.stringify({data:{id:crypto.randomUUID(),limitPoints:.001,freeOnly:window.mode!=='legacy'}}));
      }
      return new Response(JSON.stringify({data:{status:'pending'}}));
    };
    window.run=async()=>{try{const ticket=await authorizeModelCall('/socket/productionAgent',{model:'agnes-2.5-flash'});if(!ticket)throw new Error('missing fixture ticket');window.calls++;return 'done';}catch(e){return e.message;}};
    window.ready=true;
  </script></body></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin);await page.waitForFunction(()=>window.ready);
  for(let i=0;i<5;i++)assert.equal(await page.evaluate(()=>window.run()),'done');
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.evaluate(()=>window.auth.every(a=>a.freeOnly===true&&a.points===.001&&a.model==='agnes-2.5-flash')),true);
  await page.locator('#xoi-billing-notice').getByText(/免费模型 · 0 积分/).waitFor();
  await page.evaluate(()=>window.mode='price-change');assert.match(await page.evaluate(()=>window.run()),/需要先确认费用/);
  await page.evaluate(()=>window.mode='legacy');assert.match(await page.evaluate(()=>window.run()),/免费调用保护未启用/);
  assert.equal(await page.evaluate(()=>window.calls),5);
  console.log(JSON.stringify({passed:true,freeActionsWithoutDialog:5,priceChangeBlocked:true,legacyBackendBlocked:true,paidRequests:0}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
