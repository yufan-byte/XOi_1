import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import knex from 'knex';
import { transform } from 'sucrase';
import * as continuity from './directorVideoContinuity';

/** Actual submission coordinator + isolated relational records, but all AI/billing/media I/O is mocked. No network. */
test('director submission persists jobs, supplies real predecessor reference, and never charges dependent failures',async t=>{
  const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
  t.after(()=>db.destroy());
  await db.schema.createTable('o_project',b=>{b.integer('id');b.integer('userId');b.text('videoRatio');});
  await db.schema.createTable('o_user',b=>{b.integer('id');b.integer('points');});
  await db.schema.createTable('o_storyboard',b=>{b.integer('id');b.integer('projectId');b.integer('scriptId');b.integer('trackId');b.integer('index');b.text('filePath');b.text('continuity');});
  await db.schema.createTable('o_assets2Storyboard',b=>{b.integer('storyboardId');b.integer('assetId');b.integer('sortOrder');});
  await db.schema.createTable('o_assets',b=>{b.integer('id');b.integer('projectId');b.integer('imageId');b.text('type');b.text('name');b.text('describe');});
  await db.schema.createTable('o_image',b=>{b.integer('id');b.text('filePath');});
  await db.schema.createTable('o_videoTrack',b=>{b.integer('id');b.integer('projectId');b.integer('scriptId');b.integer('videoId');});
  await db.schema.createTable('o_video',b=>{b.increments('id');b.integer('projectId');b.integer('scriptId');b.integer('videoTrackId');b.bigInteger('time');b.text('filePath');b.text('state');b.text('errorReason');});
  await db('o_project').insert({id:7,userId:1,videoRatio:'16:9'});await db('o_user').insert({id:1,points:100});
  await db('o_assets').insert({id:30,projectId:7,imageId:1,type:'scene',name:'同一间卧室'});
  await db('o_image').insert({id:1,filePath:'/7/room.jpg'});
  for(const [id,trackId,transition] of [[1,101,'new_scene'],[2,102,'continue']] as const){
    await db('o_storyboard').insert({id,projectId:7,scriptId:11,trackId,index:id,filePath:`/7/shot${id}.jpg`,continuity:JSON.stringify({sceneId:30,transition,startState:'站在门边',endState:'推门',screenDirection:'左至右'})});
    await db('o_assets2Storyboard').insert({storyboardId:id,assetId:30,sortOrder:0});
    await db('o_videoTrack').insert({id:trackId,projectId:7,scriptId:11});
  }
  const calls:any[]=[],captured:string[]=[],released:string[]=[];
  let failFirst=false,failSettlement=false,reservations=0;
  const u={db,getPath:()=>'/offline',error:(e:any)=>({message:e?.message||String(e)}),oss:{getImageBase64:async(p:string)=>'image:'+p},Ai:{Video:()=>({run:async(data:any)=>{calls.push(data);if(failFirst&&data.prompt.startsWith('first'))throw Error('mock upstream failure');},save:async()=>{}})}};
  const module={exports:{} as any};
  const sandbox={module,exports:module.exports,console:{error:()=>{}},require:(id:string)=>{
    if(id==='@/utils')return{__esModule:true,default:u};
    if(id==='@/lib/responseFormat')return{success:(data:any)=>({data}),error:(message:string)=>({message})};
    if(id==='./directorStageReview')return{requireDirectorReview:async()=>''};
    if(id==='./releaseLifecycle')return{releaseLifecycle:{beginBackground:()=>()=>{}}};
    if(id==='./directorVideoContinuity')return{...continuity,directorTailFrame:async(_r:string,_p:number,file:string)=>'tail:'+file};
    if(id==='./billing')return{pricingContextFromModel:()=>({}),reservePoints:async()=>({success:true,deducted:0,requestId:String(++reservations)}),capturePoints:async(r:any)=>{if(failSettlement)throw Error('mock settlement error');captured.push(r.requestId);},releasePoints:async(r:any)=>{released.push(r.requestId);}};
    if(id==='node:crypto')return require('node:crypto');
    throw Error('Unmocked dependency: '+id);
  }};
  vm.runInNewContext(transform(fs.readFileSync(path.join(__dirname,'directorVideoGeneration.ts'),'utf8'),{transforms:['typescript','imports']}).code,sandbox);
  const submit=module.exports.submitDirectorVideos;
  const input=(ids=[102,101])=>({projectId:7,scriptId:11,model:'newapi:seedance2.0-line1-xoi',mode:'singleImage',resolution:'480p',trackData:ids.map(trackId=>({trackId,prompt:trackId===101?'first':'second',duration:15,uploadData:[{id:trackId===101?1:2,sources:'storyboard'}]}))});
  function response(){return{headersSent:false,code:0,data:null as any,status(n:number){this.code=n;return this;},send(data:any){this.headersSent=true;this.data=data;return this;}};}
  await t.test('reversed selection still executes predecessor first and records both successful clips',async()=>{
    const res=response();await submit(1,input(),res);
    assert.equal(res.code,200);assert.equal(calls.length,2);
    assert.ok(calls[0].prompt.startsWith('first'));assert.ok(calls[1].prompt.startsWith('second'));
    assert.match(calls[1].referenceList[0].base64,/^tail:\/7\/video\//);
    assert.ok(!calls[1].referenceList.some((r:any)=>r.base64==='image:/7/room.jpg'));
    assert.equal((await db('o_video').where('state','生成成功')).length,2);
    assert.equal(captured.length,2);assert.equal(released.length,0);
  });
  await t.test('single continuation uses the adopted predecessor, loads pinned anchor, and never guesses latest',async()=>{
    const chosen=await db('o_video').where({videoTrackId:101,state:'生成成功'}).first();
    await db('o_videoTrack').where({id:101}).update({videoId:chosen.id});
    await db('o_video').insert({projectId:7,scriptId:11,videoTrackId:101,filePath:'/7/video/newer-unadopted.mp4',state:'生成成功'});
    const second=await db('o_storyboard').where({id:2}).first();
    await db('o_storyboard').where({id:2}).update({continuity:JSON.stringify({...JSON.parse(second.continuity),anchorStoryboardId:1})});
    calls.length=0;
    let res=response();await submit(1,input([102]),res);
    assert.equal(res.code,200);
    assert.equal(calls[0].referenceList[0].base64,'tail:'+chosen.filePath);
    assert.ok(calls[0].referenceList.some((r:any)=>r.base64==='image:/7/shot1.jpg'));
    await db('o_videoTrack').where({id:101}).update({videoId:null});
    const before=reservations;
    res=response();await submit(1,input([102]),res);
    assert.equal(res.code,400);assert.equal(reservations,before);assert.match(res.data.message,/采用/);
  });
  await t.test('a failed retry cannot reuse old predecessor success or submit dependent media',async()=>{
    calls.length=0;failFirst=true;const before=reservations;
    const res=response();await submit(1,input(),res);
    assert.equal(res.code,200);assert.equal(calls.length,1);assert.equal(reservations,before+2);
    const failed=await db('o_video').where('state','生成失败').orderBy('id');
    assert.equal(failed.length,2);assert.match(failed.find(f=>f.videoTrackId===102)!.errorReason,/未提交模型/);assert.equal(released.length,2);
  });
  await t.test('foreign/missing references and unknown tracks fail before reservations',async()=>{
    const before=reservations;
    const bad=input([101]);bad.trackData[0].uploadData[0].id=999;
    let res=response();await submit(1,bad,res);assert.equal(res.code,400);
    res=response();await submit(1,input([999]),res);assert.equal(res.code,400);
    assert.equal(reservations,before);
  });
  await t.test('text generation does not require adopted predecessor or send hidden references',async()=>{
    failFirst=false; calls.length=0;
    const request={...input([102]),mode:'text'};request.trackData[0].uploadData=[];
    const res=response();await submit(1,request,res);assert.equal(res.code,200);assert.equal(calls.length,1);assert.deepEqual(calls[0].referenceList,[]);
    const before=reservations,bad={...input([102]),mode:'text'};const rejected=response();await submit(1,bad,rejected);assert.equal(rejected.code,400);assert.equal(reservations,before);
  });
  await t.test('settlement error cannot mark a delivered clip as failed or refund it',async()=>{
    failFirst=false;failSettlement=true;const before=released.length;
    const res=response();await submit(1,input([101]),res);
    const last=await db('o_video').orderBy('id','desc').first();
    assert.equal(last.state,'生成成功');assert.equal(released.length,before);
  });
});
