import express from "express";
import {TeamManagementError,type TeamManagement} from "./management";
import {managementQuery,renameTeamInput} from "./inputs";
export function createTeamManagementRouter(service:()=>TeamManagement,ensure:()=>Promise<void>){
  const router=express.Router();
  router.use((_req,res,next)=>{res.set("Cache-Control","no-store");next();});
  router.use((req,res,next)=>{if(!Number.isSafeInteger(Number((req as any).user?.id))||Number((req as any).user.id)<1)return res.status(401).json({success:false,message:"请先登录"});next();});
  const fail=(res:express.Response,e:unknown)=>res.status(e instanceof TeamManagementError?e.status:500).json({success:false,message:e instanceof TeamManagementError?e.message:"团队管理记录暂时不可用，请稍后重试"});
  router.get("/",async(req,res)=>{
    const parsed=managementQuery.safeParse(req.query);if(!parsed.success)return res.status(400).json({success:false,message:"管理记录查询参数无效"});
    try{await ensure();const d=await service().list(Number((req as any).user.id),parsed.data.view,parsed.data.page,parsed.data.teamId);return res.set("Cache-Control","no-store").json({success:true,data:d});}catch(e){return fail(res,e);}
  });
  router.patch("/",async(req,res)=>{
    const parsed=renameTeamInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"团队名称需 1–40 字，请刷新后重试"});
    try{await ensure();const d=await service().rename(Number((req as any).user.id),parsed.data.name,parsed.data.expectedName,parsed.data.teamId);return res.json({success:true,data:d});}catch(e){return fail(res,e);}
  });
  return router;
}
