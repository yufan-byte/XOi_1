import express from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    agentType: z.enum(["scriptAgent"]),
    data: z.object({
      storySkeleton: z.string(),
      adaptationStrategy: z.string(),
      script: z.array(z.object({ name: z.string(), content: z.string() })),
    }),
  }),
  async (req, res) => {
    const { projectId, agentType, data } = req.body;
    const userId = (req as any).user?.id;
    if (!await u.db("o_project").where({ id: projectId, userId }).first()) {
      return res.status(404).send({ message: "项目不存在" });
    }
    const existing = await u.db("o_agentWorkData").where({ projectId, key: agentType }).first();
    if (existing) {
      await u.db("o_agentWorkData").where({ id: existing.id }).update({ data: JSON.stringify(data) });
    } else {
      await u.db("o_agentWorkData").insert({ projectId, key: agentType, data: JSON.stringify(data) });
    }

    res.status(200).send(success());
  },
);
