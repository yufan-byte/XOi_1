// Loopback synthetic responses only; cannot proxy real account/model/payment requests.
import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const result=await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),entryPoints:['src/utils/billingGate.ts','src/utils/dailySpend.ts'],bundle:true,format:'esm',outdir:'fixture',write:false});
const files=new Map(result.outputFiles.map(f=>['/'+f.path.split('/').pop(),f.text]));
const server=http.createServer((req,res)=>{
 if(files.has(req.url)){res.setHeader('content-type','text/javascript');return res.end(files.get(req.url));}
 res.setHeader('content-type','text/html; charset=utf-8');res.end(`<html><body><script type="module">
 localStorage.setItem('token','fixture-not-real');window.spent=0;window.claims=0;window.authorizations=[];window.stopCalls=0;let notified=false;let offset=0;const realNow=Date.now;Date.now=()=>realNow()+offset;window.advance=()=>offset+=20000;
 window.fetch=async(input,init={})=>{const path=String(input);let data={};
 if(path==='/api/billing/preview')data={label:'批量优化素材提示词',model:'模拟收费文字',modelId:'fixture-model',free:false,count:5,quote:{yuan:.08},budget:{defaultPoints:10,maxPoints:100,maxCalls:1000,maxOutputTokens:8192,minutes:120}};
 else if(path==='/api/billing/authorize'){window.authorizations.push(JSON.parse(init.body));data={id:crypto.randomUUID(),automatic:true,freeOnly:false};}
 else if(path==='/api/billing/preferences')data={day:'2026-10-20',todayYuan:window.spent,todayPoints:window.spent*10,dailyWarningYuan:20,shouldRemind:window.spent>=20,blocking:false};
 else if(path==='/api/billing/daily-notice/claim'){window.claims++;data={day:'2026-10-20',todayYuan:window.spent,dailyWarningYuan:20,claimed:!notified,blocking:false};notified=true;}
 else if(path.startsWith('/api/billing/receipt/'))data={status:'recorded',points:.8,budget:{automatic:true,state:'active',calls:5,maxCalls:1000}};
 else if(path.includes('/stop')){window.stopCalls++;data={};}
 else throw Error('Fixture blocks unknown API');return new Response(JSON.stringify({data}));};
 const gate=await import('/billingGate.js'),daily=await import('/dailySpend.js');window.run=()=>gate.authorizeModelCall('/assetsGenerate/batchPolishAssetsPrompt',{model:'fixture-model',items:[1,2,3,4,5]});window.check=()=>daily.checkDailySpendReminder();window.ready=true;
 </script></body></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let target;
async function call(path,body){const response=await fetch('http://localhost:3456'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body}),signal:AbortSignal.timeout(30000)});const value=await response.json();if(value.error)throw Error(value.error);return value;}
async function owned(){const state=await call('/info?target='+target);return !!state.url&&new URL(state.url).origin===base;}
async function evaluate(code){assert.ok(await owned(),'Fixture tab changed; stop without touching it');return(await call('/eval?target='+target,code)).value;}
try{
 target=(await call('/new',base)).targetId;for(let n=0;n<60;n++){if(await evaluate('window.ready===true'))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await evaluate('!!window.ready'),true);
 for(let n=0;n<5;n++)await evaluate('window.run().then(t=>({id:t.id,automatic:t.automatic}))');
 assert.equal(await evaluate('document.querySelectorAll("[role=dialog],.xoi-billing-notice").length'),0);
 assert.equal(await evaluate('window.authorizations.length===5&&window.authorizations.every(a=>a.automatic===true)'),true);
 await evaluate('window.spent=25;window.advance();window.check()');
 assert.equal(await evaluate('document.querySelectorAll("#xoi-daily-spend-reminder").length'),1);
 assert.equal(await evaluate('document.querySelector("#xoi-daily-spend-reminder").textContent.includes("任务继续运行")'),true);
 await evaluate('window.advance();window.check()');assert.equal(await evaluate('window.stopCalls'),0);assert.equal(await evaluate('document.querySelectorAll("#xoi-daily-spend-reminder").length'),1);
 console.log(JSON.stringify({passed:true,fixtureOnly:true,normalActionsWithoutConfirmation:5,noPerGenerationPopup:true,dailyWarningNonBlocking:true,noCancellation:true,paidRequests:0}));
}finally{if(target&&await owned().catch(()=>false))await call('/close?target='+target).catch(()=>{});await new Promise(r=>server.close(r));}
