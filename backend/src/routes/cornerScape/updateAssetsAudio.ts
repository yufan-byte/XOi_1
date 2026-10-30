import express from "express";
import u from "@/utils";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 新增资产
export default router.post(
  "/",
  validateFields({
    assetsId: z.number(),
    audioIds: z.array(z.number()).optional(),
  }),
  async (req, res) => {
    const { assetsId, audioIds } = req.body;
    if (audioIds && audioIds.length > 1) return res.status(400).send(error("仅可绑定一个音色"));
    const result = await u.db.transaction(async trx => {
      const asset = await trx("o_assets").where({ id: assetsId, type: "role" }).forUpdate().first("id", "projectId");
      if (!asset) return "只能给人物绑定声音";
      if (audioIds?.length) {
        const audio = await trx("o_assets").where({ id: audioIds[0], projectId: asset.projectId, type: "audio" }).first("id");
        if (!audio) return "音频不存在或不属于当前项目";
      }
      await trx("o_assetsRole2Audio").where("assetsRoleId", assetsId).delete();
      if (audioIds?.length) await trx("o_assetsRole2Audio").insert({ assetsRoleId: assetsId, assetsAudioId: audioIds[0] });
      await trx("o_assets").where("id", assetsId).update("audioBindState", audioIds?.length ? "已完成" : "");
      return null;
    });
    if (result) return res.status(400).send(error(result));
    res.status(200).send(success({ message: "更新音频成功" }));
  },
);
