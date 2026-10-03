import express from "express";
import { success, error } from "@/lib/responseFormat";
import { db } from "@/utils/db";
import { listBusinessTables } from "@/utils/dbAdmin";

const router = express.Router();

export default router.get("/", async (req, res) => {
  try {
    const data: Record<string, any[]> = {};
    for (const name of await listBusinessTables()) {
      // PG 下 raw() 返回 { rows }，不是数组
      data[name] = (await db.raw(`SELECT * FROM "${name}"`))?.rows ?? [];
    }

    const exportData = {
      exportTime: Date.now(),
      tables: data,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=xoi-backup-${Date.now()}.json`);
    res.status(200).send(JSON.stringify(exportData, null, 2));
  } catch (err: any) {
    res.status(500).send(error(err?.message || "导出失败"));
  }
});
