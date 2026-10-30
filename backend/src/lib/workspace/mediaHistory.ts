import express from "express";
import type {Knex} from "knex";
import {withSecuritySchemaLock} from "../../utils/securitySchema";
import {MEDIA_HISTORY_POLICY} from "../../../../shared/mediaHistoryPolicy";

export const MEDIA_HISTORY_KINDS=["image","video","audio"] as const;
const fail=(message:string,status=400)=>Object.assign(new Error(message),{status});
const text=(v:unknown,max=2000)=>typeof v==="string"?v.slice(0,max):"";
const mediaUrl=(v:unknown)=>typeof v==="string"&&v.length<4096&&/^\/oss\//.test(v)?v:undefined;
export function historyMetadata(kind:string,body:Record<string,any>) {
  const params=kind==="image"?{ratio:body.aspect_ratio,res:body.resolution,negative:body.negative_prompt}:kind==="video"?{ratio:body.aspect_ratio,res:body.resolution,seconds:String(body.duration??"")}:{voice:body.voice,speed:String(body.speed??""),format:body.response_format};
  const refs=(kind==="image"?body.reference_images:body.images)||[];
  const safeRefs=Array.isArray(refs)?refs.map((r:any)=>mediaUrl(typeof r==="string"?r:r?.url??r?.base64)).filter(Boolean):[];
  const imageModes:Record<string,string>={"text-to-image":"t2i","image-edit":"edit","multi-reference":"fusion"};
  return {prompt:text(body.prompt??body.input,kind==="audio"?12000:4000),params,modeKey:kind==="audio"?"tts":imageModes[body.mode]||body.mode,ratio:body.aspect_ratio,seconds:body.duration,resolution:body.resolution,
    refs:safeRefs.length?safeRefs:undefined,refsOmitted:Array.isArray(refs)&&refs.length>safeRefs.length,
    origin:typeof body.clientTaskId==="string"&&body.clientTaskId.startsWith("one-stop-")?"one-stop":undefined,
    clientWorkId:typeof body.clientTaskId==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(body.clientTaskId)?body.clientTaskId.replace(/^one-stop-/,""):undefined};
}
export class MediaHistory {
  private ready?:Promise<void>;
  constructor(private db:Knex){}
  ensure(){return this.ready??=withSecuritySchemaLock(this.db,async trx=>{
    if(!await trx.schema.hasTable("xoi_media_history_preferences"))await trx.schema.createTable("xoi_media_history_preferences",t=>{
      t.increments("id");t.bigInteger("user_id").notNullable();t.string("kind",16).notNullable();t.string("task_id",160).notNullable();
      t.boolean("favorite").notNullable().defaultTo(false);t.boolean("one_stop").notNullable().defaultTo(false);t.bigInteger("hidden_at").nullable();t.bigInteger("updated_at").notNullable();t.unique(["user_id","kind","task_id"]);
    });
    if(!await trx.schema.hasColumn("xoi_media_history_preferences","one_stop"))await trx.schema.alterTable("xoi_media_history_preferences",t=>t.boolean("one_stop").notNullable().defaultTo(false));
    await trx.raw("CREATE INDEX IF NOT EXISTS xoi_media_history_page ON xoi_generation_tasks(user_id,kind,id DESC)");
  }).catch(e=>{this.ready=undefined;throw e;});}
  private scope(user:number,kind:string){if(!Number.isSafeInteger(user)||user<1)throw fail("请先登录",401);if(!MEDIA_HISTORY_KINDS.includes(kind as any))throw fail("任务类型无效");}
  async list(user:number,kind:string,before?:number,known:string[]=[]){
    this.scope(user,kind);if(before!==undefined&&(!Number.isSafeInteger(before)||before<1))throw fail("历史分页无效");await this.ensure();
    if(known.length>200||known.some(id=>!/^[A-Za-z0-9_-]{1,160}$/.test(id)))throw fail("历史同步参数无效");
    const query=this.db("xoi_generation_tasks as t").leftJoin("xoi_media_history_preferences as h",function(){this.on("t.user_id","h.user_id").andOn("t.kind","h.kind").andOn("t.task_id","h.task_id");})
      .leftJoin("xoi_media_queue as q",function(){this.on("t.user_id","q.user_id").andOn("t.kind","q.kind").andOn("t.task_id","q.task_id");})
      .where({"t.user_id":user,"t.kind":kind}).whereNull("h.hidden_at").andWhere(function(){this.where("h.one_stop",true).orWhere("q.client_id","like","one-stop-%");});
    if(before)query.andWhere("t.id","<",before);
    const rows=await query.orderBy("t.id","desc").limit(51).select("t.id","t.task_id","t.status","t.updated_at","t.payload","h.favorite");
    const selected=rows.slice(0,50);
    const hidden=known.length?await this.db("xoi_media_history_preferences").where({user_id:user,kind}).whereIn("task_id",known).whereNotNull("hidden_at").select("task_id"):[];
    return {hiddenTaskIds:hidden.map(row=>row.task_id),items:selected.map(row=>{
      let p:any;try{p=JSON.parse(row.payload);if(!p||typeof p!=="object")p={};}catch{p={};}
      const meta=p.history&&typeof p.history==="object"?p.history:{};
      const urls=[p.result?.url,...(Array.isArray(p.result?.images)?p.result.images:[]),...(Array.isArray(p.result?.videos)?p.result.videos:[])].map(v=>mediaUrl(typeof v==="string"?v:v?.url)).filter((v):v is string=>!!v);
      const uncertain=row.status==="unknown"||p.recoveryRequired===true;
      return {id:`${kind}:${row.task_id}`,taskId:row.task_id,kind,model:text(p.model||p.modelKey,160),prompt:text(p.prompt||meta.prompt||(kind==="audio"?"音频生成":"未记录提示词"),12000),
        createdAt:Number(p.queuedAt||p.startedAt||row.updated_at),status:row.status==="succeeded"?"done":["failed","cancelled","unknown"].includes(row.status)?"failed":row.status==="queued"?"pending":"running",
        url:urls[0],urls:[...new Set(urls)],favorite:!!row.favorite,error:row.status==="succeeded"?undefined:text(p.error)||(uncertain?"任务结果待核对，请勿重复生成":row.status==="cancelled"?"已取消":undefined),
        meta:{...meta,origin:"one-stop",promptMissing:!p.prompt&&!meta.prompt,size:meta.size||(p.result?.width&&p.result?.height?`${p.result.width}x${p.result.height}`:undefined),cloud:true,source:"studio",unconfirmed:uncertain},
      };
    }),hasMore:rows.length>50,nextCursor:rows.length>50?Number(selected[selected.length-1].id):null,policy:MEDIA_HISTORY_POLICY};
  }
  async recoverLocal(user:number,kind:string,ids:string[]){
    this.scope(user,kind);if(!Array.isArray(ids)||ids.length>200||ids.some(id=>typeof id!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(id)))throw fail("旧任务编号无效");await this.ensure();
    if(!ids.length)return {recovered:0};
    const rows=await this.db("xoi_generation_tasks").where({user_id:user,kind}).whereIn("task_id",ids).select("task_id","payload");
    let recovered=0;
    for(const row of rows){
      let p:any;try{p=JSON.parse(row.payload);}catch{continue;}
      // A known canvas source must not be reclassified by an old browser cache.
      if(!p||p.sourceId||p.nodeId)continue;
      const values={one_stop:true,updated_at:Date.now()};
      await this.db("xoi_media_history_preferences").insert({user_id:user,kind,task_id:row.task_id,...values}).onConflict(["user_id","kind","task_id"]).merge(values);recovered++;
    }
    return {recovered};
  }
  async preference(user:number,kind:string,id:string,patch:{favorite?:boolean;hidden?:boolean}){
    this.scope(user,kind);if(!/^[A-Za-z0-9_-]{1,160}$/.test(id))throw fail("任务编号无效");await this.ensure();
    if(!await this.db("xoi_generation_tasks").where({user_id:user,kind,task_id:id}).first("id"))throw fail("任务不存在或不属于当前账号",404);
    const values={updated_at:Date.now(),...(patch.favorite===undefined?{}:{favorite:patch.favorite}),...(patch.hidden===undefined?{}:{hidden_at:patch.hidden?Date.now():null})};
    await this.db("xoi_media_history_preferences").insert({user_id:user,kind,task_id:id,...values}).onConflict(["user_id","kind","task_id"]).merge(values);
    return {saved:true};
  }
}
export function createMediaHistoryRouter(db:Knex){
  const store=new MediaHistory(db),router=express.Router();
  router.use((req,res,next)=>{res.set("Cache-Control","private, no-store");if(!Number.isSafeInteger(Number((req as any).user?.id))||Number((req as any).user?.id)<1)return res.status(401).json({success:false,message:"请先登录"});next();});
  router.get("/",async(req,res)=>{try{
    if(req.query.known!==undefined&&typeof req.query.known!=="string")throw fail("历史同步参数无效");
    const known=typeof req.query.known==="string"?req.query.known.split(",").filter(Boolean):[];
    const data=await store.list(Number((req as any).user.id),String(req.query.kind||"image"),req.query.before===undefined?undefined:Number(req.query.before),known);res.json({success:true,data});
  }catch(e:any){res.status(e.status||503).json({success:false,message:e.status?e.message:"云端历史暂不可用，请重试；原记录保留"});}});
  router.post("/recover-local",express.json({limit:"40kb"}),async(req,res)=>{try{
    const data=await store.recoverLocal(Number((req as any).user.id),String(req.body?.kind||""),req.body?.taskIds);res.json({success:true,data});
  }catch(e:any){res.status(e.status||503).json({success:false,message:e.status?e.message:"旧历史归属尚未确认，请重试"});}});
  router.patch("/:kind/:id",express.json({limit:"4kb"}),async(req,res)=>{try{
    const p=req.body;if(!p||typeof p!=="object"||Array.isArray(p)||Object.keys(p).some(k=>!["favorite","hidden"].includes(k))||!Object.keys(p).length||Object.values(p).some(v=>typeof v!=="boolean"))throw fail("历史设置参数无效");
    res.json({success:true,data:await store.preference(Number((req as any).user.id),String(req.params.kind),String(req.params.id),p)});
  }catch(e:any){res.status(e.status||503).json({success:false,message:e.status?e.message:"历史设置未确认，请重试"});}});
  return router;
}
