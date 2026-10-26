// Loopback-only mock service. Never proxies XOi, NewAPI or upstream requests.
import http from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../public/one-stop/",import.meta.url));
const rows=new Map(),requests=[],jobs=new Map(),clients=new Map(),histories=new Map();
const models=[
 {modelName:'fixture-text-free',name:'免费文案测试',type:'text',series:'测试',recommended:true,selectable:true,price:{yuan:0,unit:'百万 Token'},outputPrice:{yuan:0}},
 {modelName:'fixture-text-alt',name:'另一文案模型',type:'text',series:'测试',recommended:false,selectable:true,price:{yuan:1.2,unit:'百万 Token'},outputPrice:{yuan:4.5}},
 {modelName:'fixture-image-free',name:'免费图片测试',type:'image',series:'测试',recommended:true,selectable:true,price:{yuan:0,unit:'次'}},
 {modelName:'fixture-image-alt',name:'图片精细测试',type:'image',series:'测试',recommended:false,selectable:true,price:{yuan:0.39,unit:'次'}},
 {modelName:'fixture-image-unknown',name:'报价未就绪测试',type:'image',series:'测试',recommended:false,selectable:true,price:null},
 {modelName:'fixture-image-hidden',name:'不可用型号',type:'image',series:'测试',recommended:true,selectable:false,price:{yuan:0,unit:'次'}},
 {modelName:'fixture-video-free',name:'免费视频测试',type:'video',series:'测试',recommended:true,selectable:true,price:{yuan:0,unit:'秒'}},
 {modelName:'fixture-video-second',name:'按秒视频测试',type:'video',series:'测试',recommended:false,selectable:true,rates:[{resolution:'480p',yuan:0.39,unit:'秒'},{resolution:'720p',yuan:0.5,unit:'秒'}]},
 {modelName:'fixture-tts',name:'配音隔离测试',type:'audio',series:'测试',recommended:true,selectable:true,price:{yuan:0,unit:'次'},paramSchema:{voice:{enum:['alloy','nova','onyx']}}},
];
const bootstrap='<script>localStorage.setItem("token","Bearer one-stop.fixture.not-real");localStorage.setItem("userId","101");localStorage.setItem("username","界面验收");localStorage.setItem("role","user");</script>';
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,"http://127.0.0.1"),json=(status,body)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(body));};
 if(url.pathname==="/__fixture/requests")return json(200,requests);
 if(url.pathname==='/__fixture/seed'&&req.method==='POST'){
   let raw='';for await(const c of req)raw+=c;const input=JSON.parse(raw||'{}');
   const kind=input.kind==='batch'?'batch':'premium',id=`fixture-${kind}${input.active?'-active':''}${input.empty?'-empty':''}${input.missingModel?'-unconfigured':''}${input.history?'-history':''}${input.voice?'-voice':''}${input.playback?'-playback':''}`;
   const stage=input.stage||'storyboard',done=Object.fromEntries((kind==='batch'?['bible','script','assets','storyboard']:['input','intent','direction','outline','novel','script','assets','storyboard']).map(k=>[k,true]));
   const payload={id,kind,name:`${kind==='batch'?'批量剧':'精品剧'}隔离验收`,description:'仅内存，不连接真实数据库',idea:'少年寻找仙山',createdAt:Date.now(),updatedAt:Date.now(),style:'精致国漫',region:'国产剧',ratio:'16:9',spec:'默认',schedule:'渐进式',voice:'alloy',episodeCount:1,sceneCount:2,episodeSeconds:10,status:'进行中',stage,done,models:{chat:'fixture-text-free',image:'fixture-image-free',video:'fixture-video-free'},log:[],assets:[{id:'actor',kind:'character',name:'少年',description:'青衣',status:'done',imageUrl:'/brand/actor.svg'}],bible:{world:'云海',protagonists:'少年',style:'国漫',template:'悬念与反转'},intent:{audience:'青年',genre:'仙侠',tone:'成长',duration:'10秒',sellingPoints:'御剑'},directions:[{id:'d1',title:'仙山',logline:'寻找故乡',keywords:['成长']}],direction:{id:'d1',title:'仙山',logline:'寻找故乡',keywords:['成长']},outline:{title:'仙山',episodes:[{title:'启程',synopsis:'出发'}]},novel:{chapters:[{title:'启程',text:'少年站在云海前。'}]},script:{title:'仙山',synopsis:'出发',episodes:[{title:'启程',scenes:[{id:'e1s1',location:'云海山巅',time:'清晨',characters:['少年'],action:'拔剑',dialogue:'',shotPrompt:'晨光下的青衣少年',imageUrl:'/brand/frame-main.svg',altImages:['/brand/frame-alt.svg'],imageStatus:'done',videoSeconds:5},{id:'e1s2',location:'云海山巅',time:'清晨',characters:['少年'],action:'御剑',dialogue:'',shotPrompt:'少年御剑飞入云海',videoSeconds:5}]}]}};
   if(input.empty){delete payload.direction;delete payload.directions;delete payload.outline;delete payload.novel;delete payload.script;payload.assets=[];payload.done={input:true,intent:true};}
   if(input.missingModel)delete payload.models.chat;
   if(input.voice){payload.models.audio='fixture-tts';payload.autoVoice=true;payload.assets=[{...payload.assets[0],voice:'onyx'},{id:'actor-two',name:'少女',kind:'character',voice:'nova',status:'done'}];payload.script.episodes[0].scenes.forEach(s=>{s.videoUrl='/brand/fixture.mp4';s.videoStatus='done';});Object.assign(payload.script.episodes[0].scenes[0],{dialogue:'少年：你来了。\n少女：我一直在。\n云海静静翻涌。',speechUrl:'/brand/voice.mp3',speechStatus:'done',speechSource:'old-voice-signature',speechParts:[{key:'saved-part',url:'/brand/part.mp3'}]});}
   if(input.playback)payload.script.episodes[0].scenes.forEach(s=>{if(s.speechUrl)s.speechSource=JSON.stringify([payload.models.audio,payload.voice,s.dialogue,payload.assets.filter(a=>a.kind==='character').map(a=>[a.name,a.voice])]);});
   rows.set('comic:'+id,{id,revision:1,updatedAt:Date.now(),payload});
   if(input.history){rows.get('comic:'+id).revision=2;histories.set(id,[{revision:1,operation:'outline',sourceOperation:'outline',stage:'outline',createdAt:Date.now()-60000,value:{title:'历史大纲·云海初见',episodes:[{title:'旧标题',synopsis:'旧内容'}]}}]);}
   if(input.active)jobs.set('fixture-active-'+id,{id:'fixture-active-'+id,projectId:id,status:'running',operation:'storyboard-images',label:'模拟后台任务',steps:[]});
   return json(200,{id});
 }
 if(url.pathname==="/__fixture/mobile"){const project=url.searchParams.get('project');const route=project&&/^fixture-[a-z-]+$/.test(project)?'/comic/'+project:'/comic';res.writeHead(200,{"Content-Type":"text/html"});return res.end('<iframe style="width:390px;height:1100px;border:0;transform:scale(.45);transform-origin:top left" src="/one-stop/#'+route+'"></iframe>');}
 if(url.pathname==="/__fixture/desktop"){res.writeHead(200,{"Content-Type":"text/html"});return res.end('<iframe style="width:1440px;height:1100px;border:0;transform:scale(.45);transform-origin:top left" src="/one-stop/#/comic"></iframe>');}
 if(url.pathname==="/__fixture/embedded"){res.writeHead(200,{"Content-Type":"text/html"});return res.end('<iframe style="width:1200px;height:1000px;border:0;transform:scale(.45);transform-origin:top left" src="/one-stop/?embed=1#/comic"></iframe>');}
 if(url.pathname.startsWith("/api/")){
   requests.push({method:req.method,path:url.pathname});
   if(req.headers.authorization!=="Bearer one-stop.fixture.not-real")return json(401,{success:false,message:"fixture auth required"});
   if(url.pathname==="/api/login/self")return json(200,{success:true,data:{id:101,username:"界面验收",role:1,quota:0}});
   if(url.pathname==="/api/model-catalog")return json(200,{success:true,data:models});
   if(url.pathname.startsWith('/api/one-stop/generation/')){
     const tail=url.pathname.slice('/api/one-stop/generation/'.length);let input={};
     if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;input=JSON.parse(raw||'{}');requests[requests.length-1].body=input;}
     if(tail==='capabilities')return json(200,{success:true,data:{enabled:true}});
     if(tail==='jobs'&&req.method==='GET')return json(200,{success:true,data:[...jobs.values()].filter(j=>j.projectId===url.searchParams.get('projectId')).reverse()});
     if(tail==='quote'){
       const row=rows.get('comic:'+input.projectId);if(!row)return json(404,{success:false,message:'fixture project missing'});
       const model=models.find(m=>m.modelName===row.payload.models.chat),free=model?.price?.yuan===0;
       return json(200,{success:true,data:{request:input,automatic:process.env.ONE_STOP_FIXTURE_AUTOMATIC==='1',revision:row.revision,label:'分析创作意图',quotes:[{model:model.modelName,name:model.name,kind:'text',points:free?0:1.2,yuan:free?0:.12}],free,defaultPoints:free?.001:10,maxCalls:20,minutes:30,note:'fixture预算：到顶停止，保留结果'}});
     }
     if(tail==='jobs'&&req.method==='POST'){
       if(clients.has(input.clientId))return json(200,{success:true,data:{id:clients.get(input.clientId),reused:true}});
       const row=rows.get('comic:'+input.request.projectId);if(!row||row.revision!==input.revision)return json(409,{success:false,message:'fixture revision conflict'});
       const id='fixture-job-'+(jobs.size+1),job={id,projectId:input.request.projectId,status:'running',operation:input.request.operation,label:'分析创作意图',steps:[],limitPoints:input.points,billingId:'fixture-not-a-real-budget'};jobs.set(id,job);clients.set(input.clientId,id);
       const unknown=row.payload.fixtureUnknown===true||String(req.headers.referer).includes('fixtureUnknown=1');
       setTimeout(()=>{if(job.status!=='running')return;if(unknown){job.status='unknown';job.error='模拟网络中断：结果待核对，不自动重发';return;}job.result={audience:'跨设备模拟受众',genre:'仙侠',tone:'成长',duration:'1分钟',sellingPoints:'御剑'};row.payload={...row.payload,intent:job.result};row.revision++;row.updatedAt=Date.now();job.steps=[{operation:'intent'}];job.status='succeeded';},500);
       return json(200,{success:true,data:{id,billingId:job.billingId}});
     }
     const match=/^jobs\/([^/]+)(?:\/(receipt|stop|acknowledge))?$/.exec(tail),job=match&&jobs.get(match[1]);
     if(job){if(match[2]==='receipt')return json(200,{success:true,data:{receipt:{points:0,quota:0,entries:[]},budget:{state:'stopped'}}});if(match[2]==='stop')job.status='cancelled';if(match[2]==='acknowledge')job.status='failed';return json(200,{success:true,data:job});}
     return json(405,{success:false,message:'fixture blocks unsupported generation action'});
   }
   if(!url.pathname.startsWith("/api/one-stop/documents"))return json(405,{success:false,message:"fixture blocks model/payment/unknown APIs"});
   const historyMatch=/^\/api\/one-stop\/documents\/([^/]+)\/history(?:\/(\d+)(\/restore)?)?$/.exec(url.pathname);
   if(historyMatch){
     const [,id,version,restore]=historyMatch,row=rows.get('comic:'+id),list=histories.get(id)||[];if(!row)return json(404,{success:false,message:'fixture project missing'});
     if(req.method==='GET'){if(!version)return json(200,{success:true,data:{items:[...list].reverse().map(({value,...item})=>item),page:1,hasMore:false}});const entry=list.find(x=>x.revision===Number(version));return entry?json(200,{success:true,data:entry}):json(404,{success:false,message:'fixture version missing'});}
     if(req.method==='POST'&&restore){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);requests[requests.length-1].body=body;
       if(clients.has(body.clientId))return json(200,{success:true,data:{restored:true}});
       if(row.revision!==body.revision||[...jobs.values()].some(j=>j.projectId===id&&['running','unknown'].includes(j.status)))return json(409,{success:false,message:'fixture revision or task conflict'});
       const entry=list.find(x=>x.revision===Number(version));if(!entry)return json(404,{success:false,message:'fixture version missing'});
       list.push({revision:row.revision,operation:'restore',sourceOperation:'outline',stage:'outline',createdAt:Date.now(),value:structuredClone(row.payload.outline)});row.payload={...row.payload,outline:structuredClone(entry.value),stage:'outline',status:'进行中',done:{...row.payload.done,outline:false,script:false,video:false}};row.revision++;row.updatedAt=Date.now();clients.set(body.clientId,true);histories.set(id,list);return json(200,{success:true,data:{restored:true}});
     }
     return json(405,{success:false});
   }
   const id=url.pathname.split("/")[4];let body={};if(req.method!=="GET"){let raw="";for await(const c of req)raw+=c;try{body=JSON.parse(raw);}catch{return json(400,{success:false});}}
   const collection=url.searchParams.get("collection")||body.collection,key=collection+":"+id;
   if(req.method==="GET"&&!id){const found=[...rows.entries()].filter(([k,r])=>k.startsWith(collection+":")&&!r.deleted).map(([,r])=>r);return json(200,{success:true,data:{items:found,page:1,pageSize:20,hasMore:false}});}
   if(req.method==="GET"){const r=rows.get(key);return r&&!r.deleted?json(200,{success:true,data:r}):json(404,{success:false,message:"文档不存在或已删除"});}
   const old=rows.get(key);
   if((old?.revision??0)!==body.revision||old?.deleted)return json(409,{success:false,message:"文档版本已变化，请刷新后核对"});
   if(req.method==="PUT"){
     if(String(req.headers.referer).includes("fixtureSaveFailure=1"))return json(503,{success:false,message:"模拟保存结果待核对"});
     const row={id,revision:body.revision+1,updatedAt:Date.now(),payload:body.payload};rows.set(key,row);return json(200,{success:true,data:row});
   }
   if(req.method==="DELETE"){rows.set(key,{...old,deleted:true,revision:body.revision+1});return json(200,{success:true,data:{deleted:true}});}
   return json(405,{success:false});
 }
 if(req.method!=="GET")return json(405,{success:false});
 const mediaFiles={'/brand/fixture.mp4':'video.mp4','/brand/voice.mp3':'voice.mp3','/brand/part.mp3':'voice.mp3'};
 if(process.env.ONE_STOP_FIXTURE_MEDIA_DIR&&mediaFiles[url.pathname]){
   const content=await readFile(resolve(process.env.ONE_STOP_FIXTURE_MEDIA_DIR,mediaFiles[url.pathname])),total=content.length,range=/^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range||''));
   const headers={'Content-Type':url.pathname.endsWith('.mp4')?'video/mp4':'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'no-store'};
   if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),total-1):total-1;if(start>=total||end<start){res.writeHead(416,{'Content-Range':`bytes */${total}`});return res.end();}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${total}`,'Content-Length':end-start+1});return res.end(content.subarray(start,end+1));}
   res.writeHead(200,{...headers,'Content-Length':total});return res.end(content);
 }
 if(url.pathname.startsWith("/brand/")){res.writeHead(200,{"Content-Type":"image/svg+xml"});return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="12" fill="#fff0e5"/><text x="7" y="30" fill="#c55d30">XOi</text></svg>');}
 let relative=url.pathname.replace(/^\/one-stop\/?/,"");if(!relative)relative="index.html";
 const file=resolve(root,relative);if(!file.startsWith(resolve(root)+"/"))return json(403,{});
 try{let content=await readFile(file);if(relative==="index.html")content=Buffer.from(content.toString().replace("<head>","<head>"+bootstrap));res.writeHead(200,{"Content-Type":({".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".webp":"image/webp",".mp4":"video/mp4",".svg":"image/svg+xml"})[extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(content);}catch{return json(404,{success:false});}
});
server.listen(0,"127.0.0.1",()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,fixtureOnly:true})));
