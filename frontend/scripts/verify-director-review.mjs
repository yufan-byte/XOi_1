// UI fault injection with fixture account/model/ledger; no real generation or paid requests.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
const {chromium}=await import(process.env.XOI_PLAYWRIGHT_MODULE||'/Users/zhaochenyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=process.env.XOI_FRONTEND_DIST_DIR||'/tmp/xoi-director-refine-web',dir=process.env.XOI_DIRECTOR_QA_DIR||'/tmp/xoi-director-review-qa';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1680,height:1050}}),id='director3d-u501-review';
await context.addInitScript(id=>{localStorage.setItem('token','Bearer isolated-review-fixture');localStorage.setItem('userId','501');localStorage.setItem('xoi.platform-welcome.v1:501','done');localStorage.setItem('director3d-projects-v2:u501',JSON.stringify([{id,name:'导演校验测试',createdAt:Date.now()}]));localStorage.setItem('director3d-active-project-v2:u501',id);localStorage.setItem('xo_assistant_model_value','newapi:fixture-text');},id);
const traffic={authorize:0,model:0,receipt:0},errors=[];let fail=true,receiptStatus='pending',receiptBudgetState='stopped';
await context.route('**/*',async route=>{
 const request=route.request(),u=new URL(request.url()),p=u.pathname;
 if(p.startsWith('/socket.io/'))return route.abort();
 if(p.startsWith('/api/')){
  let data=[];
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
 const path=resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));if(!path.startsWith(root+'/'))return route.abort();
 try{return route.fulfill({body:await readFile(path),contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(path)]||'application/octet-stream'});}catch{return route.fallback();}
});
const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));const frame=page.frameLocator('.director3d-iframe');
try{
 await page.goto('http://localhost:12121/#/director3d?scene='+id);await frame.locator('.xoi-clear-camera').waitFor();await frame.locator('#xoi-workspace-loading').waitFor({state:'hidden'});
 await page.locator('.skills-trigger').click();await page.getByRole('button',{name:'设计镜头',exact:true}).click();await page.locator('#director-skill-request').fill('用4秒推进到主角近景');
 const generate=page.getByRole('button',{name:'读取场景并生成方案',exact:true});
 await generate.click();await page.getByRole('button',{name:'确认并调用',exact:true}).click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();
 assert.equal(traffic.model,1);assert.equal(traffic.authorize,1);assert.equal(await page.locator('#xoi-billing-notice').count(),0);assert.ok(await generate.isEnabled());assert.match(await page.locator('.director-billing-state').innerText(),/账单待回传/);
 await page.locator('.skills-trigger').click();await page.locator('.skills-trigger').click();assert.ok(await generate.isEnabled());assert.equal(traffic.model,1);
 receiptStatus='recorded';await page.locator('.skills-trigger').click();await page.locator('.skills-trigger').click();await page.waitForFunction(()=>document.querySelector('.director-billing-state').textContent.includes('0.6'));await generate.waitFor();assert.ok(await generate.isEnabled());assert.match(await page.locator('.director-billing-state').innerText(),/0.6 积分/);assert.equal(traffic.model,1);
 console.log('PASS stopped one-shot attempt allows an explicit new request while preserving pending settlement and later actual charge');
 fail=false;await generate.click();await page.getByRole('button',{name:'确认并调用',exact:true}).click();await page.getByRole('button',{name:'添加为预演镜头（不扣积分）',exact:true}).waitFor();
 assert.equal(await page.locator('.framing-cards svg').count(),2);assert.match(await page.locator('.director-framing-review summary').innerText(),/4 秒 · 96 帧/);
 await page.getByRole('button',{name:'添加为预演镜头（不扣积分）',exact:true}).click();await frame.locator('.play-button.is-playing').waitFor();
 const project=await frame.locator('body').evaluate(id=>{[...document.querySelectorAll('.top-actions button')].find(b=>b.textContent.trim()==='保存').click();return JSON.parse(localStorage.getItem('monoform-project-'+new URL(location.href).searchParams.get('key')));},id);
 assert.equal(project.settings.durationSeconds,4);assert.equal(project.keyframes.at(-1).frame,95);assert.equal(project.shots[0].durationSeconds,15);
 assert.match(await page.locator('.director-applied-state').innerText(),/4 秒 · 相机移动/);assert.equal(traffic.model,2);assert.equal(traffic.authorize,2);
 await page.getByRole('button',{name:'返回编辑',exact:true}).click();await page.getByRole('button',{name:'撤销本次添加',exact:true}).click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();
 assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');assert.equal(traffic.model,2);
 await page.screenshot({path:join(dir,'review-ui.png')});assert.deepEqual(errors,[]);
 console.log('PASS framing cards, four-second native timeline, automatic preview, return-to-edit and undo; local actions make zero model requests');
 fail='hang';receiptStatus='pending';receiptBudgetState='active';await generate.click();await page.getByRole('button',{name:'确认并调用',exact:true}).click();await page.waitForFunction(id=>JSON.parse(localStorage.getItem('xoi_director_skill_plan_v1:u501:'+id)||'{}').billingState?.needsReview===true,id);
 await page.reload();await frame.locator('.xoi-clear-camera').waitFor();await frame.locator('#xoi-workspace-loading').waitFor({state:'hidden'});await page.locator('.skills-trigger').click();assert.ok(await generate.isDisabled());
 receiptStatus='recorded';await page.locator('.skills-trigger').click();await page.locator('.skills-trigger').click();assert.ok(await generate.isEnabled());assert.equal(traffic.authorize,3);assert.ok(traffic.model<=3);
 console.log('PASS pending authorization survives reload and cannot silently submit another model request');
}finally{await context.close();await browser.close();}
