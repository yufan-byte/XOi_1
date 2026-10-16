import express from "express";
import u from "@/utils";
import { db } from "@/utils/db";
import { success } from "@/lib/responseFormat";
const router = express.Router();

export default router.post("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).send({ message: "未登录" });
  }
  // 按项目名去重（同名项目只出一个筛选项）。
  // ⚠️ 不能写成 .select("id", "name").groupBy("name")：SQLite 允许 GROUP BY 里带裸列
  // （id 随便取该组的一行），PostgreSQL 会直接报
  // 「column "o_project.id" must appear in the GROUP BY clause or be used in an aggregate function」。
  // MIN(id) 语义等价于「每个名字取一个代表项目」，且 SQLite / PG 两边都合法。
  //
  // raw 来自实际的 Knex 实例；默认导出也保留同一实例的完整 API。
  const list = await u
    .db("o_project")
    .where("userId", userId)
    .select("name", db.raw('MIN("id") as id'))
    .groupBy("name");
  const data = list.filter((item) => item.name);
  res.status(200).send(success(data));
});
