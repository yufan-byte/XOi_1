import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import knex from 'knex';
import {ensureStoryboardReferenceOrder,ensureVideoTimestampWidth,saveStoryboardBatch,readStoryboards,updateStoryboardContinuity,type NewStoryboard} from './storyboardStore';

test('PostgreSQL storyboard save is atomic, ordered, fresh and isolated',async t=>{
  const url=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;
  if(!url){t.skip('Local PostgreSQL not configured');return;}
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Never run against production');
  const schema='xoi_storyboard_test_'+crypto.randomBytes(8).toString('hex');
  const db=knex({client:'pg',connection:url,searchPath:[schema],pool:{min:0,max:3}});
  let created=false;
  try{
    await db.raw('CREATE SCHEMA ??',[schema]);created=true;
    await db.schema.createTable('o_project',b=>{b.bigInteger('id').primary();});
    await db.schema.createTable('o_script',b=>{b.bigInteger('id').primary();b.bigInteger('projectId');});
    await db.schema.createTable('o_assets',b=>{b.bigInteger('id').primary();b.bigInteger('projectId');b.text('type');});
    await db.schema.createTable('o_storyboard',b=>{b.bigIncrements('id');b.bigInteger('projectId');b.bigInteger('scriptId');b.text('prompt');b.text('duration');b.text('state');b.text('track');b.text('videoDesc');b.integer('shouldGenerateImage');b.bigInteger('createTime');b.bigInteger('trackId');b.integer('index');b.text('filePath');b.text('reason');});
    await db.schema.createTable('o_assets2Storyboard',b=>{b.bigInteger('storyboardId');b.bigInteger('assetId');b.primary(['storyboardId','assetId']);});
    await db.schema.createTable('o_videoTrack',b=>{b.bigInteger('id').primary();b.bigInteger('projectId');b.bigInteger('scriptId');b.integer('duration');});
    await db.schema.createTable('o_video',b=>{b.integer('id').primary();b.integer('time');});
    await db.schema.createTable('o_agentWorkData',b=>{b.integer('id').primary();b.string('data');});
    await db('o_agentWorkData').insert({id:1,data:'legacy plan'});
    await db('o_video').insert({id:1,time:42});
    await db('o_project').insert([{id:7},{id:8}]);await db('o_script').insert([{id:11,projectId:7},{id:22,projectId:8}]);
    await db('o_assets').insert([{id:101,projectId:7,type:'scene'},{id:102,projectId:7,type:'role'},{id:103,projectId:8,type:'scene'}]);
    await db('o_assets2Storyboard').insert({storyboardId:999,assetId:101});
    await t.test('additive migration preserves old associations and can run twice',async()=>{
      await ensureStoryboardReferenceOrder(db);await ensureStoryboardReferenceOrder(db);
      assert.equal((await db('o_assets2Storyboard')).length,1);assert.equal((await db('o_assets2Storyboard').first()).sortOrder,null);
      assert.equal((await db('o_agentWorkData').columnInfo('data')).type,'text');
      assert.equal((await db('o_agentWorkData').where('id',1).first()).data,'legacy plan');
      await db('o_agentWorkData').where('id',1).update({data:'plan'.repeat(10000)});
      assert.equal((await db('o_agentWorkData').where('id',1).first()).data.length,40000);
    });
    await t.test('video timestamp widening preserves old records and accepts milliseconds',async()=>{
      await ensureVideoTimestampWidth(db);await ensureVideoTimestampWidth(db);
      assert.equal(Number((await db('o_video').where('id',1).first()).time),42);
      const now=Date.now();await db('o_video').insert({id:2,time:now});
      assert.equal(Number((await db('o_video').where('id',2).first()).time),now);
    });
    const frame=(track:string,ids=[102,101]):NewStoryboard=>({prompt:'offline frame',duration:15,track,state:'未生成',videoDesc:'offline motion',shouldGenerateImage:1,associateAssetsIds:ids});
    await t.test('save returns current track IDs and preserves explicit reference order',async()=>{
      const rows=await saveStoryboardBatch(db,7,11,[frame('a'),frame('b')]);
      assert.equal(rows.length,2);assert.deepEqual(rows[0].associateAssetsIds,[102,101]);
      assert.equal(new Set(rows.map(r=>r.trackId)).size,2);assert.ok(rows.every(r=>Number.isSafeInteger(Number(r.trackId))));
      assert.equal((await db('o_videoTrack')).length,2);
      const restored=await readStoryboards(db,7,11);
      assert.equal(restored.length,2);assert.deepEqual(restored[0].associateAssetsIds,[102,101]);
      assert.equal((await readStoryboards(db,8,22)).length,0);
    });
    await t.test('foreign references roll back the entire batch, not just the failed item',async()=>{
      const before=(await db('o_storyboard')).length;
      await assert.rejects(saveStoryboardBatch(db,7,11,[frame('valid'),frame('foreign',[103])]));
      assert.equal((await db('o_storyboard')).length,before);assert.equal((await db('o_videoTrack')).length,2);
      await assert.rejects(saveStoryboardBatch(db,7,22,[frame('wrong script')]));
    });
    await t.test('continuity revisions retain existing media and tracks and reject foreign associations atomically',async()=>{
      const frame=await db('o_storyboard').where({projectId:7}).orderBy('id').first();
      const history=[{filePath:'/existing-user-image-v0.jpg',createdAt:1}];
      const review={kind:'image' as const,sourceSignature:'old-frame',checkedAt:1,manual:true,summary:'人工核对',issues:[],uncertainties:[]};
      await db('o_storyboard').where('id',frame.id).update({filePath:'/existing-user-image.jpg',continuity:JSON.stringify({sceneId:101,transition:'new_scene',startState:'站在床边',endState:'走向门',screenDirection:'左至右',imageHistory:history,review})});
      const c={sceneId:101,transition:'new_scene' as const,startState:'站在床边',endState:'走向门',screenDirection:'左至右'};
      await updateStoryboardContinuity(db,7,11,Number(frame.id),{...c,imageHistory:[{filePath:'/forged.jpg',createdAt:2}],review:{...review,summary:'伪造报告'}},[101,102]);
      const after=await db('o_storyboard').where('id',frame.id).first();
      assert.equal(after.filePath,'/existing-user-image.jpg');assert.equal(after.trackId,frame.trackId);
      assert.deepEqual(JSON.parse(after.continuity).imageHistory,history);assert.deepEqual(JSON.parse(after.continuity).review,review);
      assert.equal((await readStoryboards(db,7,11))[0].continuity?.sceneId,101);
      await assert.rejects(updateStoryboardContinuity(db,7,11,Number(frame.id),{...c,sceneId:103},[103]));
      assert.equal((await db('o_storyboard').where('id',frame.id).first()).continuity,after.continuity);
      assert.deepEqual((await readStoryboards(db,7,11))[0].associateAssetsIds,[101,102]);
    });
    await t.test('concurrent saves reuse same-track ID and update total duration',async()=>{
      await Promise.all([saveStoryboardBatch(db,7,11,[frame('same')]),saveStoryboardBatch(db,7,11,[frame('same')]),saveStoryboardBatch(db,8,22,[frame('other',[103])])]);
      const rows=await db('o_storyboard').where({projectId:7,track:'same'});
      assert.equal(rows.length,2);assert.equal(rows[0].trackId,rows[1].trackId);
      assert.equal((await db('o_videoTrack').where('id',rows[0].trackId).first()).duration,30);
      assert.equal((await db('o_storyboard').where('projectId',8)).length,1);
    });
  }finally{
    if(created&&/^xoi_storyboard_test_[a-f0-9]{16}$/.test(schema))await db.raw('DROP SCHEMA ?? CASCADE',[schema]);
    await db.destroy();
  }
});
