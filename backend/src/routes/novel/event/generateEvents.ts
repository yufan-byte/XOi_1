import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";

const router = express.Router();

// 清洗小说原文，生成事件列表
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    novelIds: z.array(z.number()),
    concurrentCount: z.number().min(1).optional(),
  }),
  async (req, res) => {
    const userId = (req as any).user?.id;
    const { projectId, novelIds, concurrentCount = 5 } = req.body;

    // 检查积分（每章扣一次）
    if (userId) {
      const required = await getActionPoints("text_generate");
      const total = required * novelIds.length;
      if (total > 0) {
        const balance = await getUserPoints(userId);
        if (balance < total) {
          return res.status(400).send(error(`积分不足，需要 ${total} 积分，当前余额 ${balance}`));
        }
      }
    }

    const [allChapters, novel] = await Promise.all([
      u.db("o_novel").where("projectId", projectId).whereIn("id", novelIds),
      Promise.resolve(new u.cleanNovel(concurrentCount)),
    ]);
    if (allChapters.length === 0) {
      return res.status(400).send(success("没有对应章节"));
    }
    await u.db("o_novel").where("projectId", projectId).whereIn("id", novelIds).update({ eventState: 0, event: null });
    novel.emitter.on("item", async (item) => {
      await u
        .db("o_novel")
        .where("id", item.id)
        .update({ event: item.event, eventState: item.event ? 1 : -1, errorReason: item?.errorReason ?? null });
    });
    novel.start(allChapters, projectId);

    // 扣除积分（每章扣一次）
    let pointsDeducted = 0;
    let balance = 0;
    if (userId) {
      const required = await getActionPoints("text_generate");
      if (required > 0) {
        for (let i = 0; i < novelIds.length; i++) {
          await deductPoints(userId, "text_generate", "事件分析");
        }
        pointsDeducted = required * novelIds.length;
        balance = await getUserPoints(userId);
      }
    }

    return res.status(200).send(success({ message: "生成事件成功", pointsDeducted, balance }));
  },
);
