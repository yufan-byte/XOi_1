/** 幂等创建模型中心配置表，并从 o_vendorConfig.models 导入旧模型。 */
import path from "path";
import Database from "better-sqlite3";

const db = new Database(path.resolve(__dirname, "../data/db2.sqlite"));
db.exec(`CREATE TABLE IF NOT EXISTS o_model_config (
 id INTEGER PRIMARY KEY AUTOINCREMENT, vendor_id TEXT NOT NULL, model_name TEXT NOT NULL,
 model_type TEXT NOT NULL DEFAULT 'text', enabled INTEGER NOT NULL DEFAULT 1,
 is_default INTEGER NOT NULL DEFAULT 0, capabilities TEXT, health_status TEXT DEFAULT 'unknown',
 last_check_at TEXT, latency_ms INTEGER, error_message TEXT, created_at TEXT, updated_at TEXT,
 UNIQUE(vendor_id, model_name)
); CREATE INDEX IF NOT EXISTS idx_model_vendor ON o_model_config(vendor_id);`);
const vendors = db.prepare("SELECT id, enable, models FROM o_vendorConfig").all() as any[];
const insert = db.prepare(`INSERT OR IGNORE INTO o_model_config
 (vendor_id,model_name,model_type,enabled,is_default,capabilities,created_at,updated_at)
 VALUES (@vendor_id,@model_name,@model_type,@enabled,@is_default,@capabilities,@now,@now)`);
const now = new Date().toISOString();
const run = db.transaction(() => { for (const v of vendors) { let list:any[]=[]; try { list=JSON.parse(v.models||"[]"); } catch {} list.forEach((m,i)=>{ const name=typeof m==='string'?m:(m.modelName||m.name); if(!name)return; insert.run({vendor_id:v.id,model_name:name,model_type:typeof m==='string'?'text':(m.type||'text'),enabled:v.enable?1:0,is_default:i===0?1:0,capabilities:JSON.stringify(m.mode||[]),now}); }); } });
run(); db.close(); console.log("[migrate-model-config] 完成");
