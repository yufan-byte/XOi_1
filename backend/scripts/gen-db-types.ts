/**
 * 从 src/lib/initDB.ts 生成 src/types/database.d.ts
 * =====================================================================
 * 为什么需要这个脚本：
 *   项目原本靠 `@rmp135/sql-ts` 在 dev 启动时**连一次真实数据库**反向生成类型
 *   （见 src/utils/db.ts 的 initKnexType），生成物 src/types/database.d.ts
 *   **没有进基线导入**，于是整个后端有 4 个文件编译不过、类型检查全红。
 *
 *   这条路要求先有一个能连上的库（SQLite 要 better-sqlite3 原生模块，PG 要实例），
 *   在没有库的环境里（CI / 沙箱 / 新克隆）就彻底走不通。
 *
 * 本脚本改为**从 schema 源头（initDB.ts）直接生成**，不依赖任何数据库驱动，
 * 所以 SQLite 迁到 PostgreSQL 之后依然适用 —— 只要建表语句还是那份。
 *
 * 用法：cd backend && npx tsx scripts/gen-db-types.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SRC = path.join(process.cwd(), "src/lib/initDB.ts");
const OUT = path.join(process.cwd(), "src/types/database.d.ts");

/** knex 列构造器 → TypeScript 类型 */
const TYPE_MAP: Record<string, string> = {
  increments: "number",
  integer: "number",
  bigInteger: "number",
  bigint: "number",
  float: "number",
  decimal: "number",
  double: "number",
  text: "string",
  string: "string",
  boolean: "boolean",
  json: "Record<string, unknown>",
  jsonb: "Record<string, unknown>",
  date: "string",
  datetime: "string",
  timestamp: "string",
  time: "string",
  binary: "Buffer",
};

type Col = { name: string; type: string };

/** 从一段建表/迁移体里抽出所有列定义。
 *  只看 `table.<类型>("列名")` 这种调用，`table.index([...])` / `table.primary([...])`
 *  用的是 `[`，天然不会命中。
 *
 *  可空性：只有显式 `.notNullable()`（以及自增主键）才当成非空，其余一律 `T | null`。
 *  —— 这次不这样做就炸了：项目里大量 insert 往可选列里写 `null`，
 *     全标非空会有 20+ 处 "Type 'null' is not assignable" 编译错误。
 */
function columnsOf(body: string): Col[] {
  const out: Col[] = [];
  const seen = new Map<string, number>();
  // 捕获整条语句（到分号为止），才能看到后面挂着的 .notNullable()
  const re = /table\.([a-zA-Z]+)\(\s*"([^"]+)"([^;]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [, fn, name, tail] = m;
    const base = TYPE_MAP[fn];
    if (!base) continue;
    const strict = fn === "increments" || /\.notNullable\(\)/.test(tail);
    const type = strict ? base : `${base} | null`;
    const at = seen.get(name);
    if (at !== undefined) {
      // 迁移里重复声明同一列（例如先 add 又改类型）时，取更宽松的那个，避免把可空写死
      if (out[at].type === type) continue;
      if (out[at].type.includes("| null")) continue;
      out[at] = { name, type };
      continue;
    }
    seen.set(name, out.length);
    out.push({ name, type });
  }
  return out;
}

async function main() {
  const text = await readFile(SRC, "utf8");

  // 表项形如：  { name: "o_order",  builder: (table) => { ... } }
  // 用 name+builder 的固定搭配定位，避免命中 initData 里插入的普通数据对象。
  // ⚠️ 表名必须是 [A-Za-z] 开头：本项目有 o_videoTrack / o_vendorConfig / o_pointsPackage
  //    这类**驼峰**表名，只写 [a-z] 会把它们漏掉，后果是前一张表把后面几张的列全吞进去
  //    （o_video.id 因此被 o_vendorConfig 的 table.string("id") 覆盖成 string）。
  const headRe = /name:\s*"([A-Za-z][A-Za-z0-9_]*)",\s*\n\s*builder:\s*\(table\)\s*=>\s*\{/g;
  const starts: { name: string; from: number }[] = [];
  let h: RegExpExecArray | null;
  while ((h = headRe.exec(text))) starts.push({ name: h[1], from: h.index + h[0].length });

  if (!starts.length) throw new Error("没有解析到任何表定义，确认 initDB.ts 的写法是否变了");

  const tables: { name: string; cols: Col[] }[] = [];
  for (let i = 0; i < starts.length; i++) {
    const body = text.slice(starts[i].from, starts[i + 1]?.from ?? text.length);
    tables.push({ name: starts[i].name, cols: columnsOf(body) });
  }

  // 还表结构不止 createTable —— 文件后半段的 alterTable 迁移会给老表补列
  // （例如 o_user.member_level 只存在于迁移里，不解析就会漏，调用方 insert 直接编译不过）
  const byName = new Map(tables.map((t) => [t.name, t]));
  const alterRe = /alterTable\(\s*"([A-Za-z][A-Za-z0-9_]*)"\s*,\s*\(table\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g;
  let a: RegExpExecArray | null;
  let added = 0;
  while ((a = alterRe.exec(text))) {
    const t = byName.get(a[1]);
    if (!t) continue;
    for (const c of columnsOf(a[2])) {
      if (t.cols.some((x) => x.name === c.name)) continue;
      t.cols.push(c);
      added++;
    }
  }

  const lines: string[] = [
    "/* eslint-disable */",
    "/**",
    " * 数据库行类型（自动生成，不要手改）",
    ` * 生成源：src/lib/initDB.ts　　生成脚本：scripts/gen-db-types.ts`,
    ` * 表数量：${tables.length}`,
    " */",
    "",
  ];
  for (const t of tables) {
    lines.push(`export interface ${t.name} {`);
    for (const c of t.cols) lines.push(`  ${c.name}: ${c.type};`);
    lines.push("}", "");
  }
  lines.push("export interface DB {");
  for (const t of tables) lines.push(`  ${t.name}: ${t.name};`);
  lines.push("}", "");

  await writeFile(OUT, lines.join("\n"), "utf8");
  const empty = tables.filter((t) => !t.cols.length);
  console.log(`已生成 src/types/database.d.ts：${tables.length} 张表，其中迁移补列 ${added} 个`);
  if (empty.length) console.warn(`⚠️ 解析不出列的（需人工看一眼）：${empty.map((t) => t.name).join(", ")}`);
}

// 项目是 CommonJS 产物，不能用顶层 await
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
