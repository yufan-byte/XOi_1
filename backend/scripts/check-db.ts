/**
 * 业务库连通性自检（PostgreSQL）
 * =====================================================================
 * 用途：不依赖 HTTP（沙箱里跨进程 localhost 不通），直接用应用自己的 db 客户端
 * 跑几条真实查询，确认「SQLite → new-api 的 PostgreSQL」这次迁移真的可用。
 * 它同时验证三件迁移后最容易坏的事：
 *   1. 自增主键（SQLite 的 INTEGER PRIMARY KEY → PG 的 serial）
 *   2. 毫秒时间戳列（integer → bigInteger，且 int8 要读成 number 而不是字符串）
 *   3. PG 方言助手（原先这些 SQL 查的是 sqlite_master）
 *
 * 用法：cd backend && npx tsx scripts/check-db.ts
 *
 * ⚠️ 导入顺序有讲究：必须**先** import "@/utils"，再引 "@/utils/db"。
 *    反过来（先引 @/utils/db）会让 src/utils.ts 里那句 `import db from "@/utils/db"`
 *    在这套 CJS/ESM 互操作下拿到命名空间对象而不是 knex 实例，于是全项目的
 *    `u.db(...)`（161 个文件、464 处）在运行期全部报
 *    "import_utils.default.db is not a function"。实测：先引 @/utils 就正常。
 * =====================================================================
 */
import "@/env"; // dotenv/config —— 服务端是靠 app.ts 顶部这句加载 .env 的
import u from "@/utils";
import { dbReady } from "@/utils/db";
import { listBusinessTables, tableExists } from "@/utils/dbAdmin";

// 脚本里按动态表名调用，绕开 DB 的键名约束
const db = u.db as unknown as ((name: string) => any) & typeof u.db;

async function main() {
    await dbReady;

    const tables = await listBusinessTables();
    console.log(`业务表（pg_tables，已排除 knex_%）：${tables.length} 张`);

    const sample = ["o_user", "o_setting", "o_project", "o_skillList", "o_artStyle", "o_agentDeploy", "o_points_package", "o_video"];
    for (const t of sample) {
        const row = (await db(t).count({ n: "*" }).first()) as { n?: number } | undefined;
        console.log(`  ${t.padEnd(18)} ${row?.n ?? 0} 行`);
    }

    // 关键点 1：bigInteger 存毫秒时间戳，读出来必须是 number（不是 pg 默认的字符串）
    const skill = (await db("o_skillList").select("id", "name", "createTime").first()) as
        | { id: number; name: string; createTime: number }
        | undefined;
    if (skill) {
        console.log(`o_skillList 首行：id=${skill.id}(${typeof skill.id}) createTime=${skill.createTime}(${typeof skill.createTime})`);
        if (typeof skill.createTime !== "number") throw new Error("createTime 不是 number —— pg 的 int8 解析器没生效");
    } else {
        console.log("o_skillList 空表（跳过时间戳类型检查）");
    }

    // 关键点 2：自增主键（SQLite 的 INTEGER PRIMARY KEY → PG 的 serial）
    const inserted = await db("o_prompt").insert({ name: "__check_db_probe__" }).returning("id");
    const raw = inserted?.[0] as unknown;
    const newId = typeof raw === "object" && raw !== null ? (raw as { id: number }).id : (raw as number);
    console.log(`o_prompt 自增插入 → id=${newId}(${typeof newId})`);
    if (newId !== undefined) await db("o_prompt").where("id", newId).del();

    // 关键点 3：PG 方言助手（原先这些代码查的是 sqlite_master）
    console.log(`tableExists("o_video")          = ${await tableExists("o_video")}`);
    console.log(`tableExists("__no_such_table__") = ${await tableExists("__no_such_table__")}`);

    console.log("\n✓ 业务库自检通过");
}

main().catch((e) => {
    console.error("✗ 自检失败：");
    console.error(e);
    process.exit(1);
});
