// UI fault injection with fixture account/model/ledger; no real generation or paid requests.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
const {chromium}=await import(process.env.XOI_PLAYWRIGHT_MODULE||'/Users/zhaochenyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=process.env.XOI_FRONTEND_DIST_DIR||'/tmp/xoi-director-handoff-web',atelierRoot=process.env.XOI_ATELIER_DIST_DIR||'/tmp/xoi-director-handoff-atelier',dir=process.env.XOI_DIRECTOR_QA_DIR||'/tmp/xoi-director-handoff-qa';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1680,height:1050}}),id='director3d-u501-review';
await context.addInitScript(id=>{localStorage.setItem('token','Bearer isolated-review-fixture');localStorage.setItem('userId','501');localStorage.setItem('xoi.platform-welcome.v1:501','done');localStorage.setItem('director3d-projects-v2:u501',JSON.stringify([{id,name:'导演校验测试',createdAt:Date.now()}]));localStorage.setItem('director3d-active-project-v2:u501',id);localStorage.setItem('xo_assistant_model_value','newapi:fixture-text');},id);
const traffic={authorize:0,model:0,receipt:0},errors=[];let fail=false,receiptStatus='recorded',receiptBudgetState='stopped',graphSent=null;
await context.route('**/*',async route=>{
 const request=route.request(),u=new URL(request.url()),p=u.pathname;
 if(p.startsWith('/socket.io/'))return route.abort();
 if(p.startsWith('/api/')){
  let data=[];
  if(p==='/api/canvases')return route.fulfill({json:request.method()==='GET'?{canvases:[]}:{canvas:{id:'handoff-fixture',updated_at:Date.now()}}});
  if(p.startsWith('/api/canvases/'))return route.fulfill({json:{canvas:{id:'handoff-fixture',...request.postDataJSON(),updated_at:Date.now()}}});
  if(p==='/api/model-catalog/quote')data={yuan:0,points:0,note:'fixture only'};
  if(p==='/api/auth/me')return route.fulfill({json:{user:{id:501,name:'验证账号'}}});
  if(p==='/api/login/self')data={id:501,name:'验证账号',balance:20};
  if(p==='/api/billing/preview')data={label:'AI 导演方案',model:'fixture-text',modelId:'fixture-text',free:false,count:1,quote:{yuan:.06},budget:{defaultPoints:1,maxPoints:10,maxCalls:1,maxOutputTokens:4096,minutes:30}};
  if(p==='/api/billing/authorize'){traffic.authorize++;data={id:`11111111-1111-4111-8111-${String(traffic.authorize).padStart(12,'0')}`,limitPoints:1};}
  if(p.includes('/billing/receipt/')){traffic.receipt++;data={status:receiptStatus,points:receiptStatus==='recorded'?.6:0,budget:{state:receiptBudgetState,calls:1}};}
  if(p==='/api/aiAssistant/director/plan'){
   traffic.model++;if(fail==='hang'){await new Promise(r=>setTimeout(r,15000));return route.abort('failed').catch(()=>{});}if(fail)return route.abort('failed');
   const input=request.postDataJSON();assert.equal(input.durationSeconds,4);
   data={projectId:id,activeShotId:input.scene.activeShotId,plan:{summary:'4秒推进',warnings:[],assumptions:[],renderPrompt:'采访',shots:[{name:'四秒镜头',durationSeconds:4,subjectId:'actor-lead',purpose:'验证',framing:'中景',movement:'推进',blocking:'保留',performance:'站立',lighting:'原灯光',transition:'切',prompt:'采访',camera:{keyframes:[{t:0,position:[0,2,6],target:[-1.25,1,.3],focalLength:35},{t:1,position:[0,2,4],target:[-1.25,1,.3],focalLength:35}]}}]}};
  }
  return route.fulfill({json:{code:200,data}});
 }
 if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();
 const isAtelier=p.startsWith('/atelier-canvas/');
 if(isAtelier&&!graphSent)graphSent=await page.evaluate(()=>JSON.parse(localStorage.getItem('xoi_canvas_graph_v1')||'null'));
 const fileRoot=isAtelier?atelierRoot:root;
 const relative=isAtelier?p.replace('/atelier-canvas/','/')||'/':p;
 const path=resolve(fileRoot,'.'+(relative==='/'?'/index.html':decodeURIComponent(relative)));if(!path.startsWith(fileRoot+'/'))return route.abort();
 try{return route.fulfill({body:await readFile(path),contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(path)]||'application/octet-stream'});}catch{return route.fallback();}
});
const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));const frame=page.frameLocator('.director3d-iframe');
try{
 await page.goto('http://localhost:12121/#/director3d?scene='+id);await frame.locator('.xoi-clear-camera').waitFor();await frame.locator('#xoi-workspace-loading').waitFor({state:'hidden'});
 await page.locator('.skills-trigger').click();await page.getByRole('button',{name:'设计镜头',exact:true}).click();await page.locator('#director-skill-request').fill('用4秒拍摄主角');
 await page.getByRole('button',{name:'读取场景并生成方案',exact:true}).click();await page.getByRole('button',{name:'确认并调用',exact:true}).click();await page.locator('.shot-proposal').waitFor();assert.equal(traffic.model,1);assert.equal(traffic.authorize,1);
 await page.getByRole('button',{name:'带入画布制作 →',exact:true}).click();await page.waitForURL('**/#/canvas**');
 const canvas=page.frameLocator('iframe');await canvas.locator('[data-node-id]').first().waitFor({timeout:90000});
 const generate=canvas.getByRole('button',{name:'开始生成',exact:true});await generate.waitFor({timeout:90000});await page.waitForTimeout(500);
 assert.ok(graphSent);assert.equal(graphSent.nodes.length,4);assert.equal(graphSent.edges.length,2);assert.equal('prompt'in graphSent,false);
 const config=graphSent.nodes.find(n=>n.type==='videoConfig'),image=graphSent.nodes.find(n=>n.type==='image');assert.equal(config.data.duration,4);assert.ok(!config.data.prompt);assert.ok(image.data.url.startsWith('data:image/png;base64,'));
 assert.equal(await canvas.locator('[data-node-id]').count(),4);const node=canvas.locator('[data-node-id="'+config.id+'"]');const nb=await node.boundingBox(),gb=await generate.boundingBox();assert.ok(gb.x>=nb.x&&gb.x+gb.width<=nb.x+nb.width+1);assert.ok(gb.y+gb.height<=nb.y+nb.height+1,'generate button is fully inside video node');
 const ref=canvas.locator('[data-node-id="'+image.id+'"] img');await ref.waitFor();await ref.evaluate(el=>el.decode());assert.ok(await ref.evaluate(el=>el.naturalWidth>16));
 assert.equal(traffic.model,1);assert.equal(traffic.authorize,1);assert.deepEqual(errors,[]);
 await page.screenshot({path:join(dir,'导演方案带入画布.png')});console.log(JSON.stringify({passed:true,fixtureApis:true,realNativeScreenshot:true,realCanvasUi:true,nodes:graphSent.nodes.length,edges:graphSent.edges.length,configSize:{w:config.w,h:config.h},duration:config.data.duration,traffic,errors}));
}catch(e){console.log('ERRORS',errors);console.log('GRAPH',graphSent?{nodes:graphSent.nodes.map(n=>({id:n.id,type:n.type,w:n.w,h:n.h}))}:null);await page.screenshot({path:join(dir,'failure.png')}).catch(()=>{});throw e;}finally{await context.close();await browser.close();}
