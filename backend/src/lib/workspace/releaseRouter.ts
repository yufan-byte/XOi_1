import express from "express";
import type {Knex} from "knex";
import {ReleaseControl} from "./releaseControl";

export const isReleaseOperator=(user:any)=>!!user&&Number(user.role)>=100&&Number(user.status)===1&&user.deleted_at==null;
export function createReleaseRouter(db:Knex,control:ReleaseControl,currentId:string,enabled:boolean){
  const router=express.Router();
  router.use(async(req,res,next)=>{
    res.set("Cache-Control","private, no-store");
    const id=Number((req as any).user?.id);
    if(!Number.isSafeInteger(id)||id<1)return res.status(401).json({message:"请先登录"});
    try{
      // Always re-read NewAPI authority; JWT claims, agent scope and cached UI roles are not sufficient.
      const user=await db("users").where({id}).select("role","status","deleted_at").first();
      if(!isReleaseOperator(user))return res.status(403).json({message:"发布运维仅限平台超级管理员"});
      next();
    }catch{return res.status(503).json({message:"权限暂未能核验，本次未执行发布操作"});}
  });
  router.get("/",async(_req,res)=>{
    try{res.json({success:true,data:{currentInstanceId:currentId,rolloutEnabled:enabled,instances:await control.list(),audit:await control.audit()}});}
    catch{res.status(503).json({message:"发布状态暂不可用，未执行任何更新或重启"});}
  });
  router.post("/:id/control",async(req,res)=>{
    const b=req.body;
    if(!b||Object.keys(b).some(k=>!["revision","action","reason","confirm"].includes(k))||!Number.isSafeInteger(b.revision)||b.revision<0||!["drain","resume"].includes(b.action)||typeof b.reason!=="string"||!b.reason.trim()||b.reason.length>200||b.confirm!=="CONFIRM_NODE_CONTROL"||req.get("X-XOi-Release-Intent")!=="node-control"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(req.params.id)))return res.status(400).json({message:"请明确确认节点操作，填写原因，并刷新节点版本"});
    try{
      const data=await control.change(String(req.params.id),b.revision,b.action==="drain",Number((req as any).user.id),b.reason.trim());
      res.json({success:true,data});
    }catch(e:any){res.status(e.status||503).json({message:e.status?e.message:"节点状态未能确认，请刷新核对；不会自动重试操作"});}
  });
  return router;
}
