// Disposable account, cloud store and provider fixtures. Never writes a user's scene or calls a model.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.XOI_PLAYWRIGHT_MODULE||'playwright');
const root=resolve('dist'),scene='director3d-u1-camera-workflow',artifacts=await mkdtemp(resolve(tmpdir(),'xoi-route-browser-'));
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
  else if(path.endsWith('/scene-tasks'))data={items:new URL(route.request().url()).searchParams.get('shotId')==='shot-01'?[{id:'scene-history',status:'succeeded',createdAt:Date.now()}]:[],nextCursor:null};
  else if(path.endsWith('/scene-tasks/scene-history')){const scope={sceneId:scene,shotId:'shot-01',revision:1,fingerprint:'0'.repeat(64)};data={id:'scene-history',scope,status:'succeeded',result:{scope,imageUrl:'/oss/canvas-files/1/123456789012345678901234567890ab.jpg',scene:{title:'客厅白模',walls:[],creations:[{id:'sofa',name:'沙发',a:{x:0,y:0},b:{x:5,y:2},height:1,color:'#dddddd'}],previs:{camera:{position:[0,-15,4],target:[2,1,1],fov:45}}}}};} 
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
 const camera=await save();assert.ok(camera.camera.route);assert.equal(camera.camera.route.enabled,true);
 await page.getByRole('button',{name:'重画相机路线',exact:true}).click();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.route-input-overlay'));await page.waitForFunction(()=>document.querySelector('.viewport-toolbar button[aria-label="移动"]')?.classList.contains('is-active'));
 assert.ok((await page.locator('.viewport-toolbar').getByRole('button',{name:'移动',exact:true}).getAttribute('class')).includes('is-active'));assert.equal(JSON.stringify(camera.routeTracks),actorTrack);assert.equal(JSON.stringify(camera.objectKeyframes),actorKeys);
 await page.getByLabel('相机运动方式').selectOption('manual');const manualStart=(await save()).camera.position;
 assert.equal(await page.locator('.viewport-toolbar').getByRole('button',{name:/^移动/}).getAttribute('class').then(v=>v.includes('is-active')),true);
 const positionX=page.locator('.right-sidebar .property-group').first().locator('input[type=range]').nth(0);
 await positionX.fill('3.15');await positionX.dispatchEvent('input');const dragged=await save();
 assert.equal(dragged.camera.position[0],3.15);assert.equal(dragged.camera.route.enabled,false);
 const track=await page.locator('.camera-track').boundingBox();await page.mouse.click(track.x+track.width*.45,track.y+track.height*.5);
 assert.deepEqual((await save()).camera.position,dragged.camera.position);
 await page.locator('.panel-tabs button').filter({hasText:'镜头运动'}).click();
 await page.getByRole('button',{name:'在当前帧记录镜头关键帧',exact:true}).click();
 await page.getByLabel('相机运动方式').selectOption('follow');
 assert.equal(await page.getByLabel('相机跟随对象').count(),1);
 assert.equal(await page.getByText('跟随角色移动',{exact:true}).count(),0);
 const followPosition=page.locator('.right-sidebar .property-group').first().locator('input[type=range]');
 const beforeFollowZ=Number(await followPosition.nth(2).inputValue());
 await page.getByLabel('跟随距离',{exact:true}).fill('9');await page.getByLabel('跟随距离',{exact:true}).dispatchEvent('input');
 assert.notEqual(Number(await followPosition.nth(2).inputValue()),beforeFollowZ);
 await followPosition.nth(0).fill('4.25');await followPosition.nth(0).dispatchEvent('input');
 const editedFollow=await save();assert.equal(editedFollow.camera.motionMode,'manual');assert.equal(editedFollow.camera.follow,null);assert.equal(editedFollow.camera.position[0],4.25);
 assert.equal(await page.locator('.owner-watermark').innerText(),'XOi');
 await page.locator('.panel-tabs').getByRole('button',{name:'镜头',exact:true}).click();
 const original=await save(),originalId=original.activeShotId;
 await page.getByRole('button',{name:'添加同场景机位',exact:true}).click();const angle=await save();
 assert.equal(angle.shots.length,2);assert.deepEqual(angle.objectKeyframes,original.objectKeyframes);assert.deepEqual(angle.routeTracks,original.routeTracks);assert.deepEqual(angle.objects,original.objects);
 assert.deepEqual(angle.keyframes,[]);assert.equal(angle.camera.follow,null);assert.equal(angle.camera.route,null);
 const oldAngle=angle.activeShotId;
 const actorX=page.locator('.right-sidebar .property-group').first().locator('input[type=range]').nth(0);
 await actorX.fill('6.3');await actorX.dispatchEvent('input');await save();
 await page.getByRole('button',{name:'切换到镜头 01',exact:true}).click();const switched=await save();
 assert.equal(switched.activeShotId,originalId);assert.deepEqual(switched.objects,original.objects);assert.deepEqual(switched.objectKeyframes,original.objectKeyframes);
 const otherShot=switched.shots.find(v=>v.id===oldAngle);assert.equal(otherShot.objects.find(v=>v.type==='person').position[0],6.3);
 await page.locator('.panel-tabs button').filter({hasText:'资源库'}).click();
 await page.getByRole('button',{name:'导入为新镜头',exact:true}).waitFor();
 const preserved=await save();await page.getByRole('button',{name:'导入为新镜头',exact:true}).click();await page.waitForTimeout(200);
 await page.waitForFunction(()=>document.querySelector('.viewport-label strong')?.innerText==='编辑视角');
 const recognized=await save();assert.equal(recognized.shots.length,3);assert.equal(recognized.objects.length,1);assert.equal(recognized.objects[0].name,'沙发');
 assert.deepEqual(recognized.shots.find(v=>v.id===originalId).objects,preserved.objects);assert.deepEqual(recognized.shots.find(v=>v.id===oldAngle).objects,otherShot.objects);
 assert.equal(await page.locator('.view-toolbar').count(),0);assert.equal(await page.locator('.viewport-label strong').innerText(),'编辑视角');
 await page.locator('.panel-tabs').getByRole('button',{name:'镜头',exact:true}).click();await page.getByRole('button',{name:'切换到镜头 01',exact:true}).click();
 await page.locator('.panel-tabs button').filter({hasText:'资源库'}).click();await page.getByRole('button',{name:'导入为新镜头',exact:true}).click();await page.waitForTimeout(200);
 await page.waitForFunction(()=>document.querySelector('.viewport-label strong')?.innerText==='编辑视角');
 assert.equal((await save()).shots.length,4);assert.deepEqual(errors,[]);assert.equal(modelCalls,0);assert.equal(submissions,0);
 await page.screenshot({path:resolve(artifacts,'camera-workflow-complete.png')});
 console.log(JSON.stringify({passed:true,manualAfterDraw:true,followSingleMode:true,followWithManualKeys:true,dragStopsDrivers:true,sameSceneAngleKeepsActorMotion:true,shotsIndependent:true,historyAppendAfterEdits:true,reimportPreservesOriginal:true,importKeepsEditorView:true,watermark:'XOi',modelCalls,submissions,artifacts}));
}finally{await browser.close();await new Promise(done=>server.close(done));}
