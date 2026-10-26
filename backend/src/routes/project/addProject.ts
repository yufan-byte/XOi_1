import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { readCreativePreference } from '../../../../shared/creativePreference';
import {creativeIds} from '@/utils/creativeIds';
const router = express.Router();

// 新增项目
export default router.post(
  "/",
  validateFields({
    projectType: z.enum(["novel", "script"]),
    name: z.string(),
    intro: z.string(),
    type: z.string(),
    artStyle: z.string(),
    directorManual: z.string(),
    videoRatio: z.string(),
    imageModel: z.string(),
    videoModel: z.string(),
    imageQuality: z.string(),
    mode: z.string(),
    textModel: z.string().optional(),
  }),
  async (req, res) => {
    const { projectType, name, intro, type, directorManual, artStyle, videoRatio, imageModel, videoModel, imageQuality, mode, textModel } = req.body;
    try {
      for (const value of [artStyle,directorManual]) { const p=readCreativePreference(value); if(p.mode==='custom'&&!p.text.trim())throw Error('请填写自定义创作要求，或选择暂不设置'); }
    } catch(e) {return res.status(400).send({success:false,message:u.error(e).message});}

    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).send({ message: "未登录" });
    }

    const id=await creativeIds(u.db).next();
    await u.db("o_project").insert({
      id,
      projectType,
      name,
      intro,
      type,
      artStyle,
      videoRatio,
      directorManual,
      userId,
      imageModel,
      videoModel,
      createTime: Date.now(),
      imageQuality,
      mode,
      ...(textModel ? { textModel } : {}),
    });

    res.status(200).send(success({ id,message: "新增项目成功" }));
  },
);
