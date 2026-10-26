import test from 'node:test';
import assert from 'node:assert/strict';
import {applyResult,context,generationRequest,generationSubmission,generationRejection,videoParameters,nextStep,parseTextResult,validateProject,categories,shotTextProject,type Project} from '../lib/oneStop/generationPolicy';
import {budgetModelDecision,freeBudgetDecision} from './billingBudgetPolicy';
import {movieSignature,movieCurrent,videoReferences,videoInputPolicy,imageReferenceLimit,storyboardInputs} from '../../../shared/oneStopMedia';
const project=():Project=>({id:'fixture',name:'验收',idea:'少年寻找仙山',kind:'premium',style:'国漫',ratio:'9:16',region:'国产剧 · 中文',episodeCount:1,episodeSeconds:10,assets:[],done:{},log:[],models:{chat:'fixture-text',image:'fixture-image',video:'fixture-video'}});
const fixtures:Record<string,any>={intent:{audience:'观众',genre:'仙侠',tone:'成长',duration:'10秒',sellingPoints:'御剑'},direction:{directions:[{title:'仙山',logline:'少年寻找失落仙山',keywords:['仙侠']}]},outline:{title:'仙山',episodes:[{title:'初遇',synopsis:'少年出发'}]},novel:'少年仰望云海，拔剑出发。',script:{title:'仙山',synopsis:'少年出发',episodes:[{title:'初遇',scenes:[{location:'山巅',time:'晨',characters:['少年'],dialogue:'少年：出发！',action:'少年御剑飞入云海'}]}]},assets:{characters:[{name:'少年',description:'青衣剑客'}],scenes:[],props:[]},shots:{shots:[{id:'e1s1',prompt:'青衣少年御剑',shotSize:'全景',camera:'跟拍'}]}};
test('single shot targeting does not silently design its neighbours or the first batch',()=>{
 const p=project();p.script={title:'长剧',episodes:[{scenes:Array.from({length:18},(_,i)=>({id:`shot-${i+1}`,action:'起身',characters:[]}))}]};
 const selected=shotTextProject(p,{projectId:p.id,operation:'shots',target:'shot-17'});
 assert.deepEqual(selected.script.episodes[0].scenes.map((s:any)=>s.id),['shot-17']);
 assert.doesNotThrow(()=>parseTextResult('shots',JSON.stringify({shots:[{id:'shot-17',prompt:'晨光',shotSize:'近景',camera:'固定'}]}),selected));
 assert.equal(shotTextProject(p,{projectId:p.id,operation:'shots',index:1}).script.episodes[0].scenes[0].id,'shot-9');
 assert.throws(()=>shotTextProject(p,{projectId:p.id,operation:'shots',target:'missing'}));
 assert.throws(()=>shotTextProject(p,{projectId:p.id,operation:'shots',target:'shot-1',index:0}));
 assert.equal(p.script.episodes[0].scenes.length,18);
});
test('storyboard images carry both character and environment anchors within provider limits',()=>{
 const p=project();p.script={episodes:[{scenes:[{id:'s1',location:'武大郎家卧室',characters:['西门大官人']}]}]};
 p.assets=[{kind:'character',name:'西门大官人',description:'藏青长袍',imageUrl:'actor'},{kind:'scene',name:'武大郎家卧室',description:'雕花窗在左，木门在右',imageUrl:'room'},{kind:'scene',name:'客栈',imageUrl:'other'}];p.styleRefs=['style','actor'];
 assert.deepEqual(storyboardInputs(p,'s1',{paramSchema:{images:{max_items:2}}}).images,['actor','room']);
 const textOnly=storyboardInputs(p,'s1',{modelName:'agnes-image-2.5-flash'});assert.deepEqual(textOnly.images,[]);assert.match(textOnly.description,/木门在右/);assert.match(textOnly.description,/藏青长袍/);
 assert.throws(()=>storyboardInputs(p,'foreign',{}));
});
test('request contracts reject owner/model/endpoint injection and unsafe target ids',()=>{
 const request={projectId:'fixture',operation:'intent'};assert.equal(generationRequest.safeParse(request).success,true);
 for(const change of [{userId:2},{model:'admin-model'},{url:'http://private'},{projectId:'../private'},{operation:'free'}])assert.equal(generationRequest.safeParse({...request,...change}).success,false);
});
test('server workflow checkpoints every step, skips successes and converges without replay',()=>{
 let p=project(),calls=0;const operations:string[]=[];
 while(nextStep(p)){
  const step=nextStep(p)!;operations.push(step.operation);let value=fixtures[step.operation]||(step.operation==='render'?{url:'/oss/one-stop/1/fixture.mp4',source:movieSignature(p)}:{url:'/oss/one-stop/1/fixture.png'});
  if(fixtures[step.operation])value=parseTextResult(step.operation,typeof value==='string'?value:JSON.stringify(value),p,step.index);
  p=applyResult(p,step,value,()=>`id-${calls}`);calls++;validateProject(p);assert.ok(calls<20);
  if(calls===5){const persisted=JSON.stringify(p);p=JSON.parse(persisted);assert.equal(nextStep(p)?.operation,'assets');}
 }
 assert.deepEqual(operations,['intent','direction','outline','novel','script','assets','asset-image','shots','storyboard-image','scene-video','render']);
 assert.equal(nextStep(p),null);assert.equal(p.script.episodes[0].scenes[0].videoStatus,'done');assert.equal(calls,11);assert.equal(p.status,'已完成');assert.ok(movieCurrent(p));
});
test('invalid/partial model output never overwrites existing results',()=>{
 const p=project(),original=JSON.stringify(p);
 for(const result of ['not json','{}','{"episodes":[]}'])assert.throws(()=>parseTextResult('outline',result,p));
 assert.throws(()=>parseTextResult('outline',JSON.stringify({title:'bad',episodes:[{title:'a',synopsis:'a'},{title:'b',synopsis:'b'}]}),p));
 assert.equal(JSON.stringify(p),original);
});
test('generated script ids are canonical, duplicate/foreign shot ids rejected',()=>{
 let p=project();p=applyResult(p,{projectId:p.id,operation:'script'},fixtures.script,()=> 'id');assert.equal(p.script.episodes[0].scenes[0].id,'e1s1');
 assert.throws(()=>parseTextResult('shots',JSON.stringify({shots:[{id:'other',prompt:'x',shotSize:'x',camera:'x'}]}),p));
});
test('reference media and binary blobs are not sent into text context',()=>{
 const p=project();p.script={...fixtures.script,episodes:[{title:'x',scenes:[{...fixtures.script.episodes[0].scenes[0],imageUrl:'data:image/png;base64,SECRET',videoUrl:'PRIVATE'}]}]};
 assert.doesNotMatch(context(p),/SECRET|PRIVATE/);assert.match(context(p),/少年/);
});
test('project limits bound fanout without deleting customer content',()=>{
 const p=project();for(const count of [0,17,10000])assert.throws(()=>validateProject({...p,episodeCount:count}));
 const lots={...p,assets:Array.from({length:101},()=>({id:'keep'}))};assert.throws(()=>validateProject(lots));assert.equal(lots.assets.length,101);
});
test('free/mixed batch categories are server-defined; audio is not silently included',()=>{
 assert.deepEqual(categories('autopilot'),['text','image','video']);assert.deepEqual(categories('scene-videos'),['video']);assert.deepEqual(categories('voice-sample'),['audio']);
 assert.deepEqual(categories('autopilot',{autoVoice:true,models:{}}),['text','image','video','audio'],'Explicit voice configuration must fail at admission when missing, not after all paid videos');
});
test('re-extraction preserves custom assets and input objects are not mutated',()=>{
 const p=project();p.assets=[{id:'custom',custom:true}];const before=JSON.stringify(p),n=applyResult(p,{projectId:p.id,operation:'assets'},fixtures.assets,()=> 'new');
 assert.equal(n.assets[0].id,'custom');assert.equal(JSON.stringify(p),before);
});
test('explicit multi-model consent rejects unapproved models and free-to-paid changes',()=>{
 assert.equal(budgetModelDecision(null,'text',['text','image','video']),undefined);
 assert.ok(budgetModelDecision(null,'text',[]),'Local-only media authorization must reject every model');
 assert.ok(budgetModelDecision(null,'other',['text','image','video']));assert.ok(budgetModelDecision(null,'text','text'));
 assert.equal(freeBudgetDecision({quota_type:1,model_price:0},0),undefined);assert.ok(freeBudgetDecision({quota_type:1,model_price:.00001},1));
});
test('batch branch goes directly from series bible to script, leaving premium planning independent',()=>{
 const p=project();p.kind='batch';assert.equal(nextStep(p)?.operation,'bible');p.bible={world:'x'};assert.equal(nextStep(p)?.operation,'script');
 assert.equal(nextStep(project())?.operation,'intent');
});
test('submission rejects forged identity, nonfinite and excessive budgets before database work',()=>{
 const valid={request:{projectId:'fixture',operation:'intent'},clientId:'fixture-client-00001',revision:1,points:.001};
 assert.equal(generationSubmission.safeParse(valid).success,true);
 for(const patch of [{userId:2},{model:'paid'},{points:Infinity},{points:0},{points:1001},{revision:0},{clientId:'short'}])assert.equal(generationSubmission.safeParse({...valid,...patch}).success,false);
});
test('quoting and dispatch use saved resolution and per-resolution supported durations',()=>{
 const m={defaults:{resolution:'480p'},durationResolutionMap:[{resolution:['480p'],duration:[5,10]},{resolution:['720p'],duration:[4,8]},{resolution:['1080p'],duration:[5]}]},r={projectId:'fixture',operation:'scene-video',target:'e1s1'} as const;
 assert.deepEqual(videoParameters({...project(),resolution:'720p',spec:'默认',fixedShotSec:8},m,r),{resolution:'720p',duration:8});
 assert.deepEqual(videoParameters({...project(),resolution:'480p',spec:'高清'},m,r),{resolution:'1080p',duration:5});
 assert.throws(()=>videoParameters({...project(),resolution:'720p'},m,{...r,seconds:10}));
});
test('extra frame keeps main frame and video, main replacement archives old frame and marks video stale',()=>{
 const p=applyResult(project(),{projectId:'fixture',operation:'script'},fixtures.script,()=> 'id');p.script.episodes[0].scenes[0]={...p.script.episodes[0].scenes[0],imageUrl:'old',videoUrl:'video',videoStatus:'done'};
 const r={projectId:'fixture',operation:'storyboard-image',target:'e1s1'} as const;
 const extra=applyResult(p,{...r,variant:'extra'},{url:'extra'},()=> 'id').script.episodes[0].scenes[0];
 assert.equal(extra.imageUrl,'old');assert.equal(extra.videoStatus,'done');assert.deepEqual(extra.altImages,['extra']);
 const main=applyResult(p,r,{url:'new'},()=> 'id').script.episodes[0].scenes[0];assert.equal(main.imageUrl,'new');assert.deepEqual(main.altImages,['old']);assert.equal(main.videoStatus,'stale');
});
test('only explicit pre-admission queue/model rejection is a known failure, never a timeout or post-submission failure',()=>{
 const error={config:{method:'post'},response:{status:503,data:{error:{code:'video_queue_full'}}}};
 assert.match(generationRejection(error,false)!,/队列已满/);
 assert.match(generationRejection({...error,response:{status:503,data:{error:{code:'bad_response_status_code',message:JSON.stringify({code:'video_queue_full',message:'busy'})}}}},false)!,/队列已满/);
 assert.match(generationRejection({...error,response:{status:403,data:{code:'insufficient_user_quota',message:'quota0'}}},false)!,/上游账号额度不足/);
 assert.equal(generationRejection(error,true),undefined);
 assert.equal(generationRejection({...error,config:{method:'get'}},false),undefined);
 assert.equal(generationRejection({config:{method:'post'},response:{status:503,data:{error:{code:'unknown'}}}},false),undefined);
 assert.equal(generationRejection(Error('timeout'),false),undefined);
});
test('movie composition is model-free, source-versioned, and follows optional explicit voice generation',()=>{
 assert.deepEqual(categories('render'),[]);assert.deepEqual(categories('autopilot',{autoVoice:true,models:{audio:'tts'}}),['text','image','video','audio']);
 assert.deepEqual(categories('autopilot',{videoProduction:'image-motion'}),['text','image']);assert.deepEqual(categories('motion-video'),[]);
 let p=applyResult(project(),{projectId:'fixture',operation:'script'},fixtures.script,()=> 'id');p.kind='batch';p.bible={world:'x'};p.assets=[{id:'c',imageUrl:'image'}];
 const s=p.script.episodes[0].scenes[0];Object.assign(s,{shotPrompt:'shot',imageUrl:'image',videoUrl:'video',videoStatus:'done'});
 assert.equal(nextStep(p)?.operation,'render');p.autoVoice=true;p.models.audio='tts';assert.equal(nextStep(p)?.operation,'speech');s.speechUrl='audio';
 const result={url:'movie',source:movieSignature(p)};p=applyResult(p,{projectId:p.id,operation:'render'},result,()=> 'id');assert.ok(movieCurrent(p));
 p.script.episodes[0].scenes[0].speechUrl='new';assert.equal(movieCurrent(p),false);assert.throws(()=>applyResult(p,{projectId:p.id,operation:'render'},result,()=> 'id'));
});
test('video reference selection respects provider capacity and serial chains stay within an episode',()=>{
 assert.equal(imageReferenceLimit({modelName:'agnes-image-2.5-flash'}),0);assert.equal(imageReferenceLimit({paramSchema:{images:{max_items:2}}}),2);
 const p=project();p.script={episodes:[{scenes:[{id:'a',imageUrl:'key-a',videoUrl:'clip-a',characters:['少年']},{id:'b',imageUrl:'key-b',characters:['少年']}]},{scenes:[{id:'c',imageUrl:'key-c'}]}]};p.assets=[{kind:'character',name:'少年（青衣）',imageUrl:'char'}];
 const reference={modelName:'agnes-video-2.5',paramSchema:{images:{max_items:2}}};assert.deepEqual(videoReferences(p,'b',reference).images,['key-b','char']);
 p.videoChain='serial';assert.throws(()=>videoReferences(p,'b',reference));const first={paramSchema:{input_reference:{type:'string'}}};
 assert.equal(videoInputPolicy(first).first,true);assert.equal(videoReferences(p,'b',first).previous,'clip-a');assert.deepEqual(videoReferences(p,'c',first).images,['key-c']);
 p.script.episodes[0].scenes[0].videoStatus='stale';assert.throws(()=>videoReferences(p,'b',first));
});
test('script batches retain canonical episode ids and serial regeneration invalidates descendants',()=>{
 let p=project();p.episodeCount=2;p.kind='batch';p.bible={world:'x'};
 p=applyResult(p,{projectId:p.id,operation:'script',index:0},fixtures.script,()=> 'id');assert.equal(nextStep(p)?.index,1);
 p=applyResult(p,{projectId:p.id,operation:'script',index:1},fixtures.script,()=> 'id');assert.equal(p.script.episodes[1].scenes[0].id,'e2s1');
 p.videoChain='serial';p.script.episodes[0].scenes.push({id:'e1s2',videoUrl:'old-2'});
 p=applyResult(p,{projectId:p.id,operation:'scene-video',target:'e1s1'},{url:'new-1'},()=> 'id');assert.equal(p.script.episodes[0].scenes[1].videoStatus,'stale');
});
test('outline regeneration preserves custom episode duration and scripts use that episode rather than the global default',()=>{
 const p=project();p.episodeSeconds=30;p.outline={title:'old',episodes:[{title:'第一集',synopsis:'内容',durationSec:60}]};
 const next=applyResult(p,{projectId:p.id,operation:'outline'},fixtures.outline,()=> 'id');assert.equal(next.outline.episodes[0].durationSec,60);
 const script=applyResult(next,{projectId:p.id,operation:'script',index:0},fixtures.script,()=> 'id');assert.equal(script.script.episodes[0].scenes[0].videoSeconds,60);
 script.fixedShotSec=15;assert.equal(applyResult(script,{projectId:p.id,operation:'script',index:0},fixtures.script,()=> 'id').script.episodes[0].scenes[0].videoSeconds,15);
});
test('an intentionally empty asset result never causes repeated paid extraction',()=>{
 let p=project();p.kind='batch';p.bible={world:'x'};p.script=fixtures.script;
 p=applyResult(p,{projectId:p.id,operation:'assets'},{characters:[],scenes:[],props:[]},()=> 'id');
 assert.equal(p.assets.length,0);assert.equal(p.done.assets,true);assert.equal(nextStep(p)?.operation,'shots');
});
test('explicit text-to-video has no reference uploads or automatic image calls; default still requires keyframes',()=>{
 const p=project();p.kind='batch';p.bible={world:'room'};p.done.assets=true;p.script={episodes:[{scenes:[{id:'e1s1',action:'醒来',shotPrompt:'衣着完整的成年男子在古代房间醒来'}]}]};p.assets=[{id:'c',kind:'character',name:'男子'}];
 const m={modelName:'seedance2.0-line1-fast-xoi',mode:['text','singleImage'],paramSchema:{images:{max_items:9}}};
 assert.throws(()=>videoReferences(p,'e1s1',m));assert.equal(nextStep(p)?.operation,'asset-image');
 p.videoInput='text';assert.deepEqual(videoReferences(p,'e1s1',m).images,[]);assert.equal(nextStep(p)?.operation,'scene-video');assert.deepEqual(categories('autopilot',p),['text','video']);
 assert.throws(()=>videoReferences(p,'e1s1',{...m,mode:['singleImage']}));
 p.videoChain='serial';assert.throws(()=>videoReferences(p,'e1s1',m));p.videoChain='parallel';p.videoProduction='image-motion';assert.throws(()=>videoReferences(p,'e1s1',m));assert.equal(nextStep(p)?.operation,'asset-image');assert.deepEqual(categories('autopilot',p),['text','image']);
});
