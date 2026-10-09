import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { listFiles } from "@/utils/listFiles";
import u from "@/utils";

const router = express.Router();

export default router.post("/", async (req, res) => {
  const skillsRoot = u.getPath(["skills"]);

  const entries = await listFiles(skillsRoot, [".md"]);

  res.status(200).send(success(entries));
});
