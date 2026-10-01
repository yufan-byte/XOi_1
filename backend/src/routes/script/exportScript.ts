import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import compressing from "compressing";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.array(z.number()),
  }),
  async (req, res) => {
    const { id } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).send(error("未登录"));

    // 验证剧本属于当前用户的项目
    const scripts = await u.db("o_script").whereIn("id", id);
    if (scripts.length > 0) {
      const projectIds = [...new Set(scripts.map((s) => s.projectId))];
      const userProjects = await u.db("o_project").whereIn("id", projectIds).where("userId", userId).select("id");
      if (userProjects.length === 0) return res.status(403).send(error("无权导出其他用户的剧本"));
    }
    const textList = scripts.map((s) => ({ name: s.name, text: s.content }));
    //压缩为zip文件
    const zipStream = new compressing.zip.Stream();
    textList.forEach((item) => {
      zipStream.addEntry(Buffer.from(item.text!), { relativePath: `${item.name}.txt` });
    });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=scripts.zip`);
    zipStream.pipe(res);
  },
);
