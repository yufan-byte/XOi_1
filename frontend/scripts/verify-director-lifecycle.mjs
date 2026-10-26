// Isolated browser regression: APIs and account data are fixtures; no model or real project writes.
// XOI_FRONTEND_DIST_DIR chooses the exact build to verify. Supply a Playwright module if not installed locally.
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const {chromium}=await import(process.env.XOI_PLAYWRIGHT_MODULE || 'playwright');
const artifactDir=process.env.XOI_DIRECTOR_QA_DIR || process.env.TMPDIR || '/tmp';
await (await import('node:fs/promises')).mkdir(artifactDir,{recursive:true});
import assert from 'node:assert/strict';
const base=process.env.XOI_BASE_URL || 'http://127.0.0.1:12121';
const browser=await chromium.launch({headless:true,executablePath:process.env.XOI_BROWSER_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined),args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:900}});const errors=[],writes=[];
await context.addInitScript(()=>{localStorage.setItem('token','Bearer isolated-layout-fixture');localStorage.setItem('userId','501');localStorage.setItem('xoi.platform-welcome.v1:501','done');localStorage.setItem('project',JSON.stringify({project:{id:1790988161967,name:'导演布局验证',projectType:'novel',progress:{asset:{total:8,done:8}}},allProject:[]}));});
const flow={script:Array.from({length:55},(_,i)=>'场次 '+(i+1)+'：夜，街头小巷。人物在街角停下，观察远处的灯光。\n\n').join(''),scriptPlan:'',storyboardTable:'',assets:Array.from({length:8},(_,i)=>({id:i+1,name:'角色'+(i+1),desc:'角色档案与造型设计',src:'/layout-fixture.svg',state:'已完成',type:'role',derive:[]})),storyboard:[],workbench:{videoList:[]},output:[]};
const projectFixture={id:1790988161967,name:'导演布局验证',intro:'保留原有创作流程与项目配置',projectType:'novel',imageModel:'fixture-image',videoModel:'fixture-video',videoRatio:'16:9',imageQuality:'1K',artStyle:'东方美学',createTime:1790988161967,progress:{material:{total:1,done:1},script:{total:1,done:1},asset:{total:8,done:8}}};
const assetRows=Array.from({length:8},(_,i)=>({id:i+1,name:(i<5?'角色':i<7?'场景':'道具')+(i+1),type:i<5?'role':i<7?'scene':'tool',describe:'保持人物造型和场景风格的一致性',prompt:'影片中的人物或场景设定',filePath:'/layout-fixture.svg',src:'/layout-fixture.svg',state:'已完成',promptState:'已完成',model:'fixture-image',resolution:'1K',relepedAudio:[],images:[],sonAssets:[],scriptNames:['第一集：街角'],startTime:1790988161967}));
const modelCalls={preview:0,authorize:0,plan:0,compose:0};
const history=Array.from({length:5},(_,i)=>({id:'msg-'+i,role:i%2?'user':'assistant',status:'complete',datetime:'2026-10-12',content:[{type:'text',status:'complete',data:i%2?'我想写一个悬疑故事':Array(15).fill('我们先从人物的目标与冲突开始，再梳理故事骨架和分集节奏。').join('\n')}]}));
await context.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname;let data=[];
 if(/generate|save|setPlan|adopt|delete/.test(p))writes.push(p);
 if(p==='/api/billing/preview')modelCalls.preview++;
 if(p==='/api/billing/authorize')modelCalls.authorize++;
 if(p==='/api/billing/preview')data={label:'AI 导演方案',model:'fixture-text',count:1,quote:{yuan:0.06},budget:{defaultPoints:1,maxPoints:10,maxCalls:20,maxOutputTokens:4096,minutes:30}};
 if(p==='/api/billing/authorize')data={id:'11111111-1111-4111-8111-111111111111',limitPoints:1};
 if(p.startsWith('/api/billing/receipt/'))data={status:'recorded',points:0,budget:{state:'stopped',calls:1}};
 if(p.startsWith('/api/billing/status/'))data={status:'pending'};
 if(p==='/api/aiAssistant/director/skills')data=['seedance-shot-design','seedance-shotlist-director','emotion-director','emotion-expression-director','seedance-previz-to-render','fpv','seedance-seamless-stitch'].map((id,i)=>({id,name:['电影镜头设计','导演分镜表','情绪与场面调度','微表情指导','白模预演精修','FPV 穿越运镜','镜头衔接与转场'][i],description:'验证技能',available:true,canApplyCamera:[0,1,2,5].includes(i)}));
 if(p==='/api/aiAssistant/director/compose'){modelCalls.compose++;
  const input=r.request().postDataJSON(),actor=input.scene.objects.find(o=>o.type==='person');
  let plan=input.task==='build'?{name:'桌边对峙',summary:'添加配角、桌椅，安排静态机位。',warnings:['当前为白模预演。'],actions:[
   {kind:'add',ref:'new-partner',name:'新配角',type:'person',position:[2,0,0],rotation:[0,3.14,0],scale:[1,1,1]},
   {kind:'pose',objectId:'new-partner',pose:'sit'},
   {kind:'add',ref:'new-table',name:'对峙桌子',type:'table',position:[1,.5,0],rotation:[0,0,0],scale:[1.7,1,1.1]},
   {kind:'add',ref:'new-chair',name:'配角椅子',type:'chair',position:[2,.5,0],rotation:[0,3.14,0],scale:[.8,1,.8]},
   {kind:'camera',position:[0,2,6],target:[1,1,0],focalLength:35},
  ]}:{name:'向门口走',summary:'让主角移动并播放行走动作，调整灯光。',warnings:[],actions:[
   {kind:'animate',objectId:actor.id,pose:'walk',points:[{t:0,position:actor.position},{t:1,position:[actor.position[0]+2,actor.position[1],actor.position[2]]}]},
   {kind:'lighting',ambientIntensity:1.2,keyIntensity:2.5,keyAzimuth:30,keyElevation:45},
  ]};
  return r.fulfill({json:{code:200,message:'ok',data:{plan,projectId:input.scene.projectId,activeShotId:input.scene.activeShotId}}});
 }
 if(p==='/api/aiAssistant/director/plan'){modelCalls.plan++;
  const input=r.request().postDataJSON();return r.fulfill({json:{code:200,data:{projectId:input.scene.projectId,activeShotId:input.scene.activeShotId,plan:{summary:'验证镜头方案',assumptions:[],warnings:[],renderPrompt:'白模参考',shots:[{name:'推进方案',purpose:'表现情绪',framing:'中景',movement:'缓慢推进',blocking:'保持人物',performance:'自然站姿',lighting:'原灯光',transition:'切入',prompt:'缓慢推进',camera:{keyframes:[{t:0,position:[0,2,6],target:[0,1,0],focalLength:35},{t:1,position:[0,2,4],target:[0,1,0],focalLength:35}]}}]}}}});
 }
 if(p==='/api/cornerScape/getAllAssets')data=assetRows;
 if(p==='/api/assets/getAssetsApi'){const type=r.request().postDataJSON().type;data={data:assetRows.filter(a=>a.type===({角色:'role',场景:'scene',道具:'tool'}[type]||type)),total:5};}
 if(p==='/api/project/getSingleProject')data=[projectFixture];
 if(p.includes('getProject'))data=[projectFixture];
 if(p.includes('getScrptApi'))data=[{id:1,name:'第一集：街角',content:'人物在街头停下。',extractState:1,relatedAssets:[{id:1,name:'角色',type:'role'}]}];
 if(p==='/api/novel/getNovel')data={data:[],total:0};
 if(p.includes('getPlanData'))data={data:{storySkeleton:'',adaptationStrategy:'',script:[]}};
 if(p==='/api/agents/getMemory')data=history;
 if(p==='/api/production/getFlowData')data=flow;
 if(p==='/api/login/self')data={id:501,name:'验证账号',balance:20};
 if(p==='/api/team')data={role:'none'};
 if(p==='/api/auth/me')return r.fulfill({json:{user:{id:501,name:'验证账号'}}});
 if(p.includes('getModelDetails'))data={modelName:'fixture-text'};
 if(p==='/api/model-catalog/quote')data={yuan:0.06,points:0.6,note:'验证估算'};
 if(p==='/api/config')return r.fulfill({json:{chat_models:[],image_models:[]}});
 await r.fulfill({json:{code:200,message:'ok',data,total:0}});
});
await context.route('**/socket.io/**',r=>r.abort());
await context.route('**/layout-fixture.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250"><rect width="250" height="250" fill="#eee8de"/><circle cx="125" cy="110" r="60" fill="#baa892"/></svg>'}));
const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.stack||e.message));

