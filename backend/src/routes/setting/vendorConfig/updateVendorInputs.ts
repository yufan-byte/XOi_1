import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import u from "@/utils";
import { z } from "zod";
import { transform } from "sucrase";
import { mergeInputs } from "@/utils/vendorSecurity";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.string(),
    inputValues: z.record(z.string().max(80), z.string().max(8192)),
  }),
  async (req, res) => {
    const { id, inputValues } = req.body;
    const existing = await u.db("o_vendorConfig").where("id", id).first();
    if (!existing) return res.status(404).send(error("供应商不存在"));

    await u
      .db("o_vendorConfig")
      .where("id", id)
      .update({
        inputValues: JSON.stringify(mergeInputs(JSON.parse(existing.inputValues || "{}"), inputValues)),
      });
    res.status(200).send(success("更新成功"));
  },
);
