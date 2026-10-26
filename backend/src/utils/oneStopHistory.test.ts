import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreStage,historyStage,historyValue} from '../lib/oneStop/history';
const fixture=()=>({id:'fixture',kind:'premium',idea:'少年出发',ratio:'16:9',episodeCount:1,status:'已完成',stage:'video',done:{outline:true,script:true,video:true},assets:[],models:{chat:'m'},log:[],outline:{title:'新大纲',episodes:[{title:'新标题',synopsis:'新的内容'}]},script:{title:'剧本',episodes:[{scenes:[{id:'s1',imageUrl:'/oss/image.png',videoUrl:'/oss/video.mp4'}]}]},finalMovie:{url:'/oss/movie.mp4',source:'old'}});
test('stage recovery preserves downstream files and all unrelated project data, but requires review',()=>{
 const p=fixture(),before=JSON.stringify(p),old={title:'旧大纲',episodes:[{title:'旧标题',synopsis:'旧内容'}]},next=restoreStage(p,{operation:'outline',before_payload:{stage:'outline',value:old}});
 assert.deepEqual(next.outline,old);assert.equal(next.stage,'outline');assert.equal(next.done.video,false);assert.equal(next.script.episodes[0].scenes[0].videoUrl,'/oss/video.mp4');assert.equal(next.finalMovie.url,p.finalMovie.url);assert.equal(next.finalMovie.source,'');assert.equal(JSON.stringify(p),before);
});
test('restoring a restore backup correctly handles render snapshots instead of replacing the script with a movie object',()=>{
 const p=fixture(),next=restoreStage(p,{operation:'restore',before_payload:{scope:'video',sourceOperation:'render',value:{url:'/oss/older.mp4',source:'v1'}}});
 assert.equal(next.finalMovie.url,'/oss/older.mp4');assert.deepEqual(next.script,p.script);assert.equal(historyStage('restore',{scope:'video'}),'video');assert.deepEqual(historyValue(p,'render','video'),p.finalMovie);
});
test('recovered snapshots never pretend an old in-flight state is still running; invalid snapshots cannot erase projects',()=>{
 const p=fixture(),old=structuredClone(p.script);(old.episodes[0].scenes[0] as any).imageStatus='running';
 const next=restoreStage(p,{operation:'shots',before_payload:{value:old}});assert.equal(next.script.episodes[0].scenes[0].imageStatus,'done');
 assert.throws(()=>restoreStage(p,{operation:'forged',before_payload:{value:{}}}));assert.throws(()=>restoreStage(p,{operation:'assets',before_payload:{value:'not an array'}}));
});
test('media-stage restore cannot overwrite newer dialogue, location, episode titles or unrelated media',()=>{
 const p:any=fixture(),s=p.script.episodes[0].scenes[0];s.dialogue='用户刚修改的台词';s.location='新的地点';s.shotPrompt='新画面';
 const old=structuredClone(p.script),o=old.episodes[0].scenes[0];o.dialogue='旧台词';o.location='旧地点';o.shotPrompt='旧画面';o.imageUrl='/oss/old.png';o.videoUrl='/oss/old.mp4';
 const next=restoreStage(p,{operation:'storyboard-image',before_payload:{value:old}}),n=next.script.episodes[0].scenes[0];
 assert.equal(n.dialogue,s.dialogue);assert.equal(n.location,s.location);assert.equal(n.shotPrompt,'旧画面');assert.equal(n.imageUrl,'/oss/old.png');assert.equal(n.videoUrl,s.videoUrl);
 const video=restoreStage(p,{operation:'scene-video',before_payload:{value:old}}).script.episodes[0].scenes[0];assert.equal(video.imageUrl,s.imageUrl);assert.equal(video.videoUrl,'/oss/old.mp4');assert.equal(video.dialogue,s.dialogue);
});
