// Disposable account, cloud store and provider fixtures. Never writes a user's scene or calls a model.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.XOI_PLAYWRIGHT_MODULE||'playwright');
const root=resolve('dist'),scene='director3d-u1-route-regression',artifacts=await mkdtemp(resolve(tmpdir(),'xoi-route-browser-'));
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+'/'))throw Error('path');const data=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.glb':'model/gltf-binary','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(data)}catch{res.statusCode=404;res.end()}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];let cloud=null,modelCalls=0,submissions=0;
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>localStorage.setItem('xoi_session','1:route-fixture'));
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname,method=route.request().method();let data;
  if(path==='/api/auth/me')return route.fulfill({json:{user:{id:1}}});
  if(path.startsWith('/api/director-scenes/')){if(method==='PUT'){const body=route.request().postDataJSON();cloud={...body,revision:body.revision+1};}if(!cloud)return route.fulfill({status:404,json:{message:'not found'}});return route.fulfill({json:{data:cloud}});}
  if(path.endsWith('/scene-models'))data=[{id:'newapi:gpt-4.1-mini',name:'GPT-4.1 mini'}];
  else if(path.endsWith('/scene-tasks')&&method==='POST'){submissions++;return route.fulfill({status:503,json:{message:'Submission response unknown in fixture'}});}
  else if(path.endsWith('/scene-tasks'))data={items:[],nextCursor:null};
  else if(path==='/api/canvas-files')data={url:'/oss/canvas-files/1/123456789012345678901234567890ab.jpg'};
  else if(path==='/api/billing/authorize')data={id:'11111111-1111-4111-8111-111111111111'};
  else if(path==='/api/billing/preview'){assert.ok(route.request().postDataJSON().body.inputTokens>=60000);data={modelId:'gpt-4.1-mini',free:false,quote:{points:1},budget:{defaultPoints:10,maxPoints:100}};}
  else {modelCalls++;return route.fulfill({status:503,json:{message:'No provider call allowed by browser fixture'}});}
  return route.fulfill({json:{data}});
 });
 page.setDefaultTimeout(30000);await page.goto(`http://127.0.0.1:${server.address().port}/?key=${scene}`);
 await page.getByRole('button',{name:/标准人物/}).click();
 const save=async()=>{await page.locator('.top-actions button').filter({hasText:'保存'}).click();return page.evaluate(key=>JSON.parse(localStorage.getItem('monoform-project-'+key)),scene)};
 await page.getByRole('button',{name:'画人物路线',exact:true}).click();
 assert.equal(await page.getByLabel('路线输入方式').inputValue(),'draw');
 const box=await page.locator('.route-input-overlay').boundingBox();assert.ok(box.width>300);
 assert.equal(await page.locator('.route-preview-svg circle').count(),0);
 const viewBox=await page.locator('.route-preview-svg').getAttribute('viewBox');assert.ok(Number(viewBox.split(' ')[2])>300);
 await page.screenshot({path:resolve(artifacts,'actor-route-ready.png')});
 async function draw(){const b=await page.locator('.route-input-overlay').boundingBox();await page.mouse.move(b.x+b.width*.55,b.y+b.height*.6);await page.mouse.down();for(let i=1;i<=22;i++)await page.mouse.move(b.x+b.width*(.55+.20*i/22),b.y+b.height*(.6+.08*Math.sin(i/22*Math.PI)),{steps:2});await page.mouse.up();}
 await draw();try{await page.waitForFunction(()=>!document.querySelector('.route-input-overlay'))}catch(error){console.log(await page.locator('.route-draw-panel').innerText());await page.screenshot({path:resolve(artifacts,'route-failed.png')});console.log(artifacts);throw error}
 const actor=await save();assert.equal(Object.keys(actor.routeTracks).length,1);const actorTrack=JSON.stringify(actor.routeTracks),actorKeys=JSON.stringify(actor.objectKeyframes);
 assert.ok(Object.values(actor.objectKeyframes)[0].length>5);
 await page.locator('.panel-tabs button').filter({hasText:'场景层级'}).click();await page.locator('.scene-row').filter({hasText:'主摄像机'}).click();
 await page.locator('.viewport-toolbar').getByRole('button',{name:'画相机路线',exact:true}).click();await draw();await page.waitForFunction(()=>!document.querySelector('.route-input-overlay'));
 const camera=await save();assert.ok(camera.camera.route);assert.equal(JSON.stringify(camera.routeTracks),actorTrack);assert.equal(JSON.stringify(camera.objectKeyframes),actorKeys);
 await page.getByLabel('相机运动方式').selectOption('manual');const manualStart=(await save()).camera.position;
 const track=await page.locator('.camera-track').boundingBox();await page.mouse.click(track.x+track.width*.45,track.y+track.height*.5);
 const manualEnd=await save();assert.deepEqual(manualEnd.camera.position,manualStart);assert.equal(manualEnd.camera.route.enabled,false);
 await page.locator('.panel-tabs button').filter({hasText:'镜头运动'}).click();assert.equal(await page.getByRole('button',{name:'在当前帧记录镜头关键帧'}).count(),1);
 await page.locator('.panel-tabs button').filter({hasText:'资源库'}).click();
 const file=await page.screenshot();await page.locator('.xoi-scene-image input[type=file]').setInputFiles({name:'room.png',mimeType:'image/png',buffer:file});
 await page.locator('.xoi-scene-thumb').waitFor();await page.getByLabel('场景识别补充说明').fill('保留房间的窗和桌子');
 await page.locator('.panel-tabs button').filter({hasText:'场景层级'}).click();await page.locator('.panel-tabs button').filter({hasText:'资源库'}).click();
 assert.equal(await page.getByLabel('场景识别补充说明').inputValue(),'保留房间的窗和桌子');assert.equal(await page.locator('.xoi-scene-thumb').count(),1);
 await page.getByRole('button',{name:'生成白模 · 查看费用'}).click();await page.getByRole('button',{name:'确认费用并生成白模'}).waitFor();
 assert.equal(modelCalls,0);assert.deepEqual(errors,[]);
 await page.screenshot({path:resolve(artifacts,'scene-image-gpt.png')});
 await page.getByRole('button',{name:'确认费用并生成白模'}).click();await page.getByRole('button',{name:'查询原任务结果',exact:true}).waitFor();assert.equal(submissions,1);assert.equal(await page.getByRole('button',{name:'等待确认原任务'}).isDisabled(),true);
 assert.equal(modelCalls,0);
 console.log(JSON.stringify({passed:true,emptyRouteOverlay:true,actorAndCameraIndependent:true,disabledCameraRouteStaysStopped:true,nativeMotionTab:true,imageUpload:true,draftPreservedAcrossTabs:true,explicitPricing:true,uncertainSubmissionLocked:true,submissions,modelCalls,artifacts}));
}finally{await browser.close();await new Promise(done=>server.close(done));}
