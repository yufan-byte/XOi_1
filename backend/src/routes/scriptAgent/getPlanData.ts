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
  }),
  async (req, res) => {
    const { projectId, agentType } = req.body;
    const userId = (req as any).user?.id;
    if (!await u.db("o_project").where({ id: projectId, userId }).first()) {
      return res.status(404).send({ message: "项目不存在" });
    }
    const row = await u.db("o_agentWorkData").where({ projectId: projectId, key: agentType }).first();

    if (!row) {
      const [id] = await u.db("o_agentWorkData").insert({
        projectId: projectId,
        key: agentType,
        data: JSON.stringify({
          storySkeleton: "",
          adaptationStrategy: "",
          script: [],
        }),
      });
      return res.status(200).send(
        success({
          data: {
            storySkeleton: "",
            adaptationStrategy: "",
            script: [],
          },
          id
        }),
      );
    }
    const data = JSON.parse(row.data ?? "{}");
    // 改编稿保留在工作区；正式剧本只在用户明确「采用」后才写入 o_script。
    data.script = Array.isArray(data.script) ? data.script : [];

    res.status(200).send(success({ data, id: row.id }));
  },
);
