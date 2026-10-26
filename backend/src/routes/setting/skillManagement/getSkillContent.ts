import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
import u from "@/utils";
import { readSkillDocument } from "@/utils/skillDocument";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    path: z.string(),
  }),
  async (req, res) => {
    const { path } = req.body;
    const skillsRoot = u.getPath(["skills"]);
    try {
      const raw = await readSkillDocument(skillsRoot, path);
      res.status(200).send(success(raw));
    } catch {
      res.status(400).send(error("技能资料不存在或不在允许读取范围"));
    }
  },
);
