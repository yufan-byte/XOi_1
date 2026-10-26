import type {Request,Response,NextFunction} from "express";
import {db} from "@/utils/db";
import {SharedRateLimit} from "@/utils/sharedRateLimit";
export const sharedRates=new SharedRateLimit(db);
/** Only sensitive lanes use DB counters; static files and ordinary reads remain cheap. */
export function sharedRateLimiter(scope:string,windowMs:number,max:number,key:(req:Request)=>string){
  return async(req:Request,res:Response,next:NextFunction)=>{
    try{const result=await sharedRates.take(scope,key(req),windowMs,max);
      if(!result.allowed){res.setHeader("Retry-After",String(result.retryAfter));return res.status(429).json({message:"操作过于频繁，请稍后重试"});}next();
    }catch{return res.status(503).json({message:"安全校验暂不可用，本次操作未提交，请稍后重试"});}
  };
}
