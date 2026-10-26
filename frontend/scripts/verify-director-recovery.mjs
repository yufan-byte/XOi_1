// Fault injection uses intercepted account/model/receipt APIs; native 3D and compiled UI are real.
// This script never calls a real model, alters a wallet, or submits a paid request.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
const {chromium}=await import('/Users/zhaochenyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=process.env.XOI_FRONTEND_DIST_DIR||'/tmp/xoi-director-recovery-web',dir=process.env.XOI_DIRECTOR_QA_DIR||'/tmp/xoi-director-recovery-qa';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1680,height:1050}}),id='director3d-u501-recovery';
await context.addInitScript(id=>{
 const roots=new Set();window.__qaReactRoots=roots;window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(r){const id=this.renderers.size+1;this.renderers.set(id,r);return id;},onCommitFiberRoot(id,r){roots.add(r);},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};
 localStorage.setItem('token','Bearer isolated-recovery-fixture');localStorage.setItem('userId','501');localStorage.setItem('xoi.platform-welcome.v1:501','done');localStorage.setItem('director3d-projects-v2:u501',JSON.stringify([{id,name:'导演恢复与预设验证',createdAt:Date.now()}]));localStorage.setItem('director3d-active-project-v2:u501',id);localStorage.setItem('xo_assistant_model_value','newapi:fixture-text');
},id);
const traffic={authorize:0,model:0,receipt:0,stop:0},errors=[],report=[];let behavior='unavailable',budgetState='stopped',stopFails=false;
const oldId='11111111-1111-4111-8111-000000000001',receipts={};
await context.route('**/*',async route=>{
 const request=route.request(),u=new URL(request.url()),p=u.pathname;
 if(p.startsWith('/socket.io/'))return route.abort();
 if(p.startsWith('/api/')){
  let data=[];
  if(p==='/api/auth/me')return route.fulfill({json:{user:{id:501,name:'验证账号'}}});
  if(p==='/api/login/self')data={id:501,name:'验证账号',balance:20};
  if(p==='/api/billing/preview')data={label:'AI 导演方案',model:'fixture-text',modelId:'fixture-text',free:false,count:1,quote:{yuan:.06},budget:{defaultPoints:1,maxPoints:10,maxCalls:1,maxOutputTokens:4096,minutes:30}};
  if(p==='/api/billing/authorize'){traffic.authorize++;data={id:`11111111-1111-4111-8111-${String(traffic.authorize).padStart(12,'0')}`,limitPoints:1};}
  if(p.includes('/billing/receipt/')){traffic.receipt++;const billingId=p.split('/').at(-1);data={status:receipts[billingId]?'recorded':'pending',points:receipts[billingId]||0,budget:{state:budgetState,calls:1}};}
  if(p.includes('/billing/budget/')&&p.endsWith('/stop')){traffic.stop++;if(stopFails)return route.fulfill({status:503,json:{message:'停止暂不可用'}});budgetState='stopped';data={stopped:true};}
  if(p==='/api/aiAssistant/director/plan'||p==='/api/aiAssistant/director/compose'){
   traffic.model++;
   if(behavior==='unavailable')return route.fulfill({status:503,json:{message:'所选模型暂不可用，请更换模型'}});
   if(behavior==='disconnect')return route.abort('failed');
   const input=request.postDataJSON();assert.equal(input.task,'build');assert.deepEqual(input.scene.objects,[]);assert.deepEqual(input.history,[]);
   data={projectId:id,activeShotId:input.scene.activeShotId,plan:{name:'单人 AI 场景',summary:'只添加一人',durationSeconds:5,warnings:[],actions:[{kind:'add',ref:'new-lead',name:'独立主角',type:'person',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},{kind:'camera',position:[0,1.3,5],target:[0,1,0],focalLength:35}]}};
  }
  return route.fulfill({json:{code:200,data}});
 }
 if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();
 if(p.startsWith('/console/'))return route.fulfill({contentType:'text/html',body:'<!doctype html><title>积分明细验证页</title><main>积分明细</main>'});
 const path=resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));if(!path.startsWith(root+'/'))return route.abort();
 try{return route.fulfill({body:await readFile(path),contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(path)]||'application/octet-stream'});}catch{return route.fallback();}
});
const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));const frame=page.frameLocator('.director3d-iframe');
const idle=()=>page.locator('.director-skills-entry[data-busy="false"]').waitFor();
const native=()=>frame.locator('body').evaluate(()=>{[...document.querySelectorAll('.top-actions button')].find(b=>b.textContent.trim()==='保存').click();return JSON.parse(localStorage.getItem('monoform-project-'+new URL(location.href).searchParams.get('key')));});
const ready=async()=>{await frame.locator('.xoi-clear-camera').waitFor();await frame.locator('#xoi-workspace-loading').waitFor({state:'hidden'});};
const rendered=()=>frame.locator('body').evaluate(()=>{
 let width=0;const objects={},seen=new Set(),stack=[...window.__qaReactRoots].map(r=>r.current);
 while(stack.length){const f=stack.pop();if(!f||seen.has(f))continue;seen.add(f);const o=f.stateNode?.object||f.stateNode;if(o?.isObject3D&&o.userData?.sceneObjectId){objects[o.userData.sceneObjectId]=o.position.toArray();o.traverse(n=>{if(n.isBone&&/Hips|LeftFoot/.test(n.name))objects[n.name+':'+o.userData.sceneObjectId]=n.getWorldPosition(n.position.clone()).toArray();});}const s=o?.__r3f?.root?.getState?.();if(s?.size?.width>width&&s.camera){width=s.size.width;objects.camera=s.camera.position.toArray();}if(f.child)stack.push(f.child);if(f.sibling)stack.push(f.sibling);}return objects;
});
async function generate(button){await button.click();await page.getByRole('button',{name:'确认并调用',exact:true}).click();await idle();}
function pass(name,data={}){report.push({name,...data});console.log('PASS '+name);}
try{
 await page.goto('http://localhost:12121/#/director3d?scene='+id);await ready();await page.locator('.skills-trigger').click();await page.getByRole('button',{name:'设计镜头',exact:true}).click();await page.locator('#director-skill-request').fill('4秒推进到主角近景');
 const generateCamera=page.getByRole('button',{name:'读取场景并生成方案',exact:true});
 await generate(generateCamera);await page.waitForFunction(()=>!document.querySelector('.primary-actions button').disabled);
 assert.equal(traffic.model,1);assert.equal(traffic.authorize,1);assert.match(await page.locator('.skill-error').innerText(),/不可用/);assert.match(await page.locator('.director-billing-state').innerText(),/账单待回传/);assert.equal(await page.locator('#xoi-billing-notice').count(),0);
 pass('HTTP model-unavailable response unlocks a closed attempt, retains pending receipt, never automatically retries');
 const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'去积分明细 ↗',exact:true}).click();const popup=await popupPromise;await popup.waitForLoadState();assert.equal(new URL(popup.url()).pathname,'/console/usage');assert.ok(page.url().includes('/director3d'));assert.equal(await page.locator('#director-skill-request').inputValue(),'4秒推进到主角近景');await popup.close();pass('usage opens a separate tab and preserves director scene / draft (destination fixture, not production ledger UI)');
 behavior='disconnect';budgetState='active';await generate(generateCamera);assert.ok(await generateCamera.isDisabled());assert.equal(traffic.authorize,2);assert.equal(traffic.model,2);
 stopFails=true;await page.getByRole('button',{name:'结束本次尝试',exact:true}).click();assert.ok(await generateCamera.isDisabled());
 stopFails=false;await page.getByRole('button',{name:'结束本次尝试',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.primary-actions button').disabled);assert.equal(traffic.model,2);assert.equal(traffic.stop,2);
 assert.equal(await page.locator('.director-billing-history').count(),0);assert.equal(await page.getByRole('button',{name:'核对费用状态',exact:true}).count(),0);
 receipts[oldId]=.6;await page.waitForFunction(({id,oldId})=>JSON.parse(localStorage.getItem('xoi_director_skill_plan_v1:u501:'+id)).billingHistory?.some(b=>b.id===oldId&&b.state==='recorded'&&b.points===.6),{id,oldId});assert.match(await page.locator('.director-billing-state').innerText(),/账单待回传/);
 pass('unknown transport remains guarded; failed stop cannot unlock; confirmed stop allows separate retry; late old charge stays with old receipt');
 await page.reload();await ready();await page.locator('.skills-trigger').click();await page.waitForFunction(()=>!document.querySelector('.primary-actions button').disabled);assert.equal(traffic.model,2);assert.equal(traffic.authorize,2);pass('reload reconciles stopped authorization without waiting forever for settlement');
 // Start from same original scene every time; all mutations/undo use the native importer.
 const original=await native();
 for(const [name,count,duration] of [['单人空场',1,5],['双人对话',2,5],['桌边对谈',5,5],['走位跟拍',1,4]]){
  await page.getByRole('button',{name:'搭场景',exact:true}).click();await page.locator('.starter-grid button').filter({hasText:name}).click();await page.getByRole('button',{name:`使用${name}（本地免费）`,exact:true}).click();await idle();
  assert.deepEqual(await page.locator('.skill-error').allTextContents(),[]);const applied=await native();assert.equal(applied.objects.length,count);assert.equal(applied.shots.length,original.shots.length);assert.equal(applied.activeShotId,original.activeShotId);assert.equal(applied.settings.durationSeconds,duration);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');assert.equal(await frame.locator('.play-button.is-playing').count(),0);
  await page.screenshot({path:join(dir,name+'-编辑.png')});await writeFile(join(dir,name+'.monoform.json'),JSON.stringify(applied,null,2));
  await page.getByRole('button',{name:'试播当前场景',exact:true}).click();await frame.locator('.xoi-motion-playback').waitFor();await page.waitForTimeout(550);
  const view=await rendered();assert.ok(applied.objects.every(o=>view[o.id]),'Every template object reaches native rendering');assert.ok(Math.abs(view.camera[2]-applied.camera.position[2])<.01,'Actual render camera matches preset');
  if(name==='走位跟拍'){
   await frame.locator('.play-button.is-playing').waitFor();const first=await rendered();await page.waitForTimeout(900);const last=await rendered(),actor=applied.objects[0].id;
   assert.notDeepEqual(first[actor],last[actor]);assert.notDeepEqual(first.camera,last.camera);pass('walk preset moves actual rendered person and actual rendered camera',{first,last});
  }
  await page.screenshot({path:join(dir,name+'-预演.png')});await page.getByRole('button',{name:'返回编辑',exact:true}).click();
  if(name==='桌边对谈'){
   for(const person of applied.objects.filter(o=>o.type==='person')){const hip=view['mixamorigHips:'+person.id];assert.ok(hip,'native seated pelvis exists');const chair=applied.objects.filter(o=>o.type==='chair').find(o=>Math.hypot(hip[0]-o.position[0],hip[2]-o.position[2])<.03);assert.ok(chair,'actual seated pelvis is centered over a chair');assert.ok(Math.abs(hip[1]-(chair.position[1]+.085+.12))<.03);}
   pass('table preview has five actual objects, correct camera, and both native animated pelvises aligned over chair seats',{view});
  }
  if(name==='单人空场'){await page.reload();await ready();await page.locator('.skills-trigger').click();await page.getByRole('button',{name:'撤销场景更改',exact:true}).waitFor();}
  await page.getByRole('button',{name:'撤销场景更改',exact:true}).click();await idle();const restored=await native();assert.deepEqual(restored.objects,original.objects);assert.equal(restored.shots.length,original.shots.length);assert.equal(traffic.model,2);assert.equal(traffic.authorize,2);
  pass(name+' local template stays in scene editing, previews and undoes without adding a shot or calling any model');
 }
 behavior='success';await page.getByRole('button',{name:'搭场景',exact:true}).click();await page.locator('#director-skill-request').fill('场景只要一个人，不要别的，5秒');await generate(page.getByRole('button',{name:'生成搭建方案',exact:true}));await page.getByRole('button',{name:'应用到当前场景',exact:true}).click();await idle();const built=await native();assert.equal(built.objects.length,1);assert.equal(built.shots.length,original.shots.length);assert.equal(built.activeShotId,original.activeShotId);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');await page.getByRole('button',{name:'撤销场景更改',exact:true}).click();await idle();assert.deepEqual((await native()).objects,original.objects);pass('AI clean-build sends an empty scene, applies one person to current scene, stays in editing, and undoes (model output fixture)');
 assert.equal(await frame.locator('.owner-watermark').getAttribute('aria-label'),'XOi');assert.equal(await frame.locator('.owner-watermark>b').isVisible(),false);assert.match(await frame.locator('.owner-watermark').evaluate(el=>getComputedStyle(el,'::after').content),/XOi/);pass('camera preview shows simple XOi branding');
 for(const width of [1680,1280,900]){await page.setViewportSize({width,height:1050});await page.waitForTimeout(300);assert.equal(await frame.locator('.project-title').isVisible(),false);assert.equal(await page.locator('.project-eyebrow').count(),0);const boxes=await page.locator('.project-bar').boundingBox();assert.ok(boxes.height>0);await page.screenshot({path:join(dir,'header-'+width+'.png')});}pass('no duplicate native title or leaked second-row title at 1680, 1280, 900 px');
 assert.deepEqual(errors,[]);await writeFile(join(dir,'results.json'),JSON.stringify({fixtureApis:true,realNativeEditor:true,traffic,errors,report},null,2));console.log(JSON.stringify({traffic,checks:report.length,errors}));
}catch(e){await page.screenshot({path:join(dir,'failure.png')}).catch(()=>{});console.log('PANEL',await page.locator('.skills-panel').innerText().catch(()=>''));console.log({traffic,errors});throw e;}finally{await context.close();await browser.close();}
