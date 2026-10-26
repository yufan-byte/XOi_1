// Exact-build browser checks. All APIs are fixtures; no real model calls or project writes.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
const {chromium}=await import(process.env.XOI_PLAYWRIGHT_MODULE||'/Users/zhaochenyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=process.env.XOI_FRONTEND_DIST_DIR||'/tmp/xoi-canvas-flow-web',atelier=process.env.XOI_ATELIER_DIST_DIR||'/tmp/xoi-canvas-flow-atelier',out=process.env.XOI_DIRECTOR_QA_DIR||'/tmp/xoi-canvas-flow-qa';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1680,height:1050}});const errors=[],report=[],traffic={index:0,model:0,authorize:0,config:0,projects:0};let configRelease,configGate=new Promise(r=>configRelease=r);let configOk=false;const fastSend=process.env.XOI_FAST_SEND==='1';let releaseIndex;const indexGate=new Promise(r=>releaseIndex=r);if(!fastSend)releaseIndex();
await context.addInitScript(()=>{const timeout=AbortSignal.timeout.bind(AbortSignal);AbortSignal.timeout=ms=>timeout(ms===10000?120000:ms);localStorage.setItem('token','Bearer isolated-flow-fixture');localStorage.setItem('userId','501');localStorage.setItem('xoi.platform-welcome.v1:501','done');localStorage.setItem('xo_assistant_model_value','newapi:fixture-text');});
await context.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url()),p=u.pathname;
 if(p.startsWith('/socket.io/'))return route.abort();
 if(p.startsWith('/api/')){
  if(p==='/api/config'){traffic.config++;await configGate;return route.fulfill({status:configOk?200:503,json:configOk?{chat_models:['fixture-text'],image_models:['fixture-image'],video_models:['fixture-video']}:{message:'fixture unavailable'}});}
  if(p==='/api/auth/me')return route.fulfill({json:{user:{id:501,name:'隔离验证'}}});
  if(p==='/api/canvases') {if(req.method()!=='GET')traffic.projects++;return route.fulfill({json:req.method()==='GET'?{canvases:[]}:{canvas:{id:'canvas-fixture-'+traffic.projects,updated_at:Date.now()}}});}
  if(p.startsWith('/api/canvases/'))return route.fulfill({json:{canvas:{id:p.split('/').at(-1),...(req.method()==='GET'?{}:req.postDataJSON()),updated_at:Date.now()}}});
  if(p==='/api/billing/preview'){const body=req.postDataJSON();traffic.lastPreview=body;traffic.previews=(traffic.previews||0)+1;return route.fulfill({json:{code:200,data:{label:'画布文本工作流',model:'fixture-text',modelId:'fixture-text',free:false,count:1,quote:{yuan:.06},budget:{defaultPoints:1,maxPoints:10,maxCalls:10,maxOutputTokens:4096,minutes:30}}}});}
  if(p.includes('/billing/authorize'))traffic.authorize++;
  if(/chat\/completions|canvas\/agent|director\/plan|director\/compose/.test(p))traffic.model++;
  let data=[];
  if(p==='/api/login/self')data={id:501,name:'隔离验证',balance:20};
  if(p==='/api/model-catalog')data=[{id:'newapi',modelName:'fixture-text',name:'fixture-text',type:'text',value:'fixture-text',label:'fixture-text',capabilities:['vision']}];
  if(p==='/api/model-catalog/quote')data={yuan:0,points:0};
  return route.fulfill({json:{code:200,data}});
 }
 if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();
 const a=p.startsWith('/atelier-canvas/'),r=a?atelier:root,path=resolve(r,'.'+(a?p.slice('/atelier-canvas'.length):p==='/'?'/index.html':p));
 if(a&&p.endsWith('/index.html')){traffic.index++;await indexGate;}
 if(!path.startsWith(r+'/'))return route.abort();
 try{return route.fulfill({body:await readFile(path),contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'}[extname(path)]||'application/octet-stream'});}catch{return route.abort();}
});
const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
const pass=(name,details={})=>{report.push({name,...details});console.log('PASS',name,details);};
try{
 await page.goto('http://localhost:12121/#/aiAssistant');const input=page.getByRole('textbox',{name:'描述创作目标，或让我继续操作画布',exact:true});await input.fill('保留需求验证');
 if(!fastSend)await page.waitForFunction(()=>document.querySelector('iframe.atelier-canvas-iframe')?.contentWindow?.location.hash==='#/canvas',{timeout:90000});
 else await page.waitForFunction(()=>!!document.querySelector('iframe.atelier-canvas-iframe'));
 assert.equal(traffic.index,1);assert.equal(traffic.model,0);assert.equal(traffic.authorize,0);
 if(!fastSend){await page.waitForFunction(()=>!document.querySelector('.canvas-loading-overlay'));await page.locator('iframe.atelier-canvas-iframe').evaluate(el=>{el.contentWindow.__qaSession='warm-runtime';});}
 const started=Date.now();await input.press('Enter');releaseIndex();await page.waitForURL('**/#/canvas**');const frame=page.frameLocator('.atelier-canvas-iframe');
 await frame.getByText('画布已打开，正在准备所选模型…',{exact:true}).waitFor({timeout:90000});
 if(fastSend)await page.locator('iframe').evaluate(el=>el.contentWindow.__qaSession='warm-runtime');
 assert.equal(traffic.index,1);assert.equal(traffic.model,0);assert.equal(traffic.authorize,0);assert.equal(await page.locator('iframe').evaluate(el=>el.contentWindow.__qaSession),'warm-runtime');
 pass(fastSend?'paste-and-send while iframe is loading queues the handoff without reloading':'focus warms one canvas; send reuses it and opens the editor before model config responds',{elapsedMs:Date.now()-started,indexRequests:traffic.index});
 const firstProjectId=await page.locator('iframe').evaluate(el=>el.contentWindow.location.hash.split('/').at(-1));
 configRelease();await frame.getByText('所选模型暂不可用，需求已保留在输入框；请选择模型后发送。',{exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelector('iframe').contentDocument.querySelectorAll('[contenteditable=true]')].some(t=>t.textContent==='保留需求验证'));
 assert.equal(traffic.model,0);assert.equal(traffic.authorize,0);pass('unavailable model leaves an editable draft without fallback calls or authorization');
 await frame.getByRole('button',{name:'回到对话',exact:true}).click();await input.fill('第二次需求保留');await input.press('Enter');await page.waitForURL('**/#/canvas**');await page.waitForFunction(()=>[...document.querySelector('iframe').contentDocument.querySelectorAll('[contenteditable=true]')].some(t=>t.textContent==='第二次需求保留'));
 assert.equal(traffic.index,1);assert.equal(await page.locator('iframe').evaluate(el=>el.contentWindow.__qaSession),'warm-runtime');pass('second handoff opens a separate project in the same iframe and preserves the new draft');
 const secondProjectId=await page.locator('iframe').evaluate(el=>el.contentWindow.location.hash.split('/').at(-1));
 assert.notEqual(firstProjectId,secondProjectId);
 await page.evaluate(id=>{location.hash='#/canvas?id='+id;},firstProjectId);
 await page.waitForFunction(id=>document.querySelector('iframe').contentWindow.location.hash==='#/canvas/'+id,firstProjectId);
 assert.equal(traffic.index,1);assert.equal(await page.locator('iframe').evaluate(el=>el.contentWindow.__qaSession),'warm-runtime');
 await page.evaluate(id=>{location.hash='#/canvas?id='+id;},secondProjectId);
 await page.waitForFunction(id=>document.querySelector('iframe').contentWindow.location.hash==='#/canvas/'+id,secondProjectId);
 pass('explicit canvas id switches the live editor and keeps the loaded runtime');
 const payload={title:'灵感复刻尺寸验证',nodes:[{id:'text',type:'text',x:0,y:0,w:360,h:180,data:{content:'完整提示词保留'}},{id:'cfg',type:'imageConfig',x:400,y:0,w:200,h:120,data:{}},{id:'result',type:'image',x:650,y:0,w:240,h:180,data:{}},{id:'cfg2',type:'videoConfig',x:400,y:210,w:200,h:120,data:{duration:5}}],edges:[{s:'text',t:'cfg'},{s:'cfg',t:'result'},{s:'text',t:'cfg2'}]};
 configOk=true;await page.evaluate(payload=>{localStorage.setItem('xoi_canvas_graph_v1',JSON.stringify(payload));location.hash='#/canvas?source=xoi&graph=1&from=square';},payload);
 await frame.locator('[data-node-id="cfg"]').waitFor();assert.equal(await frame.locator('[data-node-id]').count(),4);
 for(const id of ['cfg','cfg2']){
  const node=frame.locator(`[data-node-id="${id}"]`);const size=await node.evaluate(el=>({w:el.offsetWidth,h:el.offsetHeight}));assert.ok(size.w>=560&&size.h>=360,JSON.stringify(size));
  const gen=node.getByRole('button',{name:'开始生成',exact:true});await gen.waitFor();const nb=await node.boundingBox(),gb=await gen.boundingBox();assert.ok(gb.y+gb.height<=nb.y+nb.height+1,'generation button fits '+id);
 }
 assert.ok(await frame.locator('[data-node-id="text"]').getByText('完整提示词保留',{exact:true}).isVisible());assert.equal(traffic.index,1);assert.equal(traffic.model,0);assert.equal(traffic.authorize,0);
 await page.screenshot({path:join(out,'灵感复刻-完整配置卡片.png')});pass('legacy inspiration nodes resize and reflow; text, media placeholders and generation controls remain intact');
 // The restored model is now available: a fresh handoff reaches cost confirmation once, never submits before consent.
 await page.evaluate(()=>{localStorage.setItem('xoi_canvas_handoff_v1',JSON.stringify({prompt:'生成一个验证文本节点',model:'newapi:fixture-text',source:'aiAssistant'}));location.hash='#/canvas?source=xoi&handoff=1&n=ready';});
 await frame.getByRole('dialog',{name:'模型调用费用确认',exact:true}).waitFor();assert.equal(traffic.previews,1);assert.equal(traffic.model,0);assert.equal(traffic.authorize,0);assert.match(JSON.stringify(traffic.lastPreview),/fixture-text/);
 await frame.getByRole('dialog',{name:'模型调用费用确认',exact:true}).getByRole('button',{name:'取消',exact:true}).click();await frame.locator('.xoi-billing-overlay').waitFor({state:'hidden'});assert.equal(traffic.model,0);assert.equal(traffic.authorize,0);assert.equal(traffic.index,1);pass('model recovery uses selected model and asks once; cancel sends no authorization or generation');
 assert.deepEqual(errors,[]);await writeFile(join(out,'report.json'),JSON.stringify({report,traffic,errors},null,2));
}catch(e){console.log('ERRORS',errors);console.log('BODY',await page.locator('iframe').evaluate(el=>el.contentDocument?.body?.innerText).catch(()=>''));await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});throw e;}
finally{releaseIndex();configRelease();await context.close();await browser.close();}
