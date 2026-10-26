import express from "express";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const router = express.Router();

/** 只有用户明确采用改编稿时，才把草稿复制为正式分集剧本。 */
export default router.post(
  "/",
  validateFields({ projectId: z.number() }),
  async (req, res) => {
    const projectId = Number(req.body.projectId);
    const userId = (req as any).user?.id;
    const ownedProject = await u.db("o_project").where({ id: projectId, userId }).first();
    if (!ownedProject) return res.status(404).send({ message: "项目不存在" });

    const row = await u.db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
    const stored = row ? JSON.parse(row.data || "{}") : {};
    const drafts = z.array(z.object({ name: z.string().trim().min(1), content: z.string().trim().min(1) })).safeParse(stored.script);
    if (!drafts.success || drafts.data.length === 0) return res.status(400).send({ message: "还没有可采用的改编稿" });

    const names = drafts.data.map((item) => item.name);
    if (new Set(names).size !== names.length) return res.status(409).send({ message: "改编稿存在同名分集，请先重命名" });

    const existing = await u.db("o_script").where({ projectId }).whereIn("name", names).select("name");
    if (existing.length) {
      return res.status(409).send({ message: `正式剧本已有同名分集：${existing.map((item) => item.name || "未命名").join("、")}。请先重命名改编稿，原剧本不会被覆盖。` });
    }

    await u.db.transaction(async (trx) => {
      await trx("o_script").insert(drafts.data.map((item) => ({ projectId, name: item.name, content: item.content })));
    });
    res.status(200).send(success({ count: drafts.data.length }));
  },
);
