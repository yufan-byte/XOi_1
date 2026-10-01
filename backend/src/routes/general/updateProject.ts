import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 修改项目
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    intro: z.string().optional().nullable(),
    type: z.string().optional().nullable(),
    artStyle: z.string().optional().nullable(),
    videoRatio: z.string().optional().nullable(),
    projectType: z.string().optional().nullable(),
  }),
  async (req, res) => {
    const { id, intro, type, artStyle, videoRatio, projectType } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).send({ message: "未登录" });
    }

    // 验证项目属于当前用户
    const project = await u.db("o_project").where("id", id).where("userId", userId).first();
    if (!project) {
      return res.status(403).send({ message: "无权修改此项目" });
    }

    await u.db("o_project").where("id", id).update({
      intro,
      type,
      artStyle,
      videoRatio,
      projectType,
    });

    res.status(200).send(success({ message: "修改成功" }));
  },
);
