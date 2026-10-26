import test from 'node:test';
import assert from 'node:assert/strict';
import { readContinuity, sceneIdentity, continuityPrompt, runSceneGroups } from './directorContinuity';
import { continuityVideoInput, runDependentVideoJobs, directorTailFrame } from './directorVideoContinuity';
import { extractDirectorDraft } from './directorStageDraft';
import { customCreativePreference, readCreativePreference, creativePreferencePrompt } from '../../../shared/creativePreference';

const c={sceneId:30,transition:'continue' as const,startState:'人物在门边',endState:'人物推门',screenDirection:'保持左入右出'};
function plan(transition='continue',scene=30,previousScene=30):any{return{continues:transition==='continue',first:{continuity:{...c,transition},sceneId:scene,sceneName:'卧室',references:[{name:'卧室',type:'scene',filePath:'/scene.jpg'},{name:'主角',type:'role',filePath:'/role.jpg'}]},previous:{sceneId:previousScene,continuity:{...c,endState:'人物走到门边'}}};}
test('creative preferences round-trip, preserve presets and reject file paths',()=>{
  assert.equal(readCreativePreference('').mode,'none');
  assert.equal(readCreativePreference('realpeople_ancient_chinese').mode,'preset');
  assert.equal(readCreativePreference(customCreativePreference('低饱和，自然光')).text,'低饱和，自然光');
  assert.match(creativePreferencePrompt('','视觉'),/不擅自套用/);
  for(const value of ['../secret','/tmp/private','@xoi-brief:v1:{bad','@xoi-brief:v1:{}'])assert.throws(()=>readCreativePreference(value));
  assert.throws(()=>customCreativePreference('x'.repeat(4001)));
});
test('only complete bounded assistant XML is persisted; last completed version wins',()=>{
  assert.deepEqual(extractDirectorDraft('<scriptPlan>partial'),{});
  assert.deepEqual(extractDirectorDraft('<scriptPlan>A</scriptPlan><scriptPlan>B</scriptPlan><storyboardTable>C</storyboardTable>'),{scriptPlan:'B',storyboardTable:'C'});
  assert.deepEqual(extractDirectorDraft('<scriptPlan>'+'x'.repeat(200001)+'</scriptPlan>'),{});
});
test('scene identity never guesses between multiple rooms or accepts an unassociated room',()=>{
  assert.equal(sceneIdentity(null,[30]),30);
  assert.equal(sceneIdentity(null,[30,31]),null);
  assert.throws(()=>sceneIdentity(c,[31]));
  assert.equal(readContinuity(JSON.stringify(c))?.sceneId,30);
  assert.match(continuityPrompt(c,'卧室',c),/上一镜结束状态/);
});
test('same-scene pictures are ordered, other scenes can proceed independently',async()=>{
  const events:string[]=[];
  await runSceneGroups([{id:'a1',s:'a'},{id:'b1',s:'b'},{id:'a2',s:'a'}],x=>x.s,async x=>{events.push(x.id+' start');await new Promise(r=>setTimeout(r,5));events.push(x.id+' end');},2);
  assert.ok(events.indexOf('a2 start')>events.indexOf('a1 end'));
  assert.ok(events.indexOf('b1 start')<events.indexOf('a1 end'));
});
test('Seedance continuation forwards actual tail first, then user-selected references without silently adding project assets',async()=>{
  const p=plan();
  const input=await continuityVideoInput(p,'newapi:seedance2.0-line1-xoi','开门',[{type:'image',base64:'target'}],async s=>s,'tail');
  assert.deepEqual(input.referenceList.map(r=>r.base64),['tail','target']);
  assert.match(input.prompt,/参考1：上一镜真实视频的末帧/);
  assert.match(input.prompt,/人物走到门边/);
  await assert.rejects(continuityVideoInput(p,'newapi:seedance2.0-line1-xoi','',[],async s=>s),/尚未完成/);
});
test('scene cuts do not inherit tail; foreign scenes cannot be forced into a continuation',async()=>{
  const input=await continuityVideoInput(plan('new_scene',31),'newapi:seedance2.0-line1-xoi','换房间',[{type:'image',base64:'new-room'}],async s=>s,'old-tail');
  assert.ok(!input.referenceList.some(r=>r.base64==='old-tail'));
  await assert.rejects(continuityVideoInput(plan('continue',31,30),'newapi:seedance2.0-line1-xoi','',[],async s=>s,'tail'),/同一个场景/);
});
test('single-image-only adapters receive one true starting frame, not an accidental end frame',async()=>{
  const input=await continuityVideoInput(plan(),'newapi:other-model','',[{type:'image',base64:'target'}],async s=>s,'tail');
  assert.deepEqual(input.referenceList,[{type:'image',base64:'tail'}]);
});
test('dependent videos wait for this batch predecessor; failure prevents a charged dependent submission',async()=>{
  const events:string[]=[];
  await runDependentVideoJobs([{trackId:1,index:0,dependency:null},{trackId:2,index:1,dependency:1},{trackId:3,index:2,dependency:null}],async j=>{events.push('start'+j.trackId);if(j.trackId===1)throw Error('upstream failed');},async(j,e)=>{events.push('failed'+j.trackId);if(j.trackId===2)assert.match(String(e),/未提交模型/);});
  assert.ok(!events.includes('start2'));assert.ok(events.includes('start3'));assert.ok(events.includes('failed2'));
  const success:number[]=[];
  await runDependentVideoJobs([{trackId:2,index:1,dependency:1},{trackId:1,index:0,dependency:null}],async j=>{await new Promise(r=>setTimeout(r,5));success.push(j.trackId);},async()=>assert.fail('unexpected failure'));
  assert.deepEqual(success,[1,2]);
});
test('tail extraction rejects URLs, paths from other projects and path traversal before reading files',async()=>{
  for(const p of ['https://remote.test/video.mp4','/8/video/a.mp4','/7/video/../private.mp4','file:///tmp/x.mp4'])await assert.rejects(directorTailFrame('/not-read',7,p),/本项目/);
});


test('text-to-video sends zero images, requires no predecessor media, and keeps textual direction',async()=>{
  const p=plan();p.anchor={filePath:'/unreadable-anchor.jpg'};
  const input=await continuityVideoInput(p,'newapi:seedance2.0-line1-xoi','凭描述拍摄',[{type:'image',base64:'must-not-be-sent'}],async()=>{throw Error('Text must not read image files');},undefined,'text');
  assert.deepEqual(input.referenceList,[]);assert.ok(input.prompt.startsWith('凭描述拍摄'));assert.match(input.prompt,/人物在门边/);assert.doesNotMatch(input.prompt,/参考图对应关系/);
});
