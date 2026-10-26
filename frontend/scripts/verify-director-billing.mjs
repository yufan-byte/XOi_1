// Uses the existing 12121 origin with isolated browser responses. No real account or model calls.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {chromium}=await import(process.env.XOI_PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({entryPoints:['src/utils/billingGate.ts'],bundle:true,format:'esm',write:false});
const base=process.env.XOI_BASE_URL||'http://127.0.0.1:12121';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext();await context.route('**/*',r=>{
  const url=new URL(r.request().url());if(url.origin!==new URL(base).origin)return r.abort();
  if(url.pathname==='/billing-fixture.js')return r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
  if(url.pathname!=='/billing-fixture')return r.abort();
  return r.fulfill({contentType:'text/html; charset=utf-8',body:`<html><head><meta charset="UTF-8"></head><body><button id="run">生成方案</button><script type="module">
   import {installBillingFetchGuard} from '/billing-fixture.js';
   localStorage.setItem('token','isolated-fee-fixture');window.mode='paid';window.sent=0;window.authorized=0;window.stopped=0;window.result='';
   window.fetch=async(input,init)=>{
    const request=new Request(typeof input==='string'?new URL(input,location.href):input,init),path=new URL(request.url).pathname;
    if(path==='/api/billing/preview')return new Response(JSON.stringify({data:{label:'AI 导演方案',model:'fixture',modelId:'fixture',free:window.mode==='free-price-change',quote:{yuan:window.mode==='free-price-change'?0:.06},count:1,budget:{defaultPoints:1,maxPoints:10,maxCalls:20,maxOutputTokens:4096,minutes:30}}}));
    if(path==='/api/billing/authorize'){
      window.authorized++;if(window.mode==='free-price-change')return new Response(JSON.stringify({message:'模型已改为收费，需要先确认费用'}),{status:400});
      const id=crypto.randomUUID();if(window.mode==='abort-after-authorize')window.requestController.abort();return new Response(JSON.stringify({data:{id,limitPoints:1}}));
    }
    if(path.endsWith('/stop')){window.stopped++;return new Response(JSON.stringify({data:{stopped:true}}));}
    if(path.startsWith('/api/billing/receipt/'))return new Response(JSON.stringify({data:window.mode==='not-submitted'?{status:'not_submitted',points:0,budget:{state:'stopped',calls:0}}:{status:'pending',points:0,budget:{state:'stopped',calls:1,reason:'费用待核对'}}}));
    if(path==='/api/aiAssistant/director/plan'){window.sent++;if(window.mode==='unknown')throw new TypeError('fixture connection lost');return new Response(JSON.stringify({message:'fixture response'}),{status:window.mode==='not-submitted'?400:200});}
    throw new Error('unexpected request');
   };
   installBillingFetchGuard();
   window.start=()=>{window.result='';window.requestController=new AbortController();void fetch('/api/aiAssistant/director/plan',{method:'POST',headers:{'content-type':'application/json'},signal:window.requestController.signal,body:JSON.stringify({model:'newapi:fixture',intent:'一个镜头'})}).then(()=>window.result='done').catch(e=>window.result=e.message);};
   document.getElementById('run').onclick=window.start;window.ready=true;
  </script></body></html>`});
 });
 const page=await context.newPage();await page.goto(base+'/billing-fixture');await page.waitForFunction(()=>window.ready);
 await page.locator('#run').click();await page.getByRole('dialog',{name:'模型调用费用确认'}).waitFor();await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForFunction(()=>window.result.includes('已取消'));assert.equal(await page.evaluate(()=>window.sent),0);assert.equal(await page.evaluate(()=>window.authorized),0);
 console.log('PASS Cancel before confirmation never authorizes or submits a model request');
 await page.evaluate(()=>window.mode='abort-after-authorize');await page.locator('#run').click();await page.getByRole('button',{name:'确认并调用'}).click();await page.waitForFunction(()=>window.result.includes('已取消'));assert.equal(await page.evaluate(()=>window.sent),0);assert.equal(await page.evaluate(()=>window.stopped),1);
 console.log('PASS Cancellation after authorization closes the unused budget and never submits a model request');
 await page.evaluate(()=>window.mode='free-price-change');await page.locator('#run').click();await page.waitForFunction(()=>window.result.includes('需要先确认费用')).catch(async e=>{console.log('FREE_PHASE',await page.evaluate(()=>({mode:window.mode,result:window.result,sent:window.sent,authorized:window.authorized,body:document.body.innerText})));throw e;});assert.equal(await page.evaluate(()=>window.sent),0);assert.equal(await page.getByRole('dialog').count(),0);
 console.log('PASS A formerly free model cannot silently become a paid request');
 await page.evaluate(()=>window.mode='not-submitted');await page.locator('#run').click();await page.getByRole('button',{name:'确认并调用'}).click();await page.waitForFunction(()=>window.result==='done');await page.locator('#xoi-billing-notice').getByText(/未发起模型调用，未产生模型费用/).waitFor();
 console.log('PASS Confirmed zero-call ledger is displayed as not submitted');
 await page.evaluate(()=>window.mode='unknown');await page.locator('#run').click();await page.getByRole('button',{name:'确认并调用'}).click();await page.waitForFunction(()=>window.result.includes('connection lost'));await page.locator('#xoi-billing-notice').getByText(/费用状态待核对/).waitFor();assert.equal(await page.evaluate(()=>window.sent),2);
 console.log('PASS Unknown transport result stays pending without retry or false refund');
 console.log(JSON.stringify({passed:true,realModelRequests:0,chargedRequests:0}));await context.close();
}finally{await browser.close();}
