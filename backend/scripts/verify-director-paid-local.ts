/** Human-authorized local acceptance only. No retry, no model fallback, no quota changes. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {boundGatewayRequest} from '../src/utils/billingBudgetPolicy';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const projectId=1792594206800,scriptId=11,model='deepseek-v4-flash';
const reportPath=path.resolve('data/acceptance/director-1792594206800.json');
const db=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL,connectionTimeoutMillis:5000});
async function main(){
  const action=process.argv[2]||'status';
  assert.ok(['status','deepseek-prompt','remaining-prompts','asset-images','story-plan','recover-story-plan','shot-images','videos','recover-unsubmitted-videos','archive-local'].includes(action));
  const address=new URL((process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL)!);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(address.hostname));
  await db.connect();
  const p=(await db.query('SELECT * FROM o_project WHERE id=$1 AND "userId"=1',[projectId])).rows[0];
  assert.equal(p?.name,'[验收]宋室惊梦·导演创作45秒');
  const assets=(await db.query('SELECT id,name,type,describe,prompt,"promptState","promptErrorReason","imageId" FROM o_assets WHERE "projectId"=$1 ORDER BY id',[projectId])).rows;
  let report:any;try{report=JSON.parse(await fs.readFile(reportPath,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;report={projectId,scriptId,limitYuan:35,operations:[]};}
  assert.equal(report.projectId,projectId);assert.equal(report.limitYuan,35);
  const save=async()=>{await fs.mkdir(path.dirname(reportPath),{recursive:true});await fs.writeFile(reportPath,JSON.stringify(report,null,2),{mode:0o600});};
  if(action==='status'){console.log(JSON.stringify({projectId,textModel:p.textModel,assets:assets.map(a=>({id:a.id,name:a.name,promptState:a.promptState,promptLength:a.prompt?.length||0,error:a.promptErrorReason,imageId:a.imageId})),report}));return;}
  assert.equal(process.env.XOI_DIRECTOR_PAID_OPT_IN,'CONFIRMED_35_YUAN_SAFE_SCRIPT');
  assert.equal(p.textModel,'newapi:'+model);
  assert.ok(!report.operations.some((o:any)=>o.action===action&&o.state!=='not-submitted'),'Already submitted or uncertain; inspect original operation, never auto-retry');
  const selected=action==='deepseek-prompt'?assets.filter(a=>a.name==='西门庆'):action==='remaining-prompts'?assets.filter(a=>!a.prompt):assets;
  assert.ok(selected.length>0&&selected.length<=4);
  if(action==='asset-images')assert.ok(selected.every(a=>a.prompt&&!a.imageId),'Do not overwrite or retry existing images');
  else if(['deepseek-prompt','remaining-prompts'].includes(action))assert.ok(selected.every(a=>!a.prompt),'Do not regenerate existing prompts');
  const user=(await db.query('SELECT session_version FROM o_user WHERE id=1')).rows[0];
  const secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',['tokenKey'])).rows[0].value;
  const authorization='Bearer '+jwt.sign({id:1,session_version:Number(user.session_version||0)},secret,{expiresIn:3600,algorithm:'HS256'});
  async function api(url:string,body?:any,billingId?:string){
    const started=Date.now(),r=await fetch('http://localhost:12121/api'+url,{method:body===undefined?'GET':'POST',headers:{authorization,'content-type':'application/json',...(billingId?{'X-Xoi-Billing-Id':billingId}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(url==='/v1/chat/completions'?120000:20000)}),j=await r.json() as any;
    console.log(JSON.stringify({api:url,http:r.status,ms:Date.now()-started}));
    if(!r.ok||j.success===false||j.code>=400)throw Error(j.message||j.error?.message||'Request failed');return j.data===undefined?j:j.data;
  }
  const heldPoints=()=>report.operations.reduce((n:number,o:any)=>n+(['succeeded','failed','not-submitted'].includes(o.state)&&Array.isArray(o.logs)?Number(o.recordedYuan||0)*10:Number(o.limitPoints||0)),0);
  async function collect(op:any){
    const logs=(await db.query('SELECT l.request_id,l.type,l.model_name,l.channel_id,l.quota,l.created_at,l.content FROM logs l JOIN xoi_billing_links b ON l.request_id=b.request_id AND l.user_id=b.user_id WHERE b.user_id=1 AND b.billing_id=$1 ORDER BY l.id',[op.billingId])).rows;
    op.logs=logs;op.recordedYuan=logs.filter((l:any)=>Number(l.type)===2).reduce((n:number,l:any)=>n+Number(l.quota)/500000,0);
    if(['succeeded','failed'].includes(op.state)&&logs.length){await api('/billing/budget/'+op.billingId+'/stop',{});op.budgetClosed=true;}
    await save();
  }
  // Close only this harness's completed budgets, never other users' or other tabs' budgets.
  for(const prior of report.operations.filter((o:any)=>o.state==='succeeded'&&!o.budgetClosed))await collect(prior);
  if(action==='archive-local'){
    const videos=report.operations.find((o:any)=>o.action==='videos'&&o.state==='succeeded');assert.ok(videos);
    assert.equal((await db.query('SELECT id FROM o_output WHERE "projectId"=$1 AND "scriptId"=$2',[projectId,scriptId])).rowCount,0,'Do not duplicate an archived output');
    const rows=(await db.query('SELECT v.id,v."filePath",v.state FROM o_video v JOIN "o_videoTrack" t ON t.id=v."videoTrackId" WHERE v."projectId"=$1 AND v."scriptId"=$2 AND t."videoId"=v.id ORDER BY t.id',[projectId,scriptId])).rows;
    assert.equal(rows.length,3);const root=await fs.realpath(path.resolve('data/oss')),inputs=[];
    const run=promisify(execFile),media=[];
    for(const row of rows){
      assert.ok(['生成成功','已完成'].includes(row.state));assert.match(row.filePath,new RegExp('^/'+projectId+'/video/[a-f0-9-]+\\.mp4$'));
      const file=await fs.realpath(path.join(root,row.filePath.slice(1)));assert.ok(file.startsWith(root+path.sep));inputs.push('-i',file);
      const info=JSON.parse((await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,codec_type,width,height','-of','json',file],{timeout:15000})).stdout);assert.ok(Number(info.format.duration)>=15);media.push({id:row.id,info});
    }
    const file=path.resolve('data/acceptance/director-1792594206800-45s.mp4');await fs.access(file).then(()=>{throw Error('Local movie already exists; inspect instead of overwrite');},e=>{if(e.code!=='ENOENT')throw e;});
    const op:any={action,state:'rendering',startedAt:new Date().toISOString(),modelRequests:0,source:'local-ffmpeg-acceptance-not-browser-export'};report.operations.push(op);await save();
    const filter=Array.from({length:3},(_,i)=>`[${i}:v]trim=duration=15,setpts=PTS-STARTPTS[v${i}];[${i}:a]atrim=duration=15,asetpts=PTS-STARTPTS[a${i}]`).join(';')+';[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]';
    await run('ffmpeg',['-nostdin','-v','error','-threads','2','-filter_complex_threads','1',...inputs,'-filter_complex',filter,'-map','[v]','-map','[a]','-c:v','libx264','-threads','2','-preset','veryfast','-crf','19','-c:a','aac','-movflags','+faststart',file],{timeout:120000,maxBuffer:1024*1024});
    const info=JSON.parse((await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,codec_type,width,height','-of','json',file],{timeout:15000})).stdout);op.info=info;op.clips=media;op.localFile=file;op.renderMs=Date.now()-Date.parse(op.startedAt);await save();
    const bytes=await fs.readFile(file);assert.ok(bytes.length<16*1024*1024);
    const result=await api('/production/output/saveOutput',{projectId,scriptId,episodesId:scriptId,base64Data:'data:video/mp4;base64,'+bytes.toString('base64'),name:'宋室惊梦·导演创作·45秒验收成片',duration:Number(info.format.duration),resolution:'864x496',source:'local-ffmpeg-acceptance'});
    op.archive=result;op.state='succeeded';op.recordedYuan=0;await save();
    const flow=await api('/production/getFlowData',{projectId,episodesId:scriptId});assert.ok(flow.output.some((o:any)=>Number(o.id)===Number(result.id)));assert.equal(flow.videoProgress.done,3);
    console.log(JSON.stringify({archived:true,movie:op,restoredByApi:true,totalRecordedYuan:report.operations.reduce((n:number,o:any)=>n+Number(o.recordedYuan||0),0),browserEditorExportVerified:false}));return;
  }
  if(action==='recover-unsubmitted-videos'){
    const op=report.operations.find((o:any)=>o.action==='videos'&&o.state==='dispatching');assert.ok(op);
    assert.equal((await db.query('SELECT calls FROM xoi_model_budgets WHERE user_id=1 AND billing_id=$1',[op.billingId])).rows[0].calls,0);
    assert.equal((await db.query('SELECT request_id FROM xoi_billing_links WHERE user_id=1 AND billing_id=$1',[op.billingId])).rowCount,0);
    assert.equal((await db.query('SELECT id FROM o_video WHERE "projectId"=$1',[projectId])).rowCount,0);
    await api('/billing/budget/'+op.billingId+'/stop',{});op.state='not-submitted';op.budgetClosed=true;op.logs=[];op.recordedYuan=0;op.reason='Local PostgreSQL int32 timestamp insert rejected before any video/model call';await save();
    console.log(JSON.stringify({provenNotSubmitted:true,modelCalls:0,videoRows:0,chargedYuan:0}));return;
  }
  if(action==='recover-story-plan'){
    const op=report.operations.find((o:any)=>o.action==='story-plan');assert.equal(op?.state,'saving-storyboard');
    const stored=(await db.query('SELECT id,"trackId",duration,prompt,"videoDesc" FROM o_storyboard WHERE "projectId"=$1 AND "scriptId"=$2 ORDER BY id',[projectId,scriptId])).rows;
    assert.equal(stored.length,3);assert.equal(new Set(stored.map(s=>s.trackId)).size,3);
    await db.query('BEGIN');try{
      for(let i=0;i<3;i++){
        assert.equal(stored[i].prompt,op.shots[i].prompt);assert.equal(stored[i].videoDesc,op.shots[i].videoDesc);assert.equal(Number(stored[i].duration),15);
        const expected=[...new Set(op.shots[i].associateAssetsIds)] as number[];
        const links=(await db.query('SELECT "assetId" FROM "o_assets2Storyboard" WHERE "storyboardId"=$1',[stored[i].id])).rows;
        assert.deepEqual(links.map(l=>Number(l.assetId)).sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b));
        for(let order=0;order<expected.length;order++)await db.query('UPDATE "o_assets2Storyboard" SET "sortOrder"=$1 WHERE "storyboardId"=$2 AND "assetId"=$3',[order,stored[i].id,expected[order]]);
      }
      await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK');throw e;}
    const flow=await api('/production/getFlowData',{projectId,episodesId:scriptId});assert.equal(flow.storyboard.length,3);
    op.storyboardIds=stored.map(s=>Number(s.id));op.state='succeeded';op.recoveredWithoutModelCall=true;op.modelMs=17737;await collect(op);
    console.log(JSON.stringify({recovered:true,storyboardIds:op.storyboardIds,rowsDuplicated:0,modelRequests:0,restoredByApi:true,recordedYuan:op.recordedYuan}));return;
  }
  if(action==='shot-images'){
    const shots=(await db.query('SELECT * FROM o_storyboard WHERE "projectId"=$1 AND "scriptId"=$2 ORDER BY id',[projectId,scriptId])).rows;
    assert.equal(shots.length,3);assert.ok(shots.every(s=>!s.filePath));assert.equal(p.imageModel,'newapi:gemini-3.1-flash-image');
    const body={projectId,scriptId,storyboardIds:shots.map(s=>Number(s.id)),concurrentCount:2,compulsory:true},operationPath='/production/storyboard/batchGenerateImage';
    const quote=await api('/billing/preview',{path:operationPath,body});assert.equal(quote.modelId,'gemini-3.1-flash-image');
    const limitPoints=10;assert.ok(heldPoints()+limitPoints<=350);
    const op:any={action,startedAt:new Date().toISOString(),model:quote.modelId,limitPoints,state:'authorizing',storyboardIds:body.storyboardIds};report.operations.push(op);await save();
    const budget=await api('/billing/authorize',{path:operationPath,model:quote.modelId,points:limitPoints,automatic:false});op.billingId=budget.id;op.state='dispatching';await save();
    await api(operationPath,body,budget.id);op.state='submitted';await save();console.log(JSON.stringify({submitted:true,storyboardIds:op.storyboardIds,billingId:op.billingId}));
    for(let i=0;i<120;i++){
      await new Promise(r=>setTimeout(r,2500));
      const rows=(await db.query('SELECT id,state,reason,"filePath" FROM o_storyboard WHERE "projectId"=$1 AND "scriptId"=$2 ORDER BY id',[projectId,scriptId])).rows;
      for(const row of rows){if(['已完成','生成失败'].includes(row.state)&&!op.finished?.[row.id]){op.finished||={};op.finished[row.id]={...row,seconds:(Date.now()-Date.parse(op.startedAt))/1000};console.log(JSON.stringify({itemFinished:op.finished[row.id]}));}}
      if(rows.every(r=>['已完成','生成失败'].includes(r.state))){op.state=rows.every(r=>r.state==='已完成')?'succeeded':'failed';op.elapsedMs=Date.now()-Date.parse(op.startedAt);break;}
    }
    if(op.state==='submitted')op.state='pending-original-task';await collect(op);console.log(JSON.stringify({result:op,reportPath,noAutomaticRetry:true}));return;
  }
  if(action==='videos'){
    const videoModel='seedance2.0-line1-xoi';assert.equal(p.videoModel,'newapi:'+videoModel);
    assert.equal((await db.query('SELECT id FROM o_video WHERE "projectId"=$1',[projectId])).rowCount,0,'Do not regenerate or replay existing video tasks');
    const shots=(await db.query('SELECT * FROM o_storyboard WHERE "projectId"=$1 AND "scriptId"=$2 ORDER BY id',[projectId,scriptId])).rows;
    assert.equal(shots.length,3);assert.ok(shots.every(s=>s.state==='已完成'&&s.filePath&&Number(s.duration)===15));
    const pricingBase=new URL(process.env.NEWAPI_BASE_URL||'http://localhost:3000');assert.ok(['localhost','127.0.0.1','[::1]'].includes(pricingBase.hostname));
    const pricing=await(await fetch(new URL('/api/pricing',pricingBase),{signal:AbortSignal.timeout(10000)})).json() as any;
    const rate=pricing.data.find((m:any)=>m.model_name===videoModel);assert.ok(rate&&!/upstream_cost/.test(rate.billing_expr));assert.equal(Number(pricing.group_ratio.default),1);
    const worstEach=boundGatewayRequest('/v1/videos',{model:videoModel,seconds:15,resolution:'480p',aspect_ratio:'16:9'},rate,1).quota/500000;
    const limitPoints=Math.ceil((worstEach*3*10+.001)*1000)/1000;
    assert.ok(heldPoints()+limitPoints<=350,'All three worst-case submissions must fit the human-authorized ¥35 total');
    const prefix='所有人物均成年、端庄全着装，宋代悬疑电影，写实自然表演，固定人物身份与同一卧室布局，米白内衫/淡藕粉宋代长袖褙子/及踝长裙，墨蓝交领长袍。以参考图作为人物、环境与构图参考，不复刻四视图拼图。优先中近景和上半身，不强调腿脚。15秒连续叙事，不增加人物、裸露或亲密动作。不要字幕、水印、变形或夸张瞪眼。';
    const trackData=[];
    for(const s of shots){
      const prompt=prefix+'\n'+s.videoDesc;
      await api('/production/workbench/updateVideoPrompt',{id:Number(s.trackId),prompt});
      trackData.push({uploadData:[{id:Number(s.id),sources:'storyboard'}],trackId:Number(s.trackId),prompt,duration:15});
    }
    const operationPath='/production/workbench/batchGenerateVideo',body={projectId,scriptId,trackData,model:'newapi:'+videoModel,mode:'singleImage',resolution:'480p',audio:true};
    const quote=await api('/model-catalog/quote',{model:videoModel,params:{seconds:15,resolution:'480p',aspect_ratio:'16:9',hasReferenceVideo:false}});assert.ok(quote.yuan>0&&quote.yuan*3+heldPoints()/10<=35);
    const op:any={action,startedAt:new Date().toISOString(),model:videoModel,limitPoints,worstTotalYuan:worstEach*3,quotedYuan:quote.yuan*3,state:'authorizing',secondsEach:15,resolution:'480p',maxVideoCalls:3};report.operations.push(op);await save();
    const budget=await api('/billing/authorize',{path:operationPath,model:videoModel,points:limitPoints,automatic:false});op.billingId=budget.id;op.state='dispatching';await save();
    const result=await api(operationPath,body,budget.id);op.tasks=result.tasks;assert.equal(op.tasks?.length,3);op.state='submitted';await save();console.log(JSON.stringify({submitted:true,tasks:op.tasks,billingId:op.billingId,quotedYuan:op.quotedYuan,worstYuan:op.worstTotalYuan}));
    for(let i=0;i<190;i++){
      await new Promise(r=>setTimeout(r,7000));
      const rows=(await db.query('SELECT id,"videoTrackId",state,"errorReason","filePath" FROM o_video WHERE "projectId"=$1 AND "scriptId"=$2 ORDER BY id',[projectId,scriptId])).rows;
      for(const row of rows){if(['生成成功','已完成','生成失败'].includes(row.state)&&!op.finished?.[row.id]){op.finished||={};op.finished[row.id]={...row,seconds:(Date.now()-Date.parse(op.startedAt))/1000};console.log(JSON.stringify({itemFinished:op.finished[row.id]}));await save();}}
      if(i%8===0)console.log(JSON.stringify({elapsedSeconds:Math.round((Date.now()-Date.parse(op.startedAt))/1000),states:rows.map(r=>({id:r.id,state:r.state}))}));
      if(rows.length===3&&rows.every(r=>['生成成功','已完成','生成失败'].includes(r.state))){op.state=rows.every(r=>['生成成功','已完成'].includes(r.state))?'succeeded':'failed';op.elapsedMs=Date.now()-Date.parse(op.startedAt);break;}
    }
    if(op.state==='submitted')op.state='pending-original-task';await collect(op);
    if(op.state==='succeeded')for(const task of op.tasks)await api('/production/workbench/selectVideo',{trackId:task.trackId,videoId:task.videoId});
    console.log(JSON.stringify({result:op,totalRecordedYuan:report.operations.reduce((n:number,o:any)=>n+Number(o.recordedYuan||0),0),reportPath,noAutomaticRetry:true}));return;
  }
  if(action==='story-plan'){
    assert.ok((await db.query('SELECT id FROM o_storyboard WHERE "projectId"=$1 AND "scriptId"=$2',[projectId,scriptId])).rowCount===0,'Existing storyboard must not be overwritten');
    const script=(await db.query('SELECT content FROM o_script WHERE id=$1 AND "projectId"=$2',[scriptId,projectId])).rows[0].content;
    const limitPoints=10;assert.ok(heldPoints()+limitPoints<=350);
    const op:any={action,startedAt:new Date().toISOString(),model,limitPoints,state:'authorizing'};report.operations.push(op);await save();
    const budget=await api('/billing/authorize',{path:'/v1/chat/completions',model,points:limitPoints,automatic:false});op.billingId=budget.id;op.state='dispatching';await save();
    const result=await api('/v1/chat/completions',{model,max_tokens:3000,messages:[{role:'system',content:'你是古装悬疑电影分镜导演。仅输出JSON对象，格式为 {"shots":[{"track":"第一场","duration":15,"prompt":"中文静态分镜画面提示词","videoDesc":"中文15秒连续镜头提示词","associateAssetsIds":[28,29,30]}]}。严格3个镜头，每个15秒。prompt指定单幅电影画面，不要四视图/拼图/字幕；videoDesc按0-5、5-10、10-15秒描述动作与短对白，人物一致，保持明亮自然晨光，克制表演。角色端庄全着装、无亲密动作。必须遵从输入剧本，不增加人物或地点。潘金莲服饰必须宋代长袖褙子与及踝长裙，西门庆束发、交领长袍，不能现代裤装。参考图仅取角色和场景身份，不让四视图布局进入镜头。只用给定资产ID。'},{role:'user',content:JSON.stringify({script,assets:assets.map(a=>({id:Number(a.id),name:a.name,type:a.type,description:a.describe}))})}]},budget.id);
    const text=result.choices?.[0]?.message?.content;assert.equal(typeof text,'string');op.output=text;await save();
    const parsed=JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));assert.equal(parsed.shots?.length,3);
    const known=new Set(assets.map(a=>Number(a.id)));
    const data=parsed.shots.map((s:any,i:number)=>{assert.equal(s.duration,15);assert.ok(typeof s.prompt==='string'&&s.prompt.length>40);assert.ok(typeof s.videoDesc==='string'&&s.videoDesc.length>60);assert.ok(Array.isArray(s.associateAssetsIds)&&s.associateAssetsIds.every((n:number)=>known.has(n)));return {...s,track:'场景'+(i+1),state:'未生成',src:null,shouldGenerateImage:1};});
    op.shots=data;op.state='saving-storyboard';await save();
    await api('/production/storyboard/batchAddStoryboardInfo',{projectId,scriptId,data});
    const stored=(await db.query('SELECT id,"trackId",duration,prompt,"videoDesc" FROM o_storyboard WHERE "projectId"=$1 AND "scriptId"=$2 ORDER BY id',[projectId,scriptId])).rows;
    assert.equal(stored.length,3);assert.equal(new Set(stored.map(s=>s.trackId)).size,3);op.storyboardIds=stored.map(s=>Number(s.id));op.state='succeeded';op.elapsedMs=Date.now()-Date.parse(op.startedAt);await collect(op);
    console.log(JSON.stringify({result:op,reportPath,noAutomaticRetry:true}));return;
  }
  const image=action==='asset-images',selectedModel=image?'gemini-3.1-flash-image':model;
  if(image)assert.equal(p.imageModel,'newapi:'+selectedModel);
  const operationPath=image?'/assetsGenerate/batchGenerateImageAssets':'/assetsGenerate/batchPolishAssetsPrompt';
  const body=image?{projectId,model:'newapi:'+selectedModel,resolution:'1K',concurrentCount:2,items:selected.map(a=>({id:Number(a.id),type:a.type,name:a.name,prompt:a.prompt}))}:{projectId,textModel:'newapi:'+model,concurrentCount:2,otherTextPrompt:'只写可出图的中文提示词。宋代古装悬疑，所有人物成年、衣着完整端庄；西门庆固定墨蓝交领长袍和束发，潘金莲固定米白高领内衫外罩淡藕粉长袖褙子。卧室雕花窗在左、木床在右、木门在后，清晨侧光、低饱和琥珀青灰电影质感。无裸露，无亲密动作，不添加人物。',items:selected.map(a=>({assetsId:Number(a.id),type:a.type,name:a.name,describe:a.describe}))};
  const quote=await api('/billing/preview',{path:operationPath,body});assert.equal(quote.modelId,selectedModel);
  const limitPoints=image?10:10;
  assert.ok(heldPoints()+limitPoints<=350);
  const op={action,clientId:crypto.randomUUID(),startedAt:new Date().toISOString(),assetIds:selected.map(a=>Number(a.id)),model:selectedModel,limitPoints,state:'authorizing'} as any;
  report.operations.push(op);await save();
  const budget=await api('/billing/authorize',{path:operationPath,model:selectedModel,points:limitPoints,automatic:false});
  op.billingId=budget.id;op.state='dispatching';await save();
  await api(operationPath,body,budget.id);op.state='submitted';await save();
  console.log(JSON.stringify({submitted:true,assetIds:op.assetIds,model:selectedModel,billingId:op.billingId,limitYuan:limitPoints/10}));
  for(let i=0;i<(image?120:48);i++){
    await new Promise(r=>setTimeout(r,2500));
    const rows=image?(await db.query('SELECT a.id,a.name,i.state,i."errorReason",i."filePath" FROM o_assets a JOIN o_image i ON a."imageId"=i.id WHERE a.id=ANY($1::bigint[]) AND a."projectId"=$2',[op.assetIds,projectId])).rows:(await db.query('SELECT id,name,prompt,"promptState" as state,"promptErrorReason" as "errorReason" FROM o_assets WHERE id=ANY($1::bigint[]) AND "projectId"=$2',[op.assetIds,projectId])).rows;
    for(const row of rows){if(['已完成','失败','生成失败'].includes(row.state)&&!op.finished?.[row.id]){op.finished||={};op.finished[row.id]={id:row.id,name:row.name,state:row.state,error:row.errorReason,seconds:(Date.now()-Date.parse(op.startedAt))/1000,promptLength:row.prompt?.length,filePath:row.filePath};console.log(JSON.stringify({itemFinished:op.finished[row.id]}));}}
    if(rows.length===selected.length&&rows.every(a=>['已完成','失败','生成失败'].includes(a.state))){
      op.state=rows.every(a=>a.state==='已完成')?'succeeded':'failed';op.elapsedMs=Date.now()-Date.parse(op.startedAt);break;
    }
  }
  if(op.state==='submitted')op.state='pending-original-task';
  await collect(op);console.log(JSON.stringify({result:op,reportPath,noAutomaticRetry:true}));
}
void main().catch(e=>{console.error(JSON.stringify({error:e.message,noAutomaticRetry:true}));process.exitCode=1;}).finally(()=>db.end());
