/** Local disposable schema only. No app globals, real accounts, wallets, media or model calls. */
import knex from 'knex';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {CreativeIds} from '../src/utils/creativeIds';
import {createUnlinkedStoryboardTracks} from '../src/utils/storyboardStore';
import {upsertUserMirror} from '../src/utils/userMirrorStore';
import {ModelConcurrency,ModelCapacityError} from '../src/utils/modelConcurrency';
import {withSecuritySchemaLock} from '../src/utils/securitySchema';

async function main(){
  const url=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;if(!url)throw Error('本机测试数据库未配置');
  const parsed=new URL(url);
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||[...parsed.searchParams.keys()].some(k=>!['sslmode','application_name'].includes(k)))throw Error('只允许本机 PostgreSQL，禁止连接生产或覆盖 search_path');
  const schema='xoi_test_accounts_'+crypto.randomBytes(8).toString('hex');
  const db=knex({client:'pg',connection:url,searchPath:[schema],pool:{min:0,max:8},acquireConnectionTimeout:10000});
  const second=knex({client:'pg',connection:url,searchPath:[schema],pool:{min:0,max:4},acquireConnectionTimeout:10000});
  let created=false;const checks:string[]=[];
  try{
    await db.raw('CREATE SCHEMA ??',[schema]);created=true;
    // Same schema bootstrap lock on two independent pools, like two application replicas.
    await Promise.all([db,second].map(client=>withSecuritySchemaLock(client,async trx=>{
      if(!await trx.schema.hasTable('o_project'))await trx.schema.createTable('o_project',t=>{t.bigInteger('id').primary();t.integer('userId');});
      if(!await trx.schema.hasTable('o_videoTrack'))await trx.schema.createTable('o_videoTrack',t=>{t.increments('id');t.bigInteger('projectId');t.bigInteger('scriptId');t.integer('duration');});
    })));
    checks.push('two-node-first-schema-serialization');
    await db('o_project').insert([{id:100,userId:1},{id:200,userId:2}]);
    await db('o_videoTrack').insert({id:42,projectId:100,scriptId:1,duration:15});
    const idsA=new CreativeIds(db),idsB=new CreativeIds(second);
    await Promise.all([idsA.ensure(),idsB.ensure()]);
    assert.equal((await db('o_videoTrack').columnInfo('id')).type,'bigint');
    assert.equal(Number((await db('o_videoTrack').where('id',42).first()).id),42);
    const ids=await Promise.all(Array.from({length:2000},(_,i)=>(i%2?idsA:idsB).next()));
    assert.equal(new Set(ids).size,2000);assert.ok(ids.every(id=>Number.isSafeInteger(id)&&id>=4000000000000000));
    const after=new CreativeIds(second);await after.ensure();assert.ok(await after.next()>Math.max(...ids));
    checks.push('2000-cross-node-ids-no-collision','int32-track-upgrade-preserves-rows','restart-does-not-reset-sequence');
    await db.schema.createTable('o_storyboard',t=>{t.integer('id').primary();t.bigInteger('projectId');t.bigInteger('scriptId');t.bigInteger('trackId');t.text('filePath');});
    await db('o_storyboard').insert([{id:1,projectId:100,scriptId:1,filePath:'keep-a.mp4'},{id:2,projectId:100,scriptId:1,filePath:'keep-b.png'},{id:3,projectId:200,scriptId:2,filePath:'other.png'}]);
    const race=await Promise.all([createUnlinkedStoryboardTracks(db,100,1,[1,2]),createUnlinkedStoryboardTracks(second,100,1,[1,2]),createUnlinkedStoryboardTracks(db,200,2,[3])]);
    assert.equal(race.flat().length,3);assert.equal(Number((await db('o_videoTrack').count('* as n').first())?.n),4);
    assert.deepEqual((await db('o_storyboard').orderBy('id')).map(r=>r.filePath),['keep-a.mp4','keep-b.png','other.png']);
    assert.deepEqual(await createUnlinkedStoryboardTracks(db,100,1,[3]),[]);
    checks.push('concurrent-track-double-click-idempotent','cross-project-track-isolation','media-paths-preserved');
    await db.schema.createTable('o_user',t=>{t.integer('id').primary();for(const key of ['name','role','status','email','user_group','password','display_id','created_at','last_login_at'])t.text(key);t.integer('session_version');t.integer('newapi_uid').unique();});
    const account=(id:number)=>({id,name:`fixture${id}`,role:'user',status:'active',email:null,user_group:'fixture'});
    await Promise.all(Array.from({length:24},(_,i)=>upsertUserMirror(i%2?db:second,account(1))));
    assert.equal(Number((await db('o_user').count('* as n').first())?.n),1);
    await Promise.all(Array.from({length:12},(_,i)=>upsertUserMirror(i%2?db:second,account(i+2),undefined,()=> '111111')));
    const users=await db('o_user');assert.equal(users.length,13);assert.equal(new Set(users.map(u=>u.display_id)).size,13);
    const original=await db('o_user').where({id:1}).first();await db('o_user').where({id:1}).update({session_version:9});
    const updated=await upsertUserMirror(second,{...account(1),role:'admin'});assert.equal(updated.display_id,original.display_id);assert.equal(updated.session_version,9);assert.equal(updated.role,'admin');
    checks.push('concurrent-login-mirror-single-row','display-id-collision-fallback','session-version-and-display-id-preserved');
    const capacityA=new ModelConcurrency(db,4,2),capacityB=new ModelConcurrency(second,4,2);
    const leases=[];
    try{
      leases.push(await capacityA.acquire(1),await capacityB.acquire(1));
      await assert.rejects(capacityA.acquire(1),e=>e instanceof ModelCapacityError);
      leases.push(await capacityA.acquire(2),await capacityB.acquire(2));
      await assert.rejects(capacityB.acquire(3),e=>e instanceof ModelCapacityError);
      await leases[0]();await leases[0]();leases.push(await capacityB.acquire(3));
    }finally{await Promise.all(leases.map(release=>release()));}
    assert.equal(Number((await db('xoi_model_leases').count('* as n').first())?.n),0);
    checks.push('cross-node-global-and-user-capacity','lease-release-idempotent');
    console.log(JSON.stringify({passed:true,checks,customerWrites:0,modelCalls:0,isolatedSchema:true}));
  }finally{
    await second.destroy();
    if(created&&/^xoi_test_accounts_[a-f0-9]{16}$/.test(schema))await db.raw('DROP SCHEMA ?? CASCADE',[schema]);
    await db.destroy();
  }
}
void main().catch(e=>{console.error(e instanceof Error?e.message:'多账号隔离测试失败');process.exitCode=1;});
