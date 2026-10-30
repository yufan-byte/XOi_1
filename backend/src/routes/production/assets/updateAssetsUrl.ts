import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import crypto from "node:crypto";
import {saveCanvasAssetResult} from "@/lib/workspace/canvasAssetResult";
import {saveBase64Media} from "@/utils/mediaWrite";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.number(),
    url: z.string(),
    flowId: z.number(),
  }),
  async (req, res) => {
    try {
      const { id, url, flowId } = req.body,userId=Number((req as any).user.id);
      const asset=await u.db("o_assets as a").join("o_project as p","p.id","a.projectId").where({"a.id":id,"p.userId":userId}).first("a.projectId");
      if(!asset)return res.status(404).send(error("资产不存在"));
      const data=await saveCanvasAssetResult({db:u.db,userId,assetId:id,projectId:Number(asset.projectId),filePath:"/"+u.replaceUrl(url),read:path=>u.oss.getFile(path),
        archive:async(projectId,bytes)=>(await saveBase64Media({userId,scope:"project",base64:bytes.toString("base64"),autoDetect:true,maxBytes:10*1024*1024,relPath:ext=>`/${projectId}/canvas-return/${crypto.randomUUID()}.${ext}`})).relPath});
      await u.db("o_assets").where({id,projectId:asset.projectId}).update({flowId});
      res.status(200).send(success({...data,url:await u.oss.getSmallImageUrl(data.filePath),message:"已保存资产图片"}));
    } catch(e:any) { res.status(e.status||400).send(error(e.status?e.message:"保存图片失败，原图保留")); }
  },
);
