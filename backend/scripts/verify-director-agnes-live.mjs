// Real deployed UI + real free-only gateway calls. No response fixtures or price changes.
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
require('dotenv').config({path:new URL('../.env',import.meta.url).pathname,quiet:true});
const {Client}=require('pg'),jwt=require('jsonwebtoken');
const {chromium}=await import('/Users/zhaochenyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const base='http://localhost:12121',dir=process.env.XOI_DIRECTOR_LIVE_DIR||decodeURIComponent(new URL('../../docs/验证/2026-10-16导演台Agnes实测/',import.meta.url).pathname);
await mkdir(dir,{recursive:true});
const db=new Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL});
await db.connect();
const owner=1,model='newapi:agnes-2.5-flash',projectId=process.env.XOI_DIRECTOR_LIVE_PROJECT||'director3d-u1-agnes-live-20261016';
const user=(await db.query('SELECT session_version FROM o_user WHERE id=$1',[owner])).rows[0];
const secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',['tokenKey'])).rows[0].value;
const token='Bearer '+jwt.sign({id:owner,session_version:Number(user.session_version||0)},secret,{expiresIn:3600});
const resumed=process.env.XOI_RESUME_REAL_BUILD==='1'?JSON.parse(await readFile(dir+'搭场景.monoform.json','utf8')):null;
const report={startedAt:new Date().toISOString(),model,projectId,realRequests:true,fixtures:false,cases:[],traffic:[],errors:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1680,height:1050}});
await context.addInitScript(({token,owner,model,projectId,resumed})=>{
 // Observe native Three objects through React's standard inspection hook.
 // Saved project coordinates are the editable source, not playback transforms.
 const roots=new Set();window.__qaReactRoots=roots;
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(renderer){const id=this.renderers.size+1;this.renderers.set(id,renderer);return id;},onCommitFiberRoot(id,root){roots.add(root);},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};
 if(resumed)localStorage.setItem('monoform-project-'+projectId,JSON.stringify(resumed));localStorage.setItem('token',token);localStorage.setItem('userId',String(owner));
 localStorage.setItem('xoi.platform-welcome.v1:'+owner,'done');
 localStorage.setItem('xo_assistant_model_value',model);localStorage.setItem('xo_assistant_model_label','Agnes 免费实测');
 localStorage.setItem('director3d-projects-v2:u'+owner,JSON.stringify([{id:projectId,name:'Agnes 免费实测 · 桌边对话',createdAt:Date.now()}]));
 localStorage.setItem('director3d-active-project-v2:u'+owner,projectId);
},{token,owner,model,projectId,resumed});
// This interceptor only refuses paid/unexpected authorization. It never supplies a response.
await context.route('**/api/billing/authorize',async route=>{
 const b=route.request().postDataJSON();
 if(b.freeOnly!==true||!['agnes-2.5-flash',model].includes(b.model)||b.points>.001){report.errors.push('Blocked non-free authorization');return route.abort();}
 return route.continue();
});
const page=await context.newPage();page.setDefaultTimeout(45000);
page.on('pageerror',e=>report.errors.push(e.message));
const pending=[];
page.on('response',res=>{
 const path=new URL(res.url()).pathname;
 if(!/^\/api\/(billing\/(preview|authorize|receipt)|aiAssistant\/director\/(plan|compose))/.test(path))return;
 pending.push((async()=>{const data=await res.json().catch(()=>null);report.traffic.push({path,status:res.status(),data,...(path.includes('/director/')?{input:res.request().postDataJSON()}: {})});})());
});
const frame=page.frameLocator('.director3d-iframe');
async function native(){return frame.locator('body').evaluate(projectId=>{[...document.querySelectorAll('.top-actions button')].find(b=>b.textContent.trim()==='保存').click();const key=new URL(location.href).searchParams.get('key');const raw=localStorage.getItem('monoform-project-'+key);if(!raw)throw new Error('Missing native storage '+key+' keys='+Object.keys(localStorage).filter(k=>k.startsWith('monoform-project')).join(','));return JSON.parse(raw);},projectId);}
async function generate(mode,intent){
 await page.getByRole('button',{name:mode,exact:true}).click();
 await page.locator('#director-skill-request').fill(intent);
 const started=Date.now();await page.getByRole('button',{name:mode==='设计镜头'?'读取场景并生成方案':mode==='搭场景'?'生成搭建方案':'生成场景调整方案',exact:true}).click();
 await page.locator('.director-skills-entry[data-busy="false"]').waitFor({timeout:150000});
 const result={mode,intent,seconds:+((Date.now()-started)/1000).toFixed(2),error:await page.locator('.skill-error').allTextContents(),text:await page.locator('.plan-results').innerText().catch(()=>''),success:await page.locator('.plan-results').count()>0};
 report.cases.push(result);console.log(JSON.stringify(result));
 await page.screenshot({path:dir+mode+'-方案.png'});return result;
}
async function applyAndVerify(button,label){
 const before=await native();await page.getByRole('button',{name:button,exact:true}).click();
 await page.locator('.director-skills-entry[data-busy="false"]').waitFor();
 assert.deepEqual(await page.locator('.skill-error').allTextContents(),[]);
 const applied=await native();const sceneChange=button==='应用到当前场景';assert.equal(applied.shots.length,before.shots.length+(sceneChange?0:1));if(sceneChange){assert.equal(applied.activeShotId,before.activeShotId);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');}
 await writeFile(dir+label+'.monoform.json',JSON.stringify(applied,null,2));
 await page.getByRole('button',{name:sceneChange?'试播当前场景':'重播镜头',exact:true}).click();
 if(applied.keyframes?.length||Object.values(applied.objectKeyframes||{}).some(k=>k.length>1)){await frame.locator('.play-button.is-playing').waitFor();const startFrame=await frame.locator('.time-readout strong').innerText();await page.waitForTimeout(700);assert.notEqual(await frame.locator('.time-readout strong').innerText(),startFrame);await page.screenshot({path:dir+label+'-播放中.png'});}else{await frame.locator('.xoi-motion-playback').waitFor();assert.equal(await frame.locator('.viewport-label strong').innerText(),'摄像机视角');await page.waitForTimeout(550);await page.screenshot({path:dir+label+'-静态预览.png'});}
 await page.getByRole('button',{name:'返回编辑',exact:true}).click();
 assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');
 await page.screenshot({path:dir+label+'-应用.png'});report.cases.at(-1).application={shotAdded:!sceneChange,sceneUpdated:sceneChange,previewVerified:true,objects:applied.objects.length,durationSeconds:applied.settings.durationSeconds,lastCameraFrame:applied.keyframes?.at(-1)?.frame};
 return {before,applied};
}
async function verifyRealMotionFiles(){
 const rendered=async()=>frame.locator('body').evaluate(()=>{
  let cameraWidth=0;const objects={},seen=new Set(),stack=[...window.__qaReactRoots].map(r=>r.current);
  while(stack.length){const f=stack.pop();if(!f||seen.has(f))continue;seen.add(f);const o=f.stateNode?.object||f.stateNode;
   if(o?.isObject3D&&o.userData?.sceneObjectId)objects[o.userData.sceneObjectId]=o.position.toArray();const state=o?.__r3f?.root?.getState?.();if(state?.size?.width>cameraWidth&&state.camera){cameraWidth=state.size.width;objects.__render_camera__=state.camera.position.toArray();}
   if(f.child)stack.push(f.child);if(f.sibling)stack.push(f.sibling);
  }return objects;
 });
 for(const label of ['人物移动','AI运镜']){
  const file=dir+label+'.monoform.json',project=JSON.parse(await readFile(file,'utf8'));
  await frame.locator('.top-actions input[type="file"]').setInputFiles(file);
  await page.waitForTimeout(1200);
  assert.equal((await native()).activeShotId,project.activeShotId);
  await page.evaluate(projectId=>document.querySelector('.director3d-iframe').contentWindow.postMessage({source:'xoi-director',projectId,type:'play-camera'},location.origin),projectId);
  await frame.locator('.play-button.is-playing').waitFor();
  const first=await native(),renderedFirst=await rendered();const start=Number(await frame.locator('.time-readout strong').innerText());
  await page.waitForTimeout(900);const last=await native(),renderedLast=await rendered(),end=Number(await frame.locator('.time-readout strong').innerText());
  assert.ok(end>start);
  const motion=label==='AI运镜'?{id:'__render_camera__',before:renderedFirst.__render_camera__,after:renderedLast.__render_camera__}:{id:Object.keys(project.objectKeyframes)[0],before:renderedFirst[Object.keys(project.objectKeyframes)[0]],after:renderedLast[Object.keys(project.objectKeyframes)[0]]};
  if(!motion.before||!motion.after)throw new Error('Native inspection unavailable: '+JSON.stringify({renderedFirst,renderedLast}));
  assert.notDeepEqual(motion.before,motion.after);
  await page.screenshot({path:dir+label+'-真实播放.png'});
  await page.evaluate(projectId=>document.querySelector('.director3d-iframe').contentWindow.postMessage({source:'xoi-director',projectId,type:'end-preview'},location.origin),projectId);
  await frame.locator('.play-button.is-playing').waitFor({state:'hidden'});
  assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');
  report.cases.push({mode:label,localPlaybackOnly:true,source:'previous real Agnes response',frames:{start,end},motion,returnEditing:true});
 }
 assert.equal(report.traffic.filter(t=>t.path.includes('/director/')||t.path==='/api/billing/authorize').length,0);
}
try{
 const auth=await context.request.get(base+'/api/auth/me',{headers:{Authorization:token}});assert.equal(auth.status(),200);assert.equal((await auth.json()).user.id,owner);
 const preview=await context.request.post(base+'/api/billing/preview',{headers:{Authorization:token},data:{path:'/aiAssistant/director/compose',body:{model}}});
 report.preflight=await preview.json();assert.equal(report.preflight.data.free,true);assert.equal(report.preflight.data.quote.yuan,0);console.log('FREE_PREFLIGHT',JSON.stringify(report.preflight));
 report.quotaBefore=(await db.query('SELECT quota FROM users WHERE id=$1',[owner])).rows[0].quota;
 await page.goto(base+'/#/director3d?scene='+projectId);
 await frame.locator('.xoi-clear-camera').waitFor({timeout:90000});await frame.locator('#xoi-workspace-loading').waitFor({state:'hidden'});
 await page.locator('.skills-trigger').click();console.log('NATIVE_READY',JSON.stringify({url:await frame.locator('body').evaluate(()=>location.href),objects:(await native()).objects.map(o=>({name:o.name,id:o.id})),resumed:!!resumed}));
 if(process.env.XOI_LOCAL_VALIDATE==='1'){await verifyRealMotionFiles();throw new Error('LOCAL_VALIDATION_COMPLETE');}
 const build=resumed?{success:true,resumedRealBuild:true}:await generate('搭场景',process.env.XOI_DIRECTOR_LIVE_INTENT||'请搭建一个简单的桌边对话场景：在现有场景里增加两个人物，分别叫记者和受访者，中间一张桌子，两张椅子。两人相对，坐着交谈。设置一个能同时拍到两人的中景机位。保留原有物体，只用白模，最多8条操作。');
 if(build.success){
  const applied=resumed|| (await applyAndVerify('应用到当前场景','搭场景')).applied;build.objects=applied.objects.map(o=>({id:o.id,name:o.name,type:o.type,pose:o.pose,position:o.position}));
  if(process.env.XOI_BUILD_ONLY==='1'){
   if(process.env.XOI_DIRECTOR_LIVE_INTENT){assert.equal(applied.objects.length,1);assert.equal(applied.objects[0].type,'person');await page.getByRole('button',{name:'撤销场景更改',exact:true}).click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();build.undoVerified=true;}
   const usage=await context.newPage();await usage.goto(base+'/console/usage');await usage.getByText('积分与消费明细',{exact:false}).first().waitFor({timeout:45000});await usage.screenshot({path:dir+'真实积分明细页.png'});build.realUsagePageLoaded=true;await usage.close();
   throw new Error('BUILD_ONLY_COMPLETE');
  }
  const adjust=await generate('调整场景','让记者用4秒沿地面向右走2米，保留其他人物和桌椅。');
  if(adjust.success){const {before,applied:next}=await applyAndVerify('应用到当前场景','人物移动');adjust.objectKeyframes=next.objectKeyframes;await page.getByRole('button',{name:'撤销场景更改',exact:true}).click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();assert.equal((await native()).shots.length,before.shots.length);adjust.undoVerified=true;}
  const camera=await generate('设计镜头','设计一个4秒缓慢推进镜头，从桌边两人中景推进到记者近景。必须提供起点和终点的可应用相机路径，始终对准记者。只要1个镜头，保留人物和场景。');
  if(camera.success&&await page.getByRole('button',{name:'添加为预演镜头（不扣积分）',exact:true}).count()){
   const {before,applied:next}=await applyAndVerify('添加为预演镜头（不扣积分）','AI运镜');camera.cameraKeys=next.keyframes;assert.equal(next.settings.durationSeconds,4);assert.equal(next.keyframes.at(-1).frame,95);
   await page.getByRole('button',{name:'撤销本次添加',exact:true}).click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();assert.equal((await native()).shots.length,before.shots.length);camera.undoVerified=true;
  }
 }
}catch(e){if(!['BUILD_ONLY_COMPLETE','LOCAL_VALIDATION_COMPLETE'].includes(e.message)){report.failure=e.stack;console.log('LIVE_FAIL',e.stack);await page.screenshot({path:dir+'失败现场.png'}).catch(()=>{});}}
finally{
 await Promise.allSettled(pending);
 const ids=report.traffic.filter(x=>x.path==='/api/billing/authorize').map(x=>x.data?.data?.id).filter(Boolean);
 await writeFile(dir+'report.json',JSON.stringify(report,null,2));
 for(const id of ids){await context.request.post(base+'/api/billing/budget/'+id+'/stop',{headers:{Authorization:token},data:{}}).catch(()=>{});}
 report.budgets=ids.length?(await db.query('SELECT billing_id,operation_path,calls,max_calls,state,bound_model,free_only FROM xoi_model_budgets WHERE user_id=$1 AND billing_id=ANY($2::uuid[])',[owner,ids])).rows:[];
 report.logs=ids.length?(await db.query('SELECT l.request_id,l.type,l.quota,l.model_name,l.channel_id FROM logs l JOIN xoi_billing_links b ON l.request_id=b.request_id AND l.user_id=b.user_id WHERE b.user_id=$1 AND b.billing_id=ANY($2::uuid[])',[owner,ids])).rows:[];
 report.quotaAfter=(await db.query('SELECT quota FROM users WHERE id=$1',[owner])).rows[0].quota;
 report.completedAt=new Date().toISOString();await writeFile(dir+'report.json',JSON.stringify(report,null,2));
 console.log('LIVE_FINAL',JSON.stringify({cases:report.cases.map(c=>({mode:c.mode,success:c.success,seconds:c.seconds,error:c.error})),failure:report.failure,budgets:report.budgets,logs:report.logs,quotaBefore:report.quotaBefore,quotaAfter:report.quotaAfter,errors:report.errors,dir}));
 if(process.env.XOI_RESUME_REAL_BUILD&&!process.env.XOI_LOCAL_VALIDATE&&report.cases.filter(c=>c.success&&c.application?.previewVerified).length!==2){report.failure||='Not both resumed real workflows passed';await writeFile(dir+'report.json',JSON.stringify(report,null,2));}
 if(process.env.XOI_BUILD_ONLY&&(!report.cases[0]?.success||!report.cases[0]?.application?.previewVerified)){report.failure||='Real build did not complete';await writeFile(dir+'report.json',JSON.stringify(report,null,2));}
 if(!process.env.XOI_LOCAL_VALIDATE&&!process.env.XOI_BUILD_ONLY&&!process.env.XOI_RESUME_REAL_BUILD&&report.cases.filter(c=>c.success&&c.application?.previewVerified).length!==3){report.failure||='Not all three real workflows passed';await writeFile(dir+'report.json',JSON.stringify(report,null,2));}
 await context.close();await browser.close();await db.end();
 if(report.failure||report.errors.length)process.exitCode=1;
}
