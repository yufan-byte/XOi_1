import {getAssistantAiConfig} from "@/utils/aiAssistant/modelConfig";
import {listDirectorSkills} from "@/utils/director/skillRegistry";
import {planDirector} from "@/utils/director/planner";
import {composeDirector} from "@/utils/director/composer";
import {createDirectorRouter} from "@/utils/director/router";
import {trackedGatewayFetch} from "@/lib/gateway/receipts";
import {stopCurrentBudget} from "@/lib/gateway/budgets";
import {createSceneVision} from "@/utils/director/sceneVision";
import {db} from "@/utils/db";
import {WorkspaceDocuments} from "@/lib/workspace/documents";
import {DurableTasks} from "@/lib/workspace/tasks";
import {mediaQueue,registerMediaHandler} from "@/lib/workspace/mediaQueueRuntime";
import {getGatewayRequestContext} from "@/lib/gateway/context";
import {getUserCatalog} from "@/lib/model-catalog";
import {validateReferenceImages} from "@/utils/aiAssistant/videoAnalysis";
import OSS from "@/utils/oss";
import {sceneModels,sceneMediaOrigin} from "@/utils/director/sceneModels";
import {signedProviderMedia} from "@/utils/privateMediaRuntime";
import {quotaToPoints} from "@/utils/creditUnits";

const tasks=new DurableTasks<any>(db,'director-scene');
const sceneVision=createSceneVision({
  queue:mediaQueue,tasks,getDocument:(user,id)=>new WorkspaceDocuments(db).get(user,'director',id),
  findClientTask:async(user,id)=>(await db('xoi_media_queue').where({user_id:user,kind:'director-scene'}).where('client_id','like',`${id}#%`).first('task_id'))?.task_id,
  listTasks:async(user,scene,shot,before)=>{
    const query=db('xoi_generation_tasks').where({user_id:user,kind:'director-scene'}).whereRaw("payload::jsonb #>> '{scope,sceneId}' = ?",[scene]).whereRaw("payload::jsonb #>> '{scope,shotId}' = ?",[shot]);
    if(before)query.andWhere('id','<',before);
    const rows=await query.orderBy('id','desc').limit(21).select('id','task_id','status','updated_at','payload');
    return {items:rows.slice(0,20).map(r=>({id:r.task_id,status:r.status,createdAt:Number(JSON.parse(r.payload).queuedAt||r.updated_at)})),hasMore:rows.length>20,nextCursor:rows.length>20?Number(rows[19].id):null};
  },
  getModels:async user=>sceneModels((await getUserCatalog(user)).models,sceneMediaOrigin()),
  getReceipt:async(user,billingId,status)=>{
    if(!/^[a-f0-9-]{36}$/.test(billingId))return {status:'pending',points:null};
    const rows=await db('logs as l').join('xoi_billing_links as b',function(){this.on('l.request_id','=','b.request_id').andOn('l.user_id','=','b.user_id');}).where({'b.user_id':user,'b.billing_id':billingId}).whereIn('l.type',[2,5]).select('l.type','l.quota');
    const charges=rows.filter(r=>Number(r.type)===2);
    if(charges.length)return {status:'recorded',points:quotaToPoints(charges.reduce((sum,r)=>sum+Number(r.quota),0))};
    if(status==='failed'&&rows.length&&rows.every(r=>Number(r.type)===5&&Number(r.quota)===0))return {status:'not_charged',points:0};
    return {status:'pending',points:null};
  },
  getProviderImage:async(url,user)=>{
    if(!new RegExp(`^/oss/canvas-files/${user}/[a-f0-9]{32}\\.(?:jpe?g|png)$`).test(url))throw Object.assign(new Error('图片不属于当前账号'),{status:403});
    const origin=sceneMediaOrigin();if(!origin)throw Object.assign(new Error('此识图线路需要公网素材域名，尚未配置；未提交收费请求'),{status:400});
    return origin+await signedProviderMedia(url);
  },
  getImage:async(url,user)=>{
    if(!new RegExp(`^/oss/canvas-files/${user}/[a-f0-9]{32}\\.(?:jpe?g|png)$`).test(url))throw Object.assign(new Error('参考图不属于当前账号或格式无效'),{status:403});
    const image=await OSS.getImageBase64(url.slice('/oss/'.length));return (await validateReferenceImages([{name:'场景参考图',dataUrl:image}]))[0].dataUrl;
  },
  getConfig:(user,model)=>getAssistantAiConfig(user,model),billingId:()=>getGatewayRequestContext()?.billingId||'',fetcher:trackedGatewayFetch,signal:()=>getGatewayRequestContext()?.mediaQueue?.signal,
});
registerMediaHandler('director-scene',sceneVision.execute);
const router=createDirectorRouter({getConfig:getAssistantAiConfig,getSkills:listDirectorSkills,plan:planDirector,compose:composeDirector,fetcher:trackedGatewayFetch,finishBudget:stopCurrentBudget});
router.use(sceneVision.router);
export default router;
