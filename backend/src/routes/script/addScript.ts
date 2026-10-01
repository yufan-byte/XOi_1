import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 新增剧本
export default router.post(
  "/",
  validateFields({
    name: z.string(),
    content: z.string(),
    projectId: z.number(),
    assets: z.array(z.number()),
  }),
  async (req, res) => {
    const { name, content, projectId, assets } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).send(error("未登录"));

    // 验证项目属于当前用户
    const project = await u.db("o_project").where("id", projectId).where("userId", userId).first();
    if (!project) return res.status(403).send(error("无权在此项目下添加剧本"));

    const [scriptId] = await u.db("o_script").insert({
      name,
      content,
      projectId,
      createTime: Date.now(),
    });
    if (assets.length) {
      const assetsData = await u.db("o_assets").whereIn("id", assets).select();
      if (assetsData.length) {
        const assetsIds = assetsData.map((item) => item.id);
        const insertData = assetsIds.map((i) => {
          return {
            scriptId,
            assetId: i,
          };
        });
        await u.db("o_scriptAssets").insert(insertData);
      }
    }

    res.status(200).send(success({ message: "添加剧本成功" }));
  },
);
