/**
 * 数据库运维方言助手（PostgreSQL）
 * =====================================================================
 * 背景：业务库从 SQLite 迁到 new-api 的 PostgreSQL（决策 D2）之后，
 * setting/dbConfig 下那 5 个「数据库信息 / 导出 / 导入 / 清空」接口里的
 * SQLite 专有写法全部失效，必须换成 PG 的：
 *
 *   · `SELECT name FROM sqlite_master ...`  → pg_tables
 *   · `PRAGMA foreign_keys = OFF/ON`        → PG 没有这个；改为 DROP ... CASCADE
 *   · `DELETE FROM "t"`                     → 有外键时会被拦，改用 TRUNCATE ... CASCADE
 *
 * 另一处容易踩的：knex 的 `raw()` 在 **pg 驱动下返回的是
 * `{ command, rowCount, rows, fields }` 对象，不是数组**（SQLite 下才是数组）。
 * 所以下面统一走 `.rows` —— 直接 `await db.raw(sql)` 当数组遍历会在 PG 上静默跑空。
 */
import { db } from "@/utils/db";

/** 业务表名列表（排除 knex 自己的迁移表）。按名字排序，保证导入导出稳定。 */
export async function listBusinessTables(): Promise<string[]> {
    const res = await db.raw(
        `SELECT tablename AS name FROM pg_tables
          WHERE schemaname = current_schema() AND tablename NOT LIKE 'knex_%'
          ORDER BY tablename`,
    );
    return (res?.rows ?? []).map((r: { name: string }) => r.name);
}

/** 表是否存在（用 regclass，天然不受 schema 搜索路径与大小写影响）。
 *  ⚠️ 占位符用 knex 的 `?`，不要写 pg 的 `$1` —— knex 会自己按方言转换，
 *  手写 `$1` 会让它的绑定解析器找不到参数，报 "Expected 1 bindings, saw 0"。 */
export async function tableExists(name: string): Promise<boolean> {
    const res = await db.raw(`SELECT to_regclass(?) IS NOT NULL AS ok`, [`"${name}"`]);
    return Boolean(res?.rows?.[0]?.ok);
}

/** 逐张删表。PG 用 CASCADE，不需要（也没有）PRAGMA 那套关外键的办法。 */
export async function dropTables(names: string[]): Promise<void> {
    for (const n of names) await db.raw(`DROP TABLE IF EXISTS "${n}" CASCADE`);
}

/** 清空单表：TRUNCATE + CASCADE，比 DELETE 快且能穿过外键 */
export async function truncateTable(name: string): Promise<void> {
    await db.raw(`TRUNCATE TABLE "${name}" CASCADE`);
}
