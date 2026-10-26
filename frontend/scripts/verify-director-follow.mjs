// Fault injection uses intercepted account/model/receipt APIs; native 3D and compiled UI are real.
// This script never calls a real model, alters a wallet, or submits a paid request.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
const {chromium}=await import('/Users/zhaochenyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=process.env.XOI_FRONTEND_DIST_DIR||'/tmp/xoi-canvas-flow-web',dir=process.env.XOI_DIRECTOR_QA_DIR||'/tmp/xoi-canvas-flow-follow-qa';await mkdir(dir,{recursive:true});
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
 await page.goto('http://localhost:12121/#/director3d?scene='+id);await ready();await page.locator('.skills-trigger').click();await page.getByRole('button',{name:'运镜预设',exact:true}).click();
 await page.locator('.motion-preset-grid button').filter({hasText:'前后跟随'}).click();await page.getByRole('button',{name:'添加示例走位并跟拍（本地免费）',exact:true}).waitFor();
 assert.ok(await page.getByRole('button',{name:'添加镜头并试播',exact:true}).isDisabled());const original=await native();pass('stationary subject cannot create a misleading static follow shot');
 await page.getByRole('button',{name:'添加示例走位并跟拍（本地免费）',exact:true}).click();await frame.locator('.play-button.is-playing').waitFor();await idle();
 const first=await rendered();await page.waitForTimeout(1100);const second=await rendered();const project=await native();const actor=project.objects.find(o=>o.id==='actor-lead')||project.objects.find(o=>o.type==='person');
 const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));assert.ok(distance(first.camera,second.camera)>.1,'actual camera moves');assert.ok(distance(first[actor.id],second[actor.id])>.1,'actual actor moves');
 assert.equal(project.shots.length,original.shots.length+1);assert.deepEqual(project.shots[0].camera,original.shots[0].camera);assert.deepEqual(project.shots[0].keyframes,original.shots[0].keyframes);for(const old of original.shots[0].objects){const current=project.shots[0].objects.find(o=>o.id===old.id);for(const key of Object.keys(old))assert.deepEqual(current[key],old[key],old.id+':'+key);}assert.deepEqual(project.objects.map(o=>o.id),original.objects.map(o=>o.id));
 pass('free demo adds exactly one shot; actual rendered actor and camera both move',{actorTravel:distance(first[actor.id],second[actor.id]),cameraTravel:distance(first.camera,second.camera)});
 await page.getByRole('button',{name:'返回编辑',exact:true}).click();await page.screenshot({path:join(dir,'前后跟随-示例走位.png')});await page.getByRole('button',{name:'撤销本次添加',exact:true}).click();await idle();assert.equal((await native()).shots.length,original.shots.length);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');
 assert.equal(traffic.model,0);assert.equal(traffic.authorize,0);assert.deepEqual(errors,[]);pass('return and undo restore original shots; no billing authorization or model call');await writeFile(join(dir,'report.json'),JSON.stringify({report,traffic,errors},null,2));
}catch(e){console.log('ERRORS',errors);console.log('PANEL',await page.locator('.skills-panel').innerText().catch(()=>''));await page.screenshot({path:join(dir,'failure.png')}).catch(()=>{});throw e;}finally{await context.close();await browser.close();}
