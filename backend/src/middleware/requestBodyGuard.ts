import type {Request,Response,NextFunction} from "express";
import {cookieAuthAllowed,readSessionToken} from "@/utils/sessionCookie";
const publicWrite=(path:string)=>["/api/login/login","/api/login/register"].includes(path);
/**
 * F3：写操作现在也接受 httpOnly 会话 cookie —— 但**只限同源**。
 * cookieAuthAllowed 会拒掉 Sec-Fetch-Site: cross-site 以及 Origin 与 Host 不一致的请求，
 * 所以跨站 CSRF 仍然拿不到写权限；同源非浏览器调用继续走 Authorization header。
 */
const hasCredentials=(req:Request)=>!!req.headers.authorization||(cookieAuthAllowed(req)&&!!readSessionToken(req));
/** Reject obvious anonymous model writes before JSON allocation; large bodies get a bounded lane. */
export function requestBodyGuard(maxLarge=4){
  let large=0;
  return(req:Request,res:Response,next:NextFunction)=>{
    if(!req.path.toLowerCase().startsWith("/api/"))return next();
    if(["GET","HEAD"].includes(req.method)&&(Number(req.headers["content-length"])>0||req.headers["transfer-encoding"]))return res.status(400).json({message:"读取接口不接受请求体"});
    if(!["GET","HEAD","OPTIONS"].includes(req.method)&&!publicWrite(req.path)&&!hasCredentials(req))return res.status(401).json({message:"请先登录"});
    if(req.headers["content-encoding"]&&req.headers["content-encoding"]!=="identity")return res.status(415).json({message:"接口不接受压缩请求体，请直接提交原始内容"});
    const length=Number(req.headers["content-length"]),hasBody=!!req.headers["content-type"]&&!["GET","HEAD","OPTIONS"].includes(req.method);
    if(!hasBody||(Number.isFinite(length)&&length>=0&&length<=1024*1024))return next();
    // 流式落盘的通道不占内存，不该和 JSON 大 body 抢这 4 个名额。
    // 它们自己的防护是：每用户 30 次/分钟 + 配额 + 磁盘水位 + 128MB 边写边计数（routes/canvas-files.ts）。
    if(req.path.toLowerCase().startsWith("/api/canvas-files"))return next();
    if(large>=maxLarge){res.setHeader("Retry-After","3");return res.status(429).json({message:"大文件处理繁忙，请稍后重试；本次未提交模型"});}
    large++;let released=false;const release=()=>{if(!released){released=true;large--;}};res.once("finish",release);res.once("close",release);next();
  };
}
