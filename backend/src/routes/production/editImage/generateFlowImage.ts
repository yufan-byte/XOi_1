import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import axios from "axios";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";
const router = express.Router();

async function urlToBase64(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("/oss/")) {
    return await u.oss.getImageBase64(u.replaceUrl(imageUrl).replace("/smallImage", ""));
  }
  imageUrl = await u.oss.getFileUrl(u.replaceUrl(imageUrl));
  const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
  const contentType = response.headers["content-type"] || "image/png";
  const base64 = Buffer.from(response.data, "binary").toString("base64");
  return `data:${contentType};base64,${base64}`;
}
export default router.post(
  "/",
  validateFields({
    model: z.string(),
    references: z.array(z.string()).optional(),
    quality: z.string(),
    ratio: z.string(),
    prompt: z.string(),
    projectId: z.number(),
  }),
  async (req, res) => {
    const userId = (req as any).user?.id;
    const { model, references = [], quality, ratio, prompt, projectId } = req.body;

    // 检查积分
    if (userId) {
      const required = await getActionPoints("image_generate");
      if (required > 0) {
        const balance = await getUserPoints(userId);
        if (balance < required) {
          return res.status(400).send(error(`积分不足，需要 ${required} 积分，当前余额 ${balance}`));
        }
      }
    }

    try {
      const imageClass = await u.Ai.Image(model).run(
        {
          prompt: prompt,
          referenceList: await (async () => {
            const list: { type: "image"; base64: string }[] = [];
            for (const url of references) {
              list.push({ type: "image" as const, base64: await urlToBase64(url) });
            }
            return list;
          })(),
          size: quality,
          aspectRatio: ratio,
        },
        {
          taskClass: "工作流图片生成",
          describe: "工作流图片生成",
          relatedObjects: JSON.stringify(req.body),
          projectId: projectId,
        },
      );
      const savePath = `${projectId}/workFlow/${u.uuid()}.jpg`;
      await imageClass.save(savePath);

      // 扣除积分
      let pointsDeducted = 0;
      let balance = 0;
      if (userId) {
        const required = await getActionPoints("image_generate");
        if (required > 0) {
          await deductPoints(userId, "image_generate", "生成流图片");
          pointsDeducted = required;
          balance = await getUserPoints(userId);
        }
      }

      const url = await u.oss.getSmallImageUrl(savePath);
      return res.status(200).send(success({ url, pointsDeducted, balance }));
    } catch (e) {
      res.status(400).send(error(u.error(e).message));
    }
  },
);
