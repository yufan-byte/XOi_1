/** Explicit local verification: real encoder and DB task, ZERO model requests. Test work is retained. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import path from 'node:path';
import {mediaCommand} from '../src/lib/oneStop/mediaProduction';
async function main(){
 assert.equal(process.env.XOI_RUN_LOCAL_RENDER_SMOKE,'1');const url=process.env.NEWAPI_DATABASE_URL||process.env.NEWAPI_PG_URL;assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url!).hostname));
 const db=new pg.Client({connectionString:url});await db.connect();
 try{
  const user=(await db.query('SELECT session_version FROM o_user WHERE id=1')).rows[0],secret=(await db.query('SELECT value FROM o_setting WHERE key=$1',['tokenKey'])).rows[0].value;
  const authorization='Bearer '+jwt.sign({id:1,session_version:Number(user.session_version||0)},secret,{expiresIn:600});
  const api=async(route:string,body?:unknown,method=body===undefined?'GET':'POST')=>{const r=await fetch('http://localhost:12121/api'+route,{method,headers:{authorization,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});const value=await r.json() as any;assert.ok(r.ok,value.message);return value.data;};
  const folder=path.resolve('data/oss/one-stop/1');await fs.mkdir(folder,{recursive:true});const ids=[crypto.randomUUID(),crypto.randomUUID()];
  if(!process.env.XOI_VERIFY_EXISTING_PROJECT)for(let i=0;i<2;i++)await mediaCommand('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i',`color=c=${i?'blue':'red'}:s=320x180:r=24:d=1`,'-c:v','libx264','-pix_fmt','yuv420p',path.join(folder,ids[i]+'.mp4')]);
  const id=crypto.randomUUID(),p={id,name:'[验收]服务器MP4合成与跨设备恢复',description:'合成器验收片，不是AI模型生成，无收费请求',idea:'两段镜头组成服务器保存的MP4验收片',kind:'batch',style:'精致国漫',ratio:'16:9',region:'国产剧 · 中文',episodeCount:1,assets:[],done:{},log:[],models:{},stage:'video',status:'进行中',createdAt:Date.now(),script:{title:'合成验收',episodes:[{title:'验收',scenes:ids.map((v,i)=>({id:`e1s${i+1}`,location:'验收',time:'白天',characters:[],dialogue:'',action:'合成验证',videoUrl:`/oss/one-stop/1/${v}.mp4`,videoStatus:'done'}))}]}};
  const projectId=process.env.XOI_VERIFY_EXISTING_PROJECT||id;
  if(projectId===id)await api('/one-stop/documents/'+id,{collection:'comic',revision:0,title:p.name,payload:p},'PUT');
  else{const row=await api('/one-stop/documents/'+projectId+'?collection=comic');assert.match(row.payload.description,/真实免费渠道验收|合成器验收片/);}
  const request={projectId,operation:'render'},q=await api('/one-stop/generation/quote',request);assert.equal(q.free,true);assert.deepEqual(q.quotes,[]);
  const job=await api('/one-stop/generation/jobs',{request,revision:q.revision,points:.001,automatic:true,clientId:crypto.randomUUID()});
  let final:any;
  for(let i=0;i<60;i++){final=await api('/one-stop/generation/jobs/'+job.id);if(['succeeded','failed','unknown','cancelled'].includes(final.status))break;await new Promise(r=>setTimeout(r,500));}
  assert.equal(final.status,'succeeded',final.error);const first=await api('/one-stop/documents/'+projectId+'?collection=comic'),second=await api('/one-stop/documents/'+projectId+'?collection=comic');assert.equal(first.payload.status,'已完成');assert.equal(first.payload.finalMovie.url,second.payload.finalMovie.url);assert.equal(first.payload.done.assets,true);assert.equal(first.payload.done.storyboard,true);
  const media=await fetch('http://localhost:12121'+first.payload.finalMovie.url);assert.equal(media.status,200);assert.match(media.headers.get('content-type')||'',/video\/mp4/);await media.arrayBuffer();
  const billing=(await db.query('SELECT calls,allowed_models FROM xoi_model_budgets WHERE user_id=1 AND billing_id=$1',[final.billingId])).rows[0];assert.equal(billing.calls,0);assert.deepEqual(billing.allowed_models,[]);
  console.log(JSON.stringify({passed:true,projectId,projectUrl:`http://localhost:12121/#/script/one-stop?page=/comic/${projectId}`,taskId:job.id,movie:first.payload.finalMovie.url,serverSaved:true,newReadRestoresMovie:true,modelRequests:0,paidRequests:0}));
 }finally{await db.end();}
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