await context.route('**/*',async r=>{
 const u=new URL(r.request().url());if(u.pathname.startsWith('/api/'))return r.fallback();
 if(!['127.0.0.1','localhost'].includes(u.hostname))return r.fallback();
 const fs=await import('node:fs/promises'),path=await import('node:path');const root=process.env.XOI_FRONTEND_DIST_DIR || fileURLToPath(new URL('../dist',import.meta.url));
 const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+'/'))return r.fallback();
 try{const body=await fs.readFile(file);const ext=path.extname(file);const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary','.webp':'image/webp','.woff2':'font/woff2'}[ext]||'application/octet-stream';return r.fulfill({body,contentType:type});}catch{return r.fallback();}
});
await context.addInitScript(()=>{localStorage.setItem('director3d-projects-v2:u501',JSON.stringify([{id:'director3d-u501-layout-test',name:'导演台布局验证',createdAt:1790988161967}]));localStorage.setItem('director3d-active-project-v2:u501','director3d-u501-layout-test');});
const frame=page.frameLocator('.director3d-iframe');
async function native(){return frame.locator('body').evaluate(()=>{[...document.querySelectorAll('.top-actions button')].find(b=>b.textContent.trim()==='保存').click();return JSON.parse(localStorage.getItem('monoform-project-director3d-u501-layout-test'));});}
async function seek(target){if(target===0){await frame.getByRole('button',{name:'回到开头',exact:true}).click();return;}const total=Number((await frame.locator('.time-readout span').innerText()).match(/\/\s*(\d+)/)[1]);const track=frame.locator('.camera-track'),r=await track.boundingBox();await track.click({position:{x:r.width*target/total-1,y:20}});await page.waitForTimeout(100);assert.equal(Number(await frame.locator('.time-readout strong').innerText()),target);}
async function chooseActor(){await frame.locator('.panel-tabs button').filter({hasText:'场景层级'}).click();await frame.locator('.scene-row').filter({hasText:'人物 · 主角'}).click();}
try{
await page.goto(base+'/#/director3d?scene=director3d-u501-layout-test');await frame.locator('.xoi-clear-camera').waitFor();await frame.locator('#xoi-workspace-loading').waitFor({state:'hidden'});
await frame.getByRole('button',{name:'运镜',exact:true}).click();await frame.locator('.xoi-native-motion-card').filter({hasText:'环绕人物'}).click();await frame.locator('.xoi-motion-preview').waitFor();
await frame.locator('.topbar').evaluate(e=>{window.__headerMeasures=0;const read=e.getBoundingClientRect.bind(e);e.getBoundingClientRect=()=>{window.__headerMeasures++;return read();};});
const source=await native();assert.equal(source.shots.length,1);
await page.getByRole('button',{name:'添加镜头并试播',exact:true}).click();await frame.locator('.play-button.is-playing').waitFor();await page.getByRole('button',{name:'已添加，修改参数可再试',exact:true}).waitFor();await frame.locator('.topbar').evaluate(()=>window.__headerMeasures=0);await page.waitForTimeout(350);const measurements=await frame.locator('.topbar').evaluate(()=>window.__headerMeasures);assert.ok(measurements<8,'header is not remeasured every animation frame: '+measurements);console.log('HEADER_MEASURES_DURING_PLAY',measurements);assert.ok(await page.getByRole('button',{name:'已添加，修改参数可再试',exact:true}).isDisabled());
await page.getByRole('button',{name:'关闭 AI 导演助理',exact:true}).click();await page.waitForTimeout(150);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');assert.equal(await frame.locator('.play-button.is-playing').count(),0);assert.equal(await frame.locator('.xoi-motion-playback').count(),0);assert.equal((await native()).shots.length,2);
console.log('PASS Close stops playback, restores editing and retains the applied shot; duplicate apply disabled');
for(let i=0;i<3;i++){
 await page.locator('.skills-trigger').click();await page.getByRole('button',{name:'重播镜头',exact:true}).click();await frame.locator('.play-button.is-playing').waitFor();
 if(i===0)await page.locator('.skills-trigger').click();
 else if(i===1)await frame.locator('.viewport-shell').press('Escape');
 else await page.keyboard.press('Escape');
 await page.waitForTimeout(100);assert.equal(await page.locator('.skills-panel').count(),0);assert.equal(await frame.locator('.play-button.is-playing').count(),0);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');
}
console.log('PASS Repeated collapse and Escape in either host or 3D frame returns editing');
// After import/undo clears transient DOM, camera mode still exposes recovery.
await frame.locator('.viewport-view-options button[title="切换到场景中主摄像机的实际画面"]').click();await frame.getByRole('button',{name:'返回场景编辑',exact:true}).waitFor();await frame.getByRole('button',{name:'返回场景编辑',exact:true}).click();await page.waitForTimeout(100);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');
console.log('PASS Manually entering camera mode always exposes Return to edit');
await page.locator('.skills-trigger').click();await page.getByRole('button',{name:'撤销本次添加',exact:true}).click();await page.locator('.director-applied-state').waitFor({state:'hidden'});assert.equal((await native()).shots.length,1);
console.log('PASS Applied motion can be undone after repeated play / exit');
// Modifying preset after applying must create from current scene, not a stale snapshot.
await page.locator('.motion-preset-grid button').filter({hasText:'横移跟拍'}).click();await page.getByRole('button',{name:'添加镜头并试播',exact:true}).click();await frame.locator('.play-button.is-playing').waitFor();await page.getByRole('button',{name:'返回编辑',exact:true}).click();await page.locator('.motion-preset-grid button').filter({hasText:'拉远揭示'}).click();await page.waitForTimeout(120);await page.getByRole('button',{name:'添加镜头并试播',exact:true}).click();await frame.locator('.play-button.is-playing').waitFor();assert.equal((await native()).shots.length,3);
await page.getByRole('button',{name:'关闭 AI 导演助理',exact:true}).click();
console.log('PASS Consecutive different presets use the acknowledged current project');
// Clearing restores only requested track and still leaves an escape route.
await frame.getByRole('button',{name:'播放预览',exact:true}).click();await frame.locator('.play-button.is-playing').waitFor();await frame.getByRole('button',{name:'清空镜头记录',exact:true}).click();await frame.getByRole('button',{name:'撤销清空',exact:true}).waitFor();assert.equal((await native()).keyframes.length,0);await frame.getByRole('button',{name:'撤销清空',exact:true}).click();await frame.locator('.timeline[data-xoi-clear-undo="false"]').waitFor();assert.ok((await native()).keyframes.length>=2);if(await frame.getByRole('button',{name:'返回场景编辑',exact:true}).isVisible().catch(()=>false))await frame.getByRole('button',{name:'返回场景编辑',exact:true}).click();assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');
console.log('PASS Clear / undo rebuild does not strand camera view');
// Animated actors must not prevent undo after watching their recorded movement.
await chooseActor();await seek(0);await frame.locator('.object-keyframe-button').click();await seek(48);for(let i=0;i<6;i++)await frame.getByRole('slider',{name:'位置 X',exact:true}).press('ArrowRight');await frame.locator('.object-keyframe-button').click();await seek(0);
await page.locator('.skills-trigger').click();await page.locator('.motion-preset-grid button').filter({hasText:'前后跟随'}).click();await page.getByRole('button',{name:'添加镜头并试播',exact:true}).click();await frame.locator('.play-button.is-playing').waitFor();await page.waitForTimeout(350);await page.getByRole('button',{name:'返回编辑',exact:true}).click();await page.getByRole('button',{name:'撤销本次添加',exact:true}).click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();
console.log('ACTOR_UNDO',await page.locator('.skill-error').allTextContents());assert.equal((await native()).shots.length,3);
await page.getByRole('button',{name:'关闭 AI 导演助理',exact:true}).click();console.log('PASS Actor animation evaluation does not block safe undo');
assert.deepEqual(modelCalls,{preview:0,authorize:0,plan:0,compose:0});console.log('PASS Presets, playback, clear and undo never request authorization or a model');
// AI tasks keep separate instructions and an aborted request cannot lock the panel.
await page.locator('.skills-trigger').click();await page.getByRole('button',{name:'搭场景',exact:true}).click();await page.locator('#director-skill-request').fill('搭一张桌子');await page.getByRole('button',{name:'调整场景',exact:true}).click();assert.equal(await page.locator('#director-skill-request').inputValue(),'');await page.getByRole('button',{name:'搭场景',exact:true}).click();assert.equal(await page.locator('#director-skill-request').inputValue(),'搭一张桌子');
await context.route('**/api/aiAssistant/director/compose',r=>new Promise(resolve=>setTimeout(()=>{r.abort().catch(()=>{}).finally(resolve);},2500)));
await page.getByRole('button',{name:'生成搭建方案',exact:true}).click();
// Approve the isolated billing fixture only; every API is intercepted.
await page.getByRole('dialog',{name:'模型调用费用确认',exact:true}).waitFor();const requestStarted=page.waitForRequest(r=>r.url().endsWith('/api/aiAssistant/director/compose')&&r.method()==='POST');await page.getByRole('button',{name:'确认并调用',exact:true}).click();await requestStarted;
await page.locator('.director-task-state').waitFor();await page.getByRole('button',{name:'关闭 AI 导演助理',exact:true}).click();await page.waitForTimeout(100);await page.locator('.skills-trigger').click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();assert.equal(await page.locator('#director-skill-request').inputValue(),'搭一张桌子');
console.log('PASS Task drafts stay separate; closing an AI request releases busy state and retains instruction');
// One confirmed text call generates a proposal; applying and undoing it are local operations.
await page.getByRole('button',{name:'设计镜头',exact:true}).click();await page.locator('#director-skill-request').fill('沿用演员，设计一个推进镜头');assert.equal(await page.locator('.skill-controls label select').inputValue(),'1');
await page.getByRole('button',{name:'读取场景并生成方案',exact:true}).click();await page.getByRole('dialog',{name:'模型调用费用确认',exact:true}).waitFor();await page.getByRole('button',{name:'确认并调用',exact:true}).click();await page.locator('.shot-proposal').waitFor();const paidBeforeApply={...modelCalls};
await page.getByRole('button',{name:'添加为预演镜头（不扣积分）',exact:true}).click();await page.getByRole('button',{name:'已添加到镜头',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'已添加到镜头',exact:true}).isDisabled());assert.deepEqual(modelCalls,paidBeforeApply);
await page.getByRole('button',{name:'撤销本次添加',exact:true}).click();await page.getByRole('button',{name:'添加为预演镜头（不扣积分）',exact:true}).waitFor();assert.deepEqual(modelCalls,paidBeforeApply);
console.log('PASS One text request produces a plan; apply and undo never call or authorize a model, and duplicate apply is disabled');
// Exercise an actual white-box scene import from a validated fixture plan.
await context.unroute('**/api/aiAssistant/director/compose');await page.getByRole('button',{name:'搭场景',exact:true}).click();const beforeBuild=await native();await page.locator('.fresh-scene-setting input').uncheck();await page.getByRole('button',{name:'生成搭建方案',exact:true}).click();await page.getByRole('dialog',{name:'模型调用费用确认',exact:true}).waitFor();await page.getByRole('button',{name:'确认并调用',exact:true}).click();await page.getByRole('button',{name:'应用到当前场景',exact:true}).waitFor();const paidBeforeBuild={...modelCalls};
await page.getByRole('button',{name:'应用到当前场景',exact:true}).click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();const built=await native();assert.equal(built.objects.length,beforeBuild.objects.length+3);assert.equal(built.shots.length,beforeBuild.shots.length);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');assert.ok(built.objects.some(o=>o.name==='新配角'));assert.ok(built.objects.some(o=>o.name==='对峙桌子'));assert.deepEqual(modelCalls,paidBeforeBuild);
await page.getByRole('button',{name:'撤销场景更改',exact:true}).click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();assert.equal((await native()).objects.length,beforeBuild.objects.length);assert.deepEqual(modelCalls,paidBeforeBuild);
console.log('PASS AI scene proposal imports real native actors / geometry; local apply and undo do not call a model');
// A cancelled / expired cost confirmation must release the global overlay and queue.
await page.evaluate(()=>{window.__realTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>window.__realTimeout(fn,ms===120000?3000:ms,...args);});
await page.getByRole('button',{name:'生成搭建方案',exact:true}).click();await page.getByRole('dialog',{name:'模型调用费用确认',exact:true}).waitFor();await page.locator('.xoi-billing-overlay').waitFor({state:'hidden'});await page.locator('.director-skills-entry[data-busy="false"]').waitFor();
await page.evaluate(()=>window.setTimeout=window.__realTimeout);
await page.getByRole('button',{name:'生成搭建方案',exact:true}).click();await page.getByRole('dialog',{name:'模型调用费用确认',exact:true}).waitFor();await page.getByRole('dialog',{name:'模型调用费用确认',exact:true}).getByRole('button',{name:'取消',exact:true}).click();await page.locator('.director-skills-entry[data-busy="false"]').waitFor();assert.equal(await page.locator('.xoi-billing-overlay').count(),0);
console.log('PASS Timed-out billing confirmation cleans overlay and releases queue; next request can cancel normally');
// Closing during the asynchronous import must not restart playback when it finishes.
await frame.locator('body').evaluate(()=>{const read=FileReader.prototype.readAsText;window.__nativeReadAsText=read;FileReader.prototype.readAsText=function(file,...args){if(file.name==='director-skill.monoform.json')window.__qaReleaseImport=()=>read.call(this,file,...args);else read.call(this,file,...args);};});
await page.getByRole('button',{name:'运镜预设',exact:true}).click();await page.locator('.motion-preset-grid button').filter({hasText:'低位升起'}).click();await page.getByRole('button',{name:'添加镜头并试播',exact:true}).click();await page.locator('.director-skills-entry[data-busy="true"]').waitFor();await page.getByRole('button',{name:'关闭 AI 导演助理',exact:true}).click();await frame.locator('body').evaluate(()=>window.__qaReleaseImport());await page.locator('.director-skills-entry[data-busy="false"]').waitFor();await page.waitForTimeout(200);assert.equal(await frame.locator('.play-button.is-playing').count(),0);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');
await frame.locator('body').evaluate(()=>FileReader.prototype.readAsText=window.__nativeReadAsText);console.log('PASS Close during import does not restart a hidden preview');
// End-preview wins over a play command still waiting for the next frame.
await page.evaluate(()=>{const iframe=document.querySelector('.director3d-iframe');const projectId=new URL(iframe.src).searchParams.get('key');for(const type of ['play-camera','end-preview'])iframe.contentWindow.postMessage({source:'xoi-director',projectId,type},location.origin);});await page.waitForTimeout(200);assert.equal(await frame.locator('.play-button.is-playing').count(),0);assert.equal(await frame.locator('.viewport-label strong').innerText(),'编辑视角');
console.log('PASS Exit cancels a queued camera-preview start');
await page.locator('.skills-trigger').click();await page.screenshot({path:join(artifactDir,'director-lifecycle-ui.png'),timeout:7000});assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('PASS No uncaught errors or real backend writes');
}catch(e){console.log('FAIL',e.message);console.log('ERRORS',errors);console.log('PANEL',await page.locator('.skills-panel').innerText().catch(()=>''));await page.screenshot({path:join(artifactDir,'director-lifecycle-fail.png'),timeout:5000}).catch(()=>{});throw e;}finally{await context.close();await browser.close();}
