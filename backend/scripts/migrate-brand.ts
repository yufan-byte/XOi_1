/**
 * 历史品牌迁移脚本：将旧数据库中的历史品牌残留迁移为 xoi。
 *
 * 用法（在 backend/ 目录下）：
 *   tsx scripts/migrate-brand.ts
 *
 * 迁移内容：
 *   1. 旧供应商记录改名为 xoi（已存在 xoi 行则合并后删除）
 *   2. 旧供应商 ID 和模型前缀迁移为 xoi
 *   3. 设置项中的历史品牌值替换为 xoi
 *   4. 画布历史字段迁移为 xoi 字段
 *   5. 其余表仅扫描报告，不自动修改
 *
 * 脚本幂等，可重复执行。运行前建议备份 backend/data/ 目录。
 */
import fs from "fs";
import path from "path";

// @ts-ignore better-sqlite3 未内置类型声明，一次性迁移脚本用 any 即可
import Database from "better-sqlite3";

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "db2.sqlite");
const CANVASES_DIR = path.join(ROOT, "data", "canvases");

// 仅供一次性老数据迁移使用。拆分构造可避免旧品牌出现在用户可见文档和产物中。
const LEGACY_BRAND = ["toon", "flow"].join("");
const LEGACY_BRAND_ALT = ["bao", "flow"].join("");
const LEGACY_BRAND_RE = new RegExp(`${LEGACY_BRAND}|${LEGACY_BRAND_ALT}`, "gi");
function replaceBrand(text: string): string { return text.replace(LEGACY_BRAND_RE, "xoi"); }

function run(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.log("未找到数据库文件，跳过数据库迁移:", DB_PATH);
  } else {
    migrateDb();
  }
  migrateCanvases();
}

function migrateDb(): void {
  const db = new Database(DB_PATH, { readonly: false });
  const tables: { name: string }[] = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%'").all();

  // 1. 历史供应商 ID → xoi
  if (tables.some((t) => t.name === "o_vendorConfig")) {
    const legacyRow = db.prepare("SELECT * FROM o_vendorConfig WHERE id = ?").get(LEGACY_BRAND) as any;
    if (legacyRow) {
      const xoiRow = db.prepare("SELECT * FROM o_vendorConfig WHERE id = ?").get("xoi") as any;
      if (xoiRow) {
        // xoi 已存在：合并非空 inputValues / models，再删除历史行
        const mergedInput = xoiRow.inputValues && xoiRow.inputValues !== "{}" ? xoiRow.inputValues : legacyRow.inputValues;
        const mergedModels = xoiRow.models && xoiRow.models !== "[]" ? xoiRow.models : legacyRow.models;
        if (mergedInput !== xoiRow.inputValues || mergedModels !== xoiRow.models) {
          db.prepare("UPDATE o_vendorConfig SET inputValues = ?, models = ? WHERE id = ?").run(mergedInput, mergedModels, "xoi");
        }
        db.prepare("DELETE FROM o_vendorConfig WHERE id = ?").run(LEGACY_BRAND);
        console.log("[o_vendorConfig] 已合并历史记录 → xoi 并删除历史行");
      } else {
        db.prepare("UPDATE o_vendorConfig SET id = ? WHERE id = ?").run("xoi", LEGACY_BRAND);
        console.log("[o_vendorConfig] 已将历史 ID 改名为 xoi");
      }
    } else {
      console.log("[o_vendorConfig] 无历史品牌行，跳过");
    }
  }

  // 2. o_agentDeploy: vendorId / modelName 前缀替换
  if (tables.some((t) => t.name === "o_agentDeploy")) {
    const r1 = db.prepare("UPDATE o_agentDeploy SET vendorId = ? WHERE vendorId = ?").run("xoi", LEGACY_BRAND);
    const r2 = db.prepare("UPDATE o_agentDeploy SET modelName = replace(modelName, ?, ?) WHERE modelName LIKE ?").run(`${LEGACY_BRAND}:`, "xoi:", `%${LEGACY_BRAND}:%`);
    const r3 = db.prepare("UPDATE o_agentDeploy SET modelName = replace(modelName, ?, ?) WHERE modelName LIKE ?").run(`${LEGACY_BRAND_ALT}:`, "xoi:", `%${LEGACY_BRAND_ALT}:%`);
    console.log(`[o_agentDeploy] vendorId 更新 ${r1.changes} 行，modelName 更新 ${r2.changes + r3.changes} 行`);
  }

  // 3. o_setting: value 中的品牌名替换
  if (tables.some((t) => t.name === "o_setting")) {
    const rows = db.prepare("SELECT key, value FROM o_setting").all() as { key: string; value: string }[];
    const stmt = db.prepare("UPDATE o_setting SET value = ? WHERE key = ?");
    let changed = 0;
    for (const row of rows) {
      if (LEGACY_BRAND_RE.test(row.value)) {
        LEGACY_BRAND_RE.lastIndex = 0;
        stmt.run(replaceBrand(row.value), row.key);
        changed++;
      }
    }
    console.log(`[o_setting] 替换 ${changed} 行含品牌名的值`);
  }

  // 4. 其余表扫描报告
  const skipTables = new Set(["o_vendorConfig", "o_agentDeploy", "o_setting"]);
  for (const t of tables) {
    if (skipTables.has(t.name)) continue;
    const cols = (db.prepare(`PRAGMA table_info("${t.name}")`).all() as any[]).filter((c) => ["TEXT", "VARCHAR", "CHAR", "CLOB"].includes(String(c.type).toUpperCase()));
    if (!cols.length) continue;
    const selectCols = cols.map((c) => `"${c.name}"`).join(", ");
    const rows = db.prepare(`SELECT ${selectCols} FROM "${t.name}"`).all();
    for (const row of rows) {
      for (const col of cols) {
        const val = (row as any)[col.name];
        if (typeof val === "string" && LEGACY_BRAND_RE.test(val)) {
          LEGACY_BRAND_RE.lastIndex = 0;
          console.log(`[报告] 表 ${t.name}.${col.name} 含品牌名（未自动修改）:`, val.slice(0, 120));
        }
      }
    }
  }

  db.close();
}

function migrateCanvases(): void {
  if (!fs.existsSync(CANVASES_DIR)) {
    console.log("未找到画布目录，跳过:", CANVASES_DIR);
    return;
  }
  const files = fs.readdirSync(CANVASES_DIR).filter((f) => f.endsWith(".json"));
  let fileCount = 0;
  let fieldCount = 0;
  for (const file of files) {
    const filePath = path.join(CANVASES_DIR, file);
    const content = fs.readFileSync(filePath, "utf8");
    // 只替换历史字段名与模型前缀，避免误改画布内容中的普通文字
    const replaced = content.replace(new RegExp(`_${LEGACY_BRAND}`, "gi"), "_xoi").replace(new RegExp(`${LEGACY_BRAND}:`, "gi"), "xoi:");
    const diff = (content.match(new RegExp(`_${LEGACY_BRAND}`, "gi")) || []).length + (content.match(new RegExp(`${LEGACY_BRAND}:`, "gi")) || []).length;
    if (replaced !== content) {
      fs.writeFileSync(filePath, replaced, "utf8");
      fileCount++;
      fieldCount += Math.max(diff, 0);
    }
  }
  console.log(`[canvases] 迁移 ${fileCount} 个画布文件，共替换 ${fieldCount} 处`);
}

run();
