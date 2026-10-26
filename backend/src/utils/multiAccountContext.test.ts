import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runWithGatewayUser,requireGatewayUserId,getGatewayRequestContext} from '../lib/gateway/context';

test('2000 interleaved account callbacks preserve their own identity, budget and nested job context',async()=>{
  await Promise.all(Array.from({length:2000},(_,i)=>runWithGatewayUser(i+1,async()=>{
    await Promise.resolve();
    assert.equal(requireGatewayUserId(),i+1);assert.equal(getGatewayRequestContext()?.billingId,`budget-${i}`);
    await runWithGatewayUser(i+10000,async()=>{await Promise.resolve();assert.equal(requireGatewayUserId(),i+10000);});
    assert.equal(requireGatewayUserId(),i+1);
  },`budget-${i}`)));
  assert.throws(()=>requireGatewayUserId(),/缺少用户身份/);
});
test('startup repair must not blanket-fail other nodes/accounts or rewrite existing admin display IDs',()=>{
  const fix=readFileSync(resolve(__dirname,'../lib/fixDB.ts'),'utf8');
  assert.ok(!fix.includes('软件退出导致失败'));
  for(const table of ['o_video','o_image','o_storyboard','o_script','o_novel','o_assets'])assert.ok(!new RegExp(`await knex\\("${table}"\\)\\.where\\([^;]*\\.update\\(`).test(fix),table);
  const init=readFileSync(resolve(__dirname,'../lib/initDB.ts'),'utf8');
  assert.ok(!/where\("role", "admin"\)\.update\(\{ display_id/.test(init));
});
