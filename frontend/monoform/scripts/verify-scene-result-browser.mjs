// Isolated browser fixtures: no real user project or paid upstream calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.XOI_PLAYWRIGHT_MODULE||'playwright');
const root=resolve('dist'),scene='director3d-u1-result-fixture',artifacts=await mkdtemp(resolve(tmpdir(),'xoi-result-browser-'));
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+'/'))throw Error('path');const data=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.glb':'model/gltf-binary','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(data)}catch{res.statusCode=404;res.end()}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];let cloud=null,taskQueries=0,modelCalls=0;
 const taskId='scene_fixture-result',failedId='scene_fixture-failed',pendingId='scene_fixture-pending',original='/oss/canvas-files/1/123456789012345678901234567890ab.jpg';
 const result={scope:{sceneId:scene,shotId:'shot-01',revision:1,fingerprint:'a'.repeat(64)},imageUrl:original,scene:{title:'室内 / 布景',creations:[{id:'sofa',name:'沙发',a:{x:0,y:0},b:{x:4,y:2},height:1.2,color:'#c4b49b'},{id:'table',name:'圆桌',a:{x:4,y:2},b:{x:5,y:3},height:0.8,color:'#ffffff'}],walls:[{id:'wall',name:'背景墙',a:{x:-1,y:4},b:{x:7,y:6},height:3,color:'#d2d0ca'}],previs:{camera:{position:[5,-10,5],target:[2,2,1],fov:45},uncertainties:['桌子深度需要核对']}}};
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>localStorage.setItem('xoi_session','1:result-fixture'));
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname,method=route.request().method();let data;
  if(path==='/api/auth/me')return route.fulfill({json:{user:{id:1}}});
  if(path.startsWith('/api/director-scenes/')){if(method==='PUT'){const body=route.request().postDataJSON();cloud={...body,revision:body.revision+1};}if(!cloud)return route.fulfill({status:404,json:{message:'not found'}});return route.fulfill({json:{data:cloud}});}
  if(path.endsWith('/scene-models'))data=[{id:'newapi:glm-4.6v',name:'GLM 4.6V',disabled:true,unavailableReason:'当前未配置安全公开图片地址'},{id:'newapi:gpt-5.4-nano',name:'GT-5.4 Nano'}];
  else if(path.endsWith('/scene-tasks'))data={items:[{id:taskId,status:'queued',createdAt:Date.now()},{id:failedId,status:'failed',createdAt:Date.now()-1000},{id:pendingId,status:'succeeded',createdAt:Date.now()-2000}],nextCursor:null};
  else if(path.endsWith('/'+failedId))data={id:failedId,scope:result.scope,status:'failed',error:'模型上游返回500',receipt:{status:'not_charged',points:0}};
  else if(path.endsWith('/'+pendingId))data={id:pendingId,scope:result.scope,status:'succeeded',result,receipt:{status:'pending',points:null}};
  else if(path.endsWith('/'+taskId)){taskQueries++;data={id:taskId,scope:result.scope,status:taskQueries===1?'queued':'succeeded',result:taskQueries===1?undefined:result,receipt:taskQueries===1?undefined:{status:'recorded',points:0.02751}};}
  else {modelCalls++;return route.fulfill({status:503,json:{message:'No provider call allowed'}});}
  return route.fulfill({json:{data}});
 });
 await page.route('**/oss/canvas-files/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')}));
 page.setDefaultTimeout(30000);await page.goto(`http://127.0.0.1:${server.address().port}/?key=${scene}`);
 await page.getByRole('button',{name:'导入为新镜头',exact:true}).waitFor();
 assert.equal(await page.getByLabel('场景识图模型').inputValue(),'newapi:gpt-5.4-nano');assert.match(await page.getByLabel('场景识图模型').innerText(),/GT-5.4 Nano/);assert.equal(await page.getByLabel('场景识图模型').locator('option').first().getAttribute('disabled'),'');assert.match(await page.locator('.scene-model-id').innerText(),/gpt-5.4-nano/);assert.equal(await page.locator('.scene-task-receipt').innerText(),'本次实际消耗 0.02751 积分');
 await page.locator('.scene-task-details>summary').click();
 assert.match(await page.getByLabel('本镜头识图历史').innerText(),/已完成/);assert.doesNotMatch(await page.getByLabel('本镜头识图历史').innerText(),/排队中/);
 const persisted=await page.evaluate(key=>JSON.parse(localStorage.getItem('monoform-project-'+key)),scene);assert.equal(persisted.shots.length,1);
 await page.getByRole('tab',{name:'原图对照'}).click();assert.equal(await page.getByAltText('识别任务原图').count(),1);await page.getByRole('tab',{name:'白模预览'}).click();
 await page.locator('.scene-result-export>summary').click();
 await page.locator('.scene-export-objects input').nth(1).uncheck();
 const projectPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出所选 2 项',exact:true}).click();const projectDownload=await projectPromise;const json=JSON.parse(await readFile(await projectDownload.path(),'utf8'));
 assert.equal(json.objects.length,2);assert.deepEqual(json.objects.map(o=>o.name),['沙发','背景墙']);assert.equal(json.camera.follow,null);assert.equal(json.camera.route,null);assert.ok(!JSON.stringify(json).includes('scope'));assert.ok(!JSON.stringify(json).includes('/oss/'));assert.match(projectDownload.suggestedFilename(),/\.monoform\.json$/);
 await page.getByLabel('白模导出格式').selectOption('glb');const glbPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出所选 2 项',exact:true}).click();const glbDownload=await glbPromise;const glb=await readFile(await glbDownload.path());assert.equal(glb.readUInt32LE(0),0x46546c67);const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());assert.equal(gltf.meshes.length,2);assert.deepEqual(gltf.nodes.map(n=>n.name),['沙发','背景墙']);assert.ok(gltf.nodes[1].matrix);assert.notEqual(gltf.nodes[1].matrix[2],0);assert.ok(!glb.toString().includes('/oss/'));assert.equal(modelCalls,0);assert.deepEqual(errors,[]);
 await page.getByLabel('本镜头识图历史').selectOption(failedId);await page.getByText('本次未扣积分',{exact:true}).waitFor();assert.equal(await page.locator('.scene-task-receipt').getAttribute('data-receipt-status'),'not_charged');await page.getByLabel('本镜头识图历史').selectOption(pendingId);await page.getByText('费用待核对，请稍后刷新任务或查看积分明细。',{exact:true}).waitFor();assert.equal(await page.locator('.scene-task-receipt').getAttribute('data-receipt-status'),'pending');await page.locator('.xoi-scene-image input[type=file]').setInputFiles({name:'next.png',mimeType:'image/png',buffer:await page.screenshot()});await page.getByText('图片已准备好，点击生成白模查看费用。',{exact:true}).waitFor();assert.equal(await page.locator('.scene-task-receipt').count(),0);await page.screenshot({path:resolve(artifacts,'scene-result.png')});
 await page.locator('.top-actions input[type=file]').setInputFiles({name:projectDownload.suggestedFilename(),mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});await page.getByText('工程已打开 · 1 个镜头',{exact:true}).waitFor();await page.locator('.top-actions button').filter({hasText:'保存'}).click();const reopened=await page.evaluate(key=>JSON.parse(localStorage.getItem('monoform-project-'+key)),scene);assert.equal(reopened.objects.length,2);assert.deepEqual(reopened.objects.map(o=>o.name),['沙发','背景墙']);
 console.log(JSON.stringify({passed:true,historyTerminalStatus:true,disabledModelReasons:true,enabledDefault:true,rawModelIdentity:true,realReceiptPoints:true,noChargeReceipt:true,pendingReceipt:true,receiptResetOnNewImage:true,noAutomaticImport:true,selectedGeometryProjectExport:true,selectedGeometryGlbExport:true,privateScopeOmitted:true,exportReopensInDirector:true,modelCalls,taskQueries,artifacts}));
}finally{await browser.close();await new Promise(done=>server.close(done));}
