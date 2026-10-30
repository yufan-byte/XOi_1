import { Request, Response } from "express";
import u from "@/utils";
import crypto from "node:crypto";
import {saveCanvasAssetResult} from "@/lib/workspace/canvasAssetResult";
import {saveBase64Media} from "@/utils/mediaWrite";

/**
 * POST /assetsGenerate/saveCanvasResult
 * 保存画布编辑后的结果（替换资产图片）
 */
export default async function saveCanvasResult(req: Request, res: Response) {
  try {
    const userId=Number((req as any).user?.id);
    if(!userId)return res.status(401).json({message:"请先登录"});
    if (req.body?.candidateOnly !== undefined && typeof req.body.candidateOnly !== "boolean") return res.status(400).json({message:"候选图参数无效"});
    const data=await saveCanvasAssetResult({db:u.db,userId,assetId:req.body?.id,projectId:req.body?.projectId,filePath:req.body?.filePath,candidateOnly:req.body?.candidateOnly === true,
      read:path=>u.oss.getFile(path),
      archive:async(projectId,bytes)=>(await saveBase64Media({userId,scope:"project",base64:bytes.toString("base64"),autoDetect:true,maxBytes:10*1024*1024,relPath:ext=>`/${projectId}/canvas-return/${crypto.randomUUID()}.${ext}`})).relPath,
    });
    res.json({ success: true, message: data.candidateOnly ? "画布结果已保存为候选图" : "画布结果已保存", data, imageId:data.imageId });
  } catch (error: any) {
    console.error("保存画布结果失败:", error);
    res.status(error.status||500).json({ message:error.status?error.message:"保存失败，原图保留" });
  }
}
