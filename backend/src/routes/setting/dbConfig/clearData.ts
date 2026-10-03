import express from "express";
import { success, error } from "@/lib/responseFormat";
import { db } from "@/utils/db";
import initDB from "@/lib/initDB";
import { dropTables, listBusinessTables } from "@/utils/dbAdmin";

const router = express.Router();

export default router.post("/", async (req, res) => {
  if (req.body?.confirm !== "DELETE_ALL_DATA") return res.status(400).send(error("需要明确确认清空数据"));
  try {
    // PG 没有 PRAGMA 关外键那一套；DROP ... CASCADE 自己会处理依赖
    await dropTables(await listBusinessTables());

    // 重新初始化数据库
    await initDB(db as any);

    res.status(200).send(success("数据库已清空并重新初始化"));
  } catch (err: any) {
    res.status(500).send(error(err?.message || "清除失败"));
  }
});
