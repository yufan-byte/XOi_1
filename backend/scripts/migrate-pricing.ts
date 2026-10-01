/**
 * P2B-8 计费骨架迁移脚本(幂等)
 *
 * 为既有线上库补齐差异化计费所需 schema：
 *   1. 若不存在则创建 o_points_price_override 表 + 索引，并播种两行示意数据
 *   2. 为 o_points_log 补充 vendor_id / model_name 两审计列(SQLite ALTER TABLE ADD COLUMN，
 *      先用 PRAGMA table_info 探测列是否已存在避免重复 ADD 抛错)
 *
 * 用法（在 backend/ 目录下）：
 *   tsx scripts/migrate-pricing.ts
 *
 * 运行前建议备份：cp data/db2.sqlite data/db2.sqlite.pre-P2B8.bak
 * 脚本可重复执行不会产生 duplicate-column / table-exists 异常。
 */
import fs from "fs";
import path from "path";

// @ts-ignore better-sqlite3 未内置类型声明，一次性迁移脚本用 any 即可
import Database from "better-sqlite3";

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "db2.sqlite");

function columnExists(db: any, table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === col);
}

function tableExists(db: any, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
  return !!row;
}

function migrate(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.log("[migrate-pricing] 未找到数据库文件，跳过:", DB_PATH);
    return;
  }
  const db = new Database(DB_PATH, { readonly: false });

  // ── 1) 创建 o_points_price_override 表（IF NOT EXISTS）────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS o_points_price_override (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      base_action TEXT    NOT NULL,
      vendor_id   TEXT    NOT NULL,
      model_name  TEXT,
      multiplier  REAL    DEFAULT 1.0,
      description TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pricing_override_action_vendor
      ON o_points_price_override (base_action, vendor_id);
  `);

  const seedRows: Array<{ base_action: string; vendor_id: string; multiplier: number; description?: string }> = [
    { base_action: "image_generate", vendor_id: "xoi", multiplier: 1.0, description: "XOi 中转默认基线倍率" },
    { base_action: "text_generate", vendor_id: "deepseek", multiplier: 0.8, description: "DeepSeek 直连文本示例优惠" },
  ];
  for (const r of seedRows) {
    const exists = db
      .prepare("SELECT id FROM o_points_price_override WHERE base_action=? AND vendor_id=? AND model_name IS NULL")
      .get(r.base_action, r.vendor_id);
    if (!exists) {
      db.prepare(
        "INSERT INTO o_points_price_override (base_action,vendor_id,model_name,multiplier,description) VALUES (?,?,NULL,?,?)"
      ).run(r.base_action, r.vendor_id, r.multiplier, r.description ?? null);
    }
  }

  // ── 2) 给 o_points_log 补审计列(ALTER TABLE 幂等)───────────────────────────
  if (tableExists(db, "o_points_log")) {
    if (!columnExists(db, "o_points_log", "vendor_id")) {
      db.exec("ALTER TABLE o_points_log ADD COLUMN vendor_id TEXT");
      console.log("[migrate-pricing] 已为 o_points_log 添加 vendor_id 列");
    }
    if (!columnExists(db, "o_points_log", "model_name")) {
      db.exec("ALTER TABLE o_points_log ADD COLUMN model_name TEXT");
      console.log("[migrate-pricing] 已为 o_points_log 添加 model_name 列");
    }
  } else {
    console.log("[migrate-pricing] o_points_log 尚不存在(空库首次启动由 initDB 建表)，跳过加列");
  }

  console.log("[migrate-pricing] 完成。override 表示例行数 =", seedRows.length);
}

try {
  migrate();
} catch (e) {
  console.error("[migrate-pricing] 失败:", e);
  process.exitCode = 1;
}
