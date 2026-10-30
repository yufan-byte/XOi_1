import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import knex from 'knex';
import jwt from 'jsonwebtoken';
import {once} from 'node:events';
import {privateMedia} from '../middleware/privateMedia';
import {mediaStatic} from '../middleware/mediaStatic';
import {canReadMedia,mediaPath,mediaGrant,parseMediaGrant,mediaTokenHint} from './privateMedia';

test('private media checks cookie identity, tenant, version, one-file grant and byte ranges without upstream calls',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xoi-private-media-')),db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
  const secret='test-only-not-a-real-server-secret',users=new Map([[1,{id:1,role:'user',session_version:0}],[2,{id:2,role:'user',session_version:0}],[3,{id:3,role:'admin',session_version:0}]]);
  const token=(id:number)=>jwt.sign({id},secret,{expiresIn:'1h'}),a=token(1),b=token(2);
  const cookie=(value:string)=>{const id=(jwt.decode(value) as any).id;return `xoi_media_session_${id}=${value}; xoi_media_owner=${id}:${mediaTokenHint(value)}`;};
  await db.schema.createTable('o_project',t=>{t.integer('id').primary();t.integer('userId');});await db('o_project').insert([{id:101,userId:1},{id:202,userId:2}]);
  for(const p of ['/101/frame.png','/202/frame.png','/one-stop/1/video.mp4','/one-stop/2/video.mp4','/canvas-files/1/upload.png','/canvas/image/2/image.png','/artStyle/shared.jpg']){
    await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),Buffer.from('fixture-media-0123456789'));
  }
  await fs.symlink(path.join(root,'202/frame.png'),path.join(root,'101/link.png'));
  const app=express();app.use('/oss',privateMedia(db,root,async()=>secret,async id=>users.get(id)),mediaStatic(root));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as any).port}/oss`;
  const get=(p:string,headers:Record<string,string>={})=>fetch(base+p,{headers});
  try{
    await t.test('anonymous and foreign accounts cannot read project or one-stop files',async()=>{
      assert.equal((await get('/101/frame.png')).status,403);
      assert.equal((await get('/101/frame.png',{Cookie:cookie(b)})).status,403);
      assert.equal((await get('/one-stop/1/video.mp4',{Cookie:cookie(b)})).status,403);
      assert.equal((await get('/canvas/image/2/image.png',{Cookie:cookie(a)})).status,403);
    });
    await t.test('owner plays media; admin remains allowed; shared presets stay readable',async()=>{
      const response=await get('/101/frame.png',{Cookie:cookie(a)});assert.equal(response.status,200);assert.match(response.headers.get('cache-control')||'',/private/);assert.match(response.headers.get('cache-control')||'',/no-cache/);
      const etag=response.headers.get('etag');assert.ok(etag);
      assert.equal((await get('/101/frame.png',{Cookie:cookie(a),'If-None-Match':etag,'Cache-Control':'max-age=0'})).status,304);
      assert.equal((await get('/101/frame.png',{Cookie:cookie(b),'If-None-Match':etag})).status,403);
      assert.equal((await get('/101/frame.png',{'If-None-Match':etag})).status,403);
      assert.equal((await get('/101/frame.png',{Authorization:'Bearer '+a})).status,200);
      assert.equal((await get('/101/frame.png',{Cookie:cookie(token(3))})).status,200);
      assert.equal((await get('/artStyle/shared.jpg')).status,200);
      const ranged=await get('/one-stop/1/video.mp4',{Cookie:cookie(a),Range:'bytes=0-3'});assert.equal(ranged.status,206);assert.equal((await ranged.arrayBuffer()).byteLength,4);
    });
    await t.test('a late A cookie cannot pair with B owner hint; logout drops the hint',async()=>{
      assert.equal((await get('/101/frame.png',{Cookie:`xoi_media_session_1=${a}; xoi_media_owner=2:${mediaTokenHint(b)}`})).status,403);
      assert.equal((await get('/101/frame.png',{Cookie:`xoi_media_session_1=${a}`})).status,403);
      assert.equal((await get('/one-stop/2/video.mp4',{Cookie:`xoi_media_session_1=${a}; ${cookie(b)}`})).status,200);
    });
    await t.test('upstream receives a temporary one-file capability, never a login JWT',async()=>{
      const grant=mediaGrant(secret,'/101/frame.png',users.get(1)!);
      assert.ok(!grant.includes(a));assert.equal((await get('/101/frame.png?xoi_m='+grant)).status,200);
      assert.equal((await get('/202/frame.png?xoi_m='+grant)).status,403);
      assert.equal((await get('/101/frame.png?xoi_m='+grant.slice(0,-2)+'xx')).status,403);
      const expired=mediaGrant(secret,'/101/frame.png',users.get(1)!,Date.now()-7200000);
      assert.equal((await get('/101/frame.png?xoi_m='+expired)).status,403);
      assert.throws(()=>parseMediaGrant(secret,'/101/frame.png',grant,Date.now()+7200000));
    });
    await t.test('revoked credentials/grants and symlinks cannot expose files',async()=>{
      const grant=mediaGrant(secret,'/101/frame.png',users.get(1)!);
      users.set(1,{id:1,role:'user',session_version:1});
      assert.equal((await get('/101/frame.png',{Cookie:cookie(a)})).status,403);
      assert.equal((await get('/101/frame.png?xoi_m='+grant)).status,403);
      users.set(1,{id:1,role:'user',session_version:0});
      assert.equal((await get('/101/link.png',{Cookie:cookie(a)})).status,403);
    });
    await t.test('path ambiguity and orphaned files fail closed',async()=>{
      for(const value of ['/101/../202/a.png','/101/%2e%2e/202/a.png','/101/%252e%252e/a.png','//101/a.png','/101/a\\b.png','/101/a.png?x=1','/101/a\n.png'])assert.throws(()=>mediaPath(value));
      assert.equal(await canReadMedia(db,users.get(1),'/legacy.mp4'),false);
      assert.equal(await canReadMedia(db,users.get(1),'/999/deleted-project.png'),false);
    });
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.destroy();await fs.rm(root,{recursive:true,force:true});}
});
