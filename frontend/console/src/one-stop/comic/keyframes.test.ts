import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectKeyframe,updateShotPrompt} from './keyframes';
import {allScenes,type ComicProject} from './types';
const project=()=>({id:'fixture',script:{episodes:[{title:'第一集',scenes:[{id:'s1',imageUrl:'main',altImages:['alt','alt','main'],videoUrl:'video',videoStatus:'done',shotPrompt:'old'},{id:'s2',imageUrl:'other'}]}]},assets:[],done:{storyboard:true}} as unknown as ComicProject);
test('selecting a candidate archives the old main, deduplicates frames, preserves other shots and flags video',()=>{
  const p=project(),next=selectKeyframe(p,'s1','alt'),s=allScenes(next)[0];
  assert.equal(s.imageUrl,'alt');assert.deepEqual(s.altImages,['main']);assert.equal(s.videoUrl,'video');assert.equal(s.videoStatus,'stale');
  assert.equal(allScenes(p)[0].imageUrl,'main');assert.equal(allScenes(next)[1],allScenes(p)[1]);
  assert.equal(selectKeyframe(next,'s1','alt'),next);assert.equal(selectKeyframe(p,'missing','new'),p);
});
test('prompt editing never deletes old media or submits a generation',()=>{
  const p=project(),next=updateShotPrompt(p,'s1','new'),s=allScenes(next)[0];
  assert.equal(s.shotPrompt,'new');assert.equal(s.imageUrl,'main');assert.equal(s.videoUrl,'video');assert.equal(s.videoStatus,'stale');
  assert.equal(updateShotPrompt(p,'s1','old'),p);assert.equal(allScenes(p)[0].shotPrompt,'old');
});
