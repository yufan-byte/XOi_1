import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

export default router.post(
  "/",
  validateFields({
    ids: z.array(z.number()),
  }),
  async (req, res) => {
    const { ids } = req.body;
    if (!ids.length) return res.status(200).send(success([]));
    // extractState 是整数列：-1 失败 / 0 正在提取 / 1 成功 / 2 等待提取。
    // 旧代码拿它和字符串 "生成中" 比较——MySQL 能隐式转换，PostgreSQL 直接报
    // invalid input syntax for type integer，导致轮询一直 500、界面永远停在"资产提取中"。
    const data = await u.db("o_script").whereIn("id", ids).whereNot("extractState", 0).select("id", "extractState", "errorReason");
    res.status(200).send(success(data));
  },
);
