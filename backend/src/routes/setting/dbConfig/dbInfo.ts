import express from "express";
import { success, error } from "@/lib/responseFormat";
import { db } from "@/utils/db";
import { listBusinessTables } from "@/utils/dbAdmin";

const router = express.Router();

export default router.get("/", async (req, res) => {
  try {
    const tableInfo = [];
    for (const name of await listBusinessTables()) {
      // PG 的 count(*) 是 bigint，pg 驱动会回成字符串，这里显式转 int；
      // 另外 raw() 在 pg 下返回 { rows }，不是数组
      const countResult = await db.raw(`SELECT COUNT(*)::int AS count FROM "${name}"`);
      tableInfo.push({ name, rowCount: countResult?.rows?.[0]?.count ?? 0 });
    }

    res.status(200).send(success(tableInfo));
  } catch (err: any) {
    res.status(500).send(error(err?.message || "获取数据库信息失败"));
  }
});
