/** Explicit human-authorized paid acceptance: exactly three safe 5s Fast clips, <= ¥20 planned ceiling.
 * Never retries a generation, switches a model, changes upstream keys/quotas, or replays on restart.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {boundGatewayRequest} from '../src/utils/billingBudgetPolicy';
const model='seedance2.0-line1-fast-xoi';
const db=new pg.Client({connectionString:process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL,connectionTimeoutMillis:5000});
const prefix='中国古装悬疑电影，宋代，写实电影质感，所有人物均为成年人，衣着完整端庄，非色情。固定人物设定：西门庆，28岁中国男子，束发，墨蓝色交领长袍，干净脸庞；潘金莲，26岁中国女子，发髻，米白色高领内衫外罩淡藕粉长袖褙子。固定场景：同一间宋代朴素木质卧室，雕花窗在画面左侧，米色纱幔，木床在右侧，后方木门，柔和清晨侧光，低饱和琥珀色与青灰色，35mm电影镜头，自然表演。画幅16:9，单镜头5秒。';
const shots=[
 {title:'陌生清晨',action:'西门庆在陌生房间醒来，发现身处古代。',dialogue:'',camera:'缓慢推近',shotSize:'中景',videoPrompt:prefix+'单一连续镜头：镜头从雕花窗和晨光缓慢平移到床边，衣着完整的西门庆侧坐在床沿，睁眼看向窗户，再低头看自己的古代衣袖，神情从困惑变为警觉。潘金莲衣着完整站在远处桌旁，不靠近床。衣服自然垂落，动作克制，建立穿越悬疑。只有环境声，不加字幕，无文字无水印，无裸露，不出现亲密身体接触。'},
 {title:'西门大官人',action:'金莲叫出西门大官人的称呼，男子看向铜镜，震惊自己变成了西门庆。',dialogue:'潘金莲：西门大官人，你怎么了？',camera:'缓慢横移',shotSize:'中近景',videoPrompt:prefix+'单一连续镜头：两人保持一米以上距离，衣着完整的潘金莲站在木桌旁，带疑惑神情轻声问“西门大官人，你怎么了？”。镜头缓慢横移至西门庆，他猛然抬眼，神情震惊，再看向桌上铜镜，轻轻抬手摸自己的脸，意识到身份变化。镜中只有同一个人的自然倒影，不增添人物。对白简短自然，安静悬疑氛围，人物不亲密接触，不加字幕，无文字无水印，无裸露。'},
 {title:'门外来人',action:'急促敲门声打断思绪，王婆在门外低声喊话，两人警觉地看向木门。',dialogue:'王婆（门外）：金莲，是我，快开门！',camera:'缓慢拉远',shotSize:'双人中景',videoPrompt:prefix+'单一连续镜头：西门庆与潘金莲衣着完整分站木桌两侧，后方木门突然响起三下急促敲门声。门外一位年长成年女人的声音压低说“金莲，是我，快开门！”，门保持关闭，不出现门外人物。两人同时转头看向木门，潘金莲收起笑容，西门庆挺直背脊，镜头缓慢拉远，停在两人警觉的目光和紧闭的木门，形成悬念。环境声自然，无配乐，无字幕，无文字无水印，无裸露、无暴力、无亲密身体接触。'},
];
async function main(){
 assert.equal(process.env.XOI_RUN_PAID_SEEDANCE,'CONFIRMED_20_YUAN_3_SAFE_CLIPS','Paid test requires explicit opt-in');
 for(const address of [process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL,process.env.NEWAPI_BASE_URL||'http://127.0.0.1:3000'])assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(address!).hostname));
 await db.connect();
 const user=(await db.query('SELECT session_version FROM o_user WHERE id=1')).rows[0];
 const secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',['tokenKey'])).rows[0].value;
 const authorization='Bearer '+jwt.sign({id:1,session_version:Number(user.session_version||0)},secret,{expiresIn:7200,algorithm:'HS256'});
 async function api(path:string,method='GET',body?:unknown){const response=await fetch('http://localhost:12121/api'+path,{method,headers:{authorization,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});const j=await response.json() as any;if(!response.ok||j.success===false)throw Error(`${method} ${path}: HTTP${response.status}: ${j.message||'request failed'}`);return j.data;}
 const catalog=await api('/model-catalog'), selected=catalog.find((m:any)=>m.modelName===model);assert.ok(selected?.mode.includes('text'));
 const pricing=await fetch('http://localhost:3000/api/pricing').then(r=>r.json()) as any,price=pricing.data.find((m:any)=>m.model_name===model);assert.ok(price?.billing_expr && !/upstream_cost/.test(price.billing_expr));
 const factor=Number(pricing.group_ratio.default);assert.equal(factor,1);
 const bound=boundGatewayRequest('/v1/videos',{model,seconds:5,resolution:'480p',aspect_ratio:'16:9'},price,factor).quota/500000;
 assert.ok(bound>0 && bound*3<=20,'Worst local pricing branches must fit all three clips');
 const pointsPerJob=66.666;assert.ok(pointsPerJob*3<=200 && bound*10<pointsPerJob);
 const resume=process.env.XOI_RESUME_PAID_SEEDANCE;
 const id=resume||crypto.randomUUID();
 const p={id,name:'[验收]宋室惊梦 · Seedance Fast 三镜',idea:'古装悬疑非露骨改编：衣着完整的成年男子在宋代卧室醒来，金莲叫他西门大官人，他看向铜镜发现身份变化，门外王婆急促敲门。',description:'经用户确认的非露骨古装悬疑版；2026-10-21最多三个收费Fast镜头，总上限20元，不自动重试，不切型号。',kind:'batch',style:'古装悬疑电影 · 晨光写实',ratio:'16:9',region:'国产剧 · 中文',episodeCount:1,episodeSeconds:15,fixedShotSec:5,resolution:'480p',spec:'默认',schedule:'渐进式',voice:'alloy',models:{chat:'agnes-2.5-flash',image:'agnes-image-2.5-flash',video:model},videoInput:'text',videoProduction:'ai',videoChain:'parallel',autoVoice:false,assets:[],bible:{world:'宋代室内，衣着完整的成年人，非露骨古装悬疑。'},done:{input:true,script:true,assets:true,storyboard:true},log:[],stage:'video',status:'进行中',createdAt:Date.now(),acceptance:{budgetYuan:20,maxVideoCalls:3,model,seconds:5,resolution:'480p',retries:false,upstreamQuotaChanges:false},script:{title:'宋室惊梦',synopsis:'陌生清晨，一句称呼改变身份，门外敲门打断思绪。',episodes:[{title:'不速之客',scenes:shots.map((s,i)=>({...s,id:`e1s${i+1}`,location:'武大郎家卧室',time:'日 内',characters:['西门庆','潘金莲'],shotPrompt:s.videoPrompt,videoSeconds:5}))}]}};
 if(resume){
  const existing=await api('/one-stop/documents/'+id+'?collection=comic');assert.equal(existing.payload.acceptance?.budgetYuan,20);assert.equal(existing.payload.models.video,model);assert.equal(existing.payload.videoInput,'text');assert.deepEqual(existing.payload.script.episodes,p.script.episodes);assert.ok(existing.payload.description.includes('经用户确认的非露骨'));
 }else await api('/one-stop/documents/'+id,'PUT',{collection:'comic',revision:0,title:p.name,payload:p});
 console.log(JSON.stringify({phase:'created',projectId:id,model,budgetYuan:20,maxVideoCalls:3,worstLocalTotalYuan:bound*3,publicLink:`http://localhost:12121/#/script/one-stop?page=/comic/${id}`}));
 const receipts:any[]=[];let submitted=0;
 async function wait(job:any,operation:string){let last='';for(let i=0;i<450;i++){const t=await api('/one-stop/generation/jobs/'+job.id);const key=JSON.stringify([t.status,t.current,t.upstreamId]);if(key!==last||i%6===0){console.log(JSON.stringify({phase:'waiting',operation,taskId:job.id,status:t.status,current:t.current,upstreamId:t.upstreamId||null,elapsedSeconds:i*6}));last=key;}if(!['queued','running'].includes(t.status)){assert.equal(t.status,'succeeded',`${operation}: ${t.status}; ${t.error||''}; not retried`);return t;}await new Promise(r=>setTimeout(r,6000));}throw Error('Original task still running; left intact, not retried');}
 for(let i=0;i<3;i++){
  assert.ok(submitted<3);const request={projectId:id,operation:'scene-video',target:`e1s${i+1}`,seconds:5};const q=await api('/one-stop/generation/quote','POST',request);assert.equal(q.quotes.length,1);assert.equal(q.quotes[0].model,model);assert.ok(q.quotes[0].yuan>0&&q.quotes[0].yuan<=bound+1e-6);
  const already=receipts.reduce((n,r)=>n+r.points/10,0);assert.ok(already+(3-i)*bound<=20);
  console.log(JSON.stringify({phase:'quoted',shot:i+1,quoteYuan:q.quotes[0].yuan,quotePoints:q.quotes[0].points}));
  const job=await api('/one-stop/generation/jobs','POST',{request,revision:q.revision,points:pointsPerJob,automatic:false,clientId:crypto.randomUUID()});submitted++;
  console.log(JSON.stringify({phase:'submitted',shot:i+1,taskId:job.id,billingId:job.billingId,submittedVideoCalls:submitted}));
  const t=await wait(job,'scene-video');let receipt:any;for(let attempt=0;attempt<10;attempt++){receipt=(await api('/one-stop/generation/jobs/'+job.id+'/receipt')).receipt;if(receipt.status==='recorded')break;await new Promise(r=>setTimeout(r,2000));}
  assert.equal(receipt.status,'recorded','Receipt missing; no further paid requests');assert.ok(receipt.points>=0&&receipt.points<=pointsPerJob);receipts.push({taskId:job.id,points:receipt.points,url:t.result.url});
  const budget=(await db.query('SELECT calls,automatic,allowed_models FROM xoi_model_budgets WHERE user_id=1 AND billing_id=$1',[job.billingId])).rows[0];assert.ok(budget.calls<=1);assert.equal(budget.automatic,false);assert.deepEqual(budget.allowed_models,[model]);assert.ok(receipt.entries.every((e:any)=>e.model===model));
  const media=await fetch('http://localhost:12121'+t.result.url,{signal:AbortSignal.timeout(30000)});assert.equal(media.status,200);const bytes=Buffer.from(await media.arrayBuffer());assert.ok(bytes.length>1000&&bytes.subarray(0,100).includes(Buffer.from('ftyp')));
  console.log(JSON.stringify({phase:'clip-complete',shot:i+1,...receipts.at(-1),bytes:bytes.length,totalYuan:receipts.reduce((n,r)=>n+r.points/10,0)}));
 }
 const request={projectId:id,operation:'render'},q=await api('/one-stop/generation/quote','POST',request);assert.deepEqual(q.quotes,[]);
 const job=await api('/one-stop/generation/jobs','POST',{request,revision:q.revision,points:.001,automatic:true,clientId:crypto.randomUUID()});await wait(job,'render');
 const row=await api('/one-stop/documents/'+id+'?collection=comic');assert.ok(row.payload.finalMovie?.url);assert.equal(row.payload.status,'已完成');assert.equal(row.payload.script.episodes[0].scenes.filter((s:any)=>s.videoSource==='ai'&&s.videoUrl).length,3);
 console.log(JSON.stringify({phase:'passed',projectId:id,videoCalls:submitted,model,totalYuan:receipts.reduce((n,r)=>n+r.points/10,0),limitYuan:20,receipts,movie:row.payload.finalMovie,serverRestore:true,projectRetained:true}));
}
void main().catch(e=>{console.error(JSON.stringify({phase:'stopped',error:e.message,noAutomaticRetry:true}));process.exitCode=1;}).finally(()=>db.end());
