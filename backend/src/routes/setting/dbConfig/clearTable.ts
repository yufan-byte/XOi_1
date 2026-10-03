import express from "express";
import { success, error } from "@/lib/responseFormat";
import { db } from "@/utils/db";
import { tableExists, truncateTable } from "@/utils/dbAdmin";

const router = express.Router();

export default router.post("/", async (req, res) => {
  try {
    const { tableName } = req.body;
    if (!tableName || typeof tableName !== "string") {
      return res.status(400).send(error("请提供有效的表名"));
    }

    // 验证表名存在（防止 SQL 注入）
    if (!(await tableExists(tableName))) {
      return res.status(400).send(error("表不存在"));
    }

    // TRUNCATE ... CASCADE：比 DELETE 快，且能穿过外键（PG 没有 PRAGMA 那套开关）
    await truncateTable(tableName);

    res.status(200).send(success(`表 ${tableName} 已清空`));
  } catch (err: any) {
    res.status(500).send(error(err?.message || "清空表失败"));
  }
});
