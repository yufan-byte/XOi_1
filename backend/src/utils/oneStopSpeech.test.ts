import test from 'node:test';
import assert from 'node:assert/strict';
import {planSpeech,voiceIds,sceneSpeechSource,hasSpeech,movieAudioIssues} from '../../../shared/oneStopSpeech';
import {defaultShotVideoPrompt,assetImageGuidance,stageCreativeGuidance,storyLanguage,imageStylePrompt} from '../../../shared/oneStopPrompts';
import {speechPlan,nextSpeechStep} from '../lib/oneStop/speechPlan';
import {applyResult,nextStep} from '../lib/oneStop/generationPolicy';
import {movieCurrent,movieSignature} from '../../../shared/oneStopMedia';
const model={modelName:'tts-1',paramSchema:{voice:{enum:['alloy','nova','onyx']}}};
const project=()=>({id:'fixture',kind:'batch',idea:'两人重逢',ratio:'16:9',episodeCount:1,assets:[{kind:'character',name:'林晚',voice:'nova'},{kind:'character',name:'沈舟',voice:'onyx'}],models:{audio:'tts-1'},voice:'alloy',done:{},log:[],script:{episodes:[{scenes:[{id:'s1',characters:['林晚','沈舟'],dialogue:'林晚（低声）：你来了。\n林晚：我等你很久了。\n沈舟: 我一直在。\n远处钟声响起。'}]}]}});
test('dialogue uses character voices, removes speaker labels, merges adjacent equal voices and keeps narrator separate',()=>{
 const p=project(),s=p.script.episodes[0].scenes[0],parts=planSpeech(p,s,model);
 assert.deepEqual(parts.map(x=>[x.voice,x.text]),[['nova','你来了。\n我等你很久了。'],['onyx','我一直在。'],['alloy','远处钟声响起。']]);
 assert.equal(voiceIds({modelName:'doubao-tts',paramSchema:{}}).includes('zh_female_vv_uranus_bigtts'),true);
 assert.equal(planSpeech({...p,voice:'invalid'},s,model)[2].voice,'alloy');
});
test('partial paid voice checkpoints survive failure; retry only selects missing parts, not already completed speech',()=>{
 let p:any=project();const target='s1',plan=speechPlan(p,target,model);let step=nextSpeechStep(p,target,model);
 assert.equal(step.operation,'speech-part');assert.equal(step.index,0);
 const save=(i:number)=>{const part=plan.parts[i];p=applyResult(p,{projectId:p.id,operation:'speech-part',target,index:i},{url:`/oss/one-stop/1/${i}.mp3`,take:plan.take,key:part.key,voice:part.voice,model:model.modelName,planKeys:plan.parts.map(x=>x.key)},()=> 'id');};
 save(0);step=nextSpeechStep(p,target,model);assert.equal(step.index,1);assert.equal(p.script.episodes[0].scenes[0].speechStatus,'stale');
 // Simulate a process exit after segment 0: only persisted JSON is available on resume.
 p=JSON.parse(JSON.stringify(p));assert.equal(nextSpeechStep(p,target,model).index,1);
 save(1);save(2);assert.equal(nextSpeechStep(p,target,model).operation,'speech-join');
 assert.equal(nextSpeechStep(p,target,model,'explicit-new-take').index,0);
});
test('changed dialogue invalidates only its cache key; changed audio source invalidates the archived movie',()=>{
 const p:any=project(),s=p.script.episodes[0].scenes[0];s.videoUrl='/oss/v.mp4';s.speechUrl='/oss/s.mp3';s.speechSource=sceneSpeechSource(p,s);s.speechStatus='done';p.finalMovie={url:'/oss/movie.mp4',source:movieSignature(p)};
 const first=speechPlan(p,'s1',model).parts.map(x=>x.key);assert.equal(movieCurrent(p),true);
 s.dialogue=s.dialogue.replace('你来了','你终于来了');const next=speechPlan(p,'s1',model).parts.map(x=>x.key);
 assert.notEqual(first[0],next[0]);assert.equal(first[1],next[1]);assert.equal(movieCurrent(p),false);
});
test('empty dialogue, foreign scene and excessive alternating parts fail before any upstream request',()=>{
 const p=project();assert.throws(()=>speechPlan(p,'foreign',model));assert.throws(()=>planSpeech(p,{dialogue:''},model));
 assert.throws(()=>planSpeech(p,{dialogue:Array.from({length:65},(_,i)=>(i%2?'林晚':'沈舟')+'：台词').join('\n')},model));
});
test('silent scenes do not incur TTS calls; changed or missing required voice cannot silently enter a movie',()=>{
 const p:any=project(),s=p.script.episodes[0].scenes[0];assert.equal(hasSpeech({dialogue:'（无）'}),false);assert.throws(()=>planSpeech(p,{dialogue:'（无）'},model));
 assert.equal(movieAudioIssues(p).length,0);p.autoVoice=true;assert.equal(movieAudioIssues(p).length,1);
 s.speechUrl='/oss/test.mp3';s.speechStatus='done';s.speechSource=sceneSpeechSource(p,s);assert.equal(movieAudioIssues(p).length,0);
 s.dialogue+='\n林晚：再见。';assert.equal(movieAudioIssues(p).length,1);p.autoVoice=false;assert.equal(movieAudioIssues(p).length,1);
});
test('manual and batch video defaults retain dialogue and continuity; each text phase respects the selected language',()=>{
 const p=project(),s=p.script.episodes[0].scenes[0],prompt=defaultShotVideoPrompt({...p,style:'精致国漫'},{...s,action:'重逢',camera:'缓推'});
 assert.ok(prompt.includes('你来了'));assert.ok(prompt.includes('运镜：缓推'));assert.ok(prompt.includes('光线和视线方向一致'));
 assert.ok(assetImageGuidance('scene').includes('无人物'));assert.ok(assetImageGuidance('character').includes('全身'));assert.ok(assetImageGuidance('prop').includes('材质'));
 assert.equal(storyLanguage('海外剧 · 日本語'),'日语');assert.ok(stageCreativeGuidance('script',{region:'海外剧 · English'}).includes('使用英文'));assert.ok(stageCreativeGuidance('shots',{fixedShotSec:15}).includes('15秒'));
 assert.match(imageStylePrompt('2D电影'),/2D anime/);assert.doesNotMatch(imageStylePrompt('2D电影'),/live-action/);assert.match(imageStylePrompt('自建风格','冷灰色、侧逆光'),/冷灰色、侧逆光/);
});
