import assert from "node:assert/strict";
import http from "node:http";
import {build} from "esbuild";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright");
const compiled=await build({entryPoints:["src/utils/billingGate.ts"],bundle:true,format:"esm",platform:"browser",write:false});
const server=http.createServer((req,res)=>{
  if(req.url==="/gate.js"){res.setHeader("content-type","text/javascript");res.end(compiled.outputFiles[0].text);return;}
  res.setHeader("content-type","text/html");res.end(`<html><body><script type="module">
    import {beginCanvasTextBudget,installBillingFetchGuard} from '/gate.js';
    localStorage.setItem('token','fake-token');window.calls=[];window.authorizations=0;
    window.fetch=async(input,init)=>{const r=new Request(typeof input==='string'?new URL(input,location.href):input,init),path=new URL(r.url).pathname;
      if(path==='/api/billing/preview')return new Response(JSON.stringify({data:{label:'连续文字规划',model:'Agnes',modelId:'agnes-2.5-flash',free:true,quote:{yuan:0},count:1,budget:{maxPoints:1,defaultPoints:.001,maxCalls:20,maxOutputTokens:4096,minutes:30}}}),{headers:{'content-type':'application/json'}});
      if(path==='/api/billing/authorize'){window.authorizations++;window.authorizationBody=JSON.parse(await r.text());return new Response(JSON.stringify({data:{id:crypto.randomUUID(),limitPoints:.001,freeOnly:true}}),{headers:{'content-type':'application/json'}});}
      if(path.endsWith('/stop'))return new Response('{}',{headers:{'content-type':'application/json'}});
      if(path.startsWith('/api/billing/receipt/'))return new Response(JSON.stringify({data:{status:'pending'}}),{headers:{'content-type':'application/json'}});
      window.calls.push({id:r.headers.get('x-xoi-billing-id'),step:r.headers.get('x-xoi-billing-step')});return new Response('{}');
    };installBillingFetchGuard();window.controller=new AbortController();window.finish=beginCanvasTextBudget(window.controller.signal,()=>window.controller.abort());
    window.one=()=>fetch('/api/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'agnes-2.5-flash'}),signal:window.controller.signal});
    window.done=false;window.start=()=>{void(async()=>{await window.one();await window.one();window.done=true})()};window.ready=true;
  </script></body></html>`);
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
  const page=await browser.newPage();await page.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base);await page.waitForFunction(()=>window.ready);await page.evaluate(()=>window.start());
  await page.waitForFunction(()=>window.done);assert.equal(await page.getByRole('dialog').count(),0);
  assert.deepEqual(await page.evaluate(()=>window.authorizationBody),{path:'/workflow/canvas-text',points:.001,model:'agnes-2.5-flash',freeOnly:true,automatic:false});
  const result=await page.evaluate(()=>({calls:window.calls,authorizations:window.authorizations}));
  assert.equal(result.authorizations,1);assert.equal(result.calls.length,2);assert.equal(result.calls[0].id,result.calls[1].id);assert.notEqual(result.calls[0].step,result.calls[1].step);
  // Free zero-cost receipts are intentionally silent; stop via the Agent's run signal.
  await page.evaluate(()=>window.controller.abort());
  const next=await page.evaluate(async()=>{try{await window.one();return 'unexpected'}catch{return 'stopped'}});assert.equal(next,'stopped');assert.equal(await page.evaluate(()=>window.calls.length),2);
  console.log(JSON.stringify({passed:true,singleAuthorization:true,uniqueStepIds:true,stopCancelsLoop:true,paidRequests:0}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
