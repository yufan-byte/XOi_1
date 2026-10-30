import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import {mediaPath} from "@/utils/privateMedia";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";
import { userFacingError } from "@/utils/userFacingError";
const router = express.Router();

async function urlToBase64(imageUrl: string, projectId: number): Promise<string> {
  const relative=mediaPath("/"+u.replaceUrl(imageUrl));
  const sourceProject=/^\/([1-9]\d*)\//.exec(relative);
  if(sourceProject&&Number(sourceProject[1])!==Number(projectId))throw new Error("参考图不属于当前项目");
  // Stored references are often relative paths; do not issue an unauthenticated HTTP request back to /oss.
  // OSS checks the authenticated owner and rejects symlinks before reading.
  return u.oss.getImageBase64(relative);
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
              list.push({ type: "image" as const, base64: await urlToBase64(url, projectId) });
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
      // 以前把 u.error(e).message 原样回给前端，数据库报错会连着 SQL 一起弹到界面上。
      console.error("[generateFlowImage] 生成失败:", u.error(e).message);
      res.status(400).send(error(userFacingError(e, "图片生成失败，请稍后重试")));
    }
  },
);
