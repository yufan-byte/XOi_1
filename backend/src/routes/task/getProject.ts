import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
const router = express.Router();

export default router.post("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).send({ message: "未登录" });
  }
  const list = await u.db("o_project").where("userId", userId).select("id", "name").groupBy("name");
  const data = list.filter((item) => item.name);
  res.status(200).send(success(data));
});
