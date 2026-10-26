/** Opt-in real local Agnes-only idea -> persisted MP4. No paid fallback/pricing edits. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
async function main(){
 assert.equal(process.env.XOI_RUN_FREE_ONE_STOP_SMOKE,'1');
 const url=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url!).hostname));
 const db=new pg.Client({connectionString:url});await db.connect();
 try{
  const user=(await db.query('SELECT session_version FROM o_user WHERE id=1')).rows[0],secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',['tokenKey'])).rows[0].value;
  const authorization='Bearer '+jwt.sign({id:1,session_version:Number(user.session_version||0)},secret,{expiresIn:3600});
  const api=async(route:string,body?:unknown,method=body===undefined?'GET':'POST')=>{const r=await fetch('http://localhost:12121/api'+route,{method,headers:{authorization,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});const value=await r.json() as any;assert.ok(r.ok,value.message);return value.data;};
  const models={chat:'agnes-2.5-flash',image:'agnes-image-2.5-flash',video:'agnes-video-2.5-flash'},catalog=await api('/model-catalog');
  for(const name of Object.values(models))assert.ok(catalog.some((m:any)=>m.modelName===name&&m.price?.yuan===0),'Required Agnes model is not explicitly free; abort without dispatch');
  const id=crypto.randomUUID(),p={id,name:'[验收]仙山晨光·Agnes一键成片',description:'从故事到MP4的真实免费渠道验收，不使用收费型号',idea:'极简5秒仙侠短片，只有一位青衣少年，一个云海山巅场景，没有道具和对白。两个简单镜头：少年望向晨光，随后衣袂随风。请保持人物外观一致，克制运镜，禁止增加其他人物。',kind:'batch',style:'精致国漫',ratio:'16:9',region:'国产剧 · 中文',episodeCount:1,episodeSeconds:5,spec:'默认',schedule:'自动托管',voice:'alloy',videoChain:'parallel',autoVoice:false,models,assets:[],done:{},log:[],stage:'bible',status:'进行中',createdAt:Date.now()};
  const projectId=process.env.XOI_RESUME_FREE_PROJECT_ID||id;
  if(projectId===id)await api('/one-stop/documents/'+id,{collection:'comic',revision:0,title:p.name,payload:p},'PUT');
  else {
   const row=await api('/one-stop/documents/'+projectId+'?collection=comic');assert.equal(row.payload.description,p.description);assert.deepEqual(row.payload.models,models);
   const knownFixture=process.env.XOI_ACK_FREE_FIXTURE;
   if(knownFixture){const task=await api('/one-stop/generation/jobs/'+knownFixture);assert.equal(task.projectId,projectId);assert.equal(task.status,'unknown');assert.ok(['storyboard-image','scene-video'].includes(task.pendingStep?.operation));assert.ok(!task.upstreamId);const receipt=await api('/one-stop/generation/jobs/'+knownFixture+'/receipt');assert.equal(receipt.receipt.points,0);await api('/one-stop/generation/jobs/'+knownFixture+'/acknowledge',{confirmed:true});}
   if(process.env.XOI_FREE_MOTION==='1')await api('/one-stop/documents/'+projectId,{collection:'comic',revision:row.revision,title:row.payload.name,payload:{...row.payload,videoProduction:'image-motion'}},'PUT');
  }
  const request={projectId,operation:'autopilot'},q=await api('/one-stop/generation/quote',request);assert.equal(q.free,true);assert.ok(q.quotes.every((x:any)=>x.points===0&&Object.values(models).includes(x.model)));
  const job=await api('/one-stop/generation/jobs',{request,revision:q.revision,points:.001,automatic:true,clientId:crypto.randomUUID()});
  console.log(JSON.stringify({phase:'submitted',projectId,taskId:job.id,freeOnly:true,paidRequests:0}));let last='';
  for(let i=0;i<540;i++){
   const task=await api('/one-stop/generation/jobs/'+job.id),state=JSON.stringify({status:task.status,current:task.current,saved:task.steps?.length||0,hasUpstreamId:!!task.upstreamId});if(state!==last){last=state;console.log(state);}
   if(['failed','unknown','cancelled'].includes(task.status))throw Error(`Free autopilot incomplete: ${task.error}; project ${projectId} retained, no automatic paid fallback`);
   if(task.status==='succeeded'){
    const row=await api('/one-stop/documents/'+projectId+'?collection=comic');assert.ok(row.payload.finalMovie?.url);assert.equal(row.payload.status,'已完成');
    const media=await fetch('http://localhost:12121'+row.payload.finalMovie.url);assert.equal(media.status,200);assert.match(media.headers.get('content-type')||'',/video\/mp4/);await media.arrayBuffer();
    const receipt=await api('/one-stop/generation/jobs/'+job.id+'/receipt');assert.equal(receipt.receipt.points,0);
    console.log(JSON.stringify({passed:true,projectId,taskId:job.id,movie:row.payload.finalMovie.url,steps:task.steps.length,actualPoints:receipt.receipt.points,receiptStatus:receipt.receipt.status,paidRequests:0}));return;
   }
   await new Promise(r=>setTimeout(r,5000));
  }
  throw Error('Free workflow still running; retained on server, no repeated generation submitted');
 }finally{await db.end();}
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
