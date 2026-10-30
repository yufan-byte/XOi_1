/**
 * 一次性清理：把网关 billing_expr / billing_mode 里「本实例插件根本承载不了」的条目删掉。
 *
 * 为什么必须动库：new-api 保存 option 时会拿**所有服务该模型的插件**的 usageSchema 校验表达式，
 * 只要有一条不合法，任何价格写入（连 ModelRatio）都会被 400 拒掉 —— 于是目录永久停更。
 * 而删掉这条脏数据又必须「模式 + 表达式」成对写，单写任何一个都会触发
 * "billing expression is required"，形成死锁。只能直接改库再重启网关。
 *
 * 先备份到 backend/data/backups/billing-<ts>.json，可完整回滚。
 */
import "dotenv/config";
import "@/utils";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/utils/db";
import { loadUsageCapability, sanitizeExpressions } from "@/lib/model-catalog/plugin-usage";

const EXPR_KEY = "billing_setting.billing_expr";
const MODE_KEY = "billing_setting.billing_mode";
const KEYS: string[] = [EXPR_KEY, MODE_KEY];

(async () => {
  const rows = await db.raw("SELECT key, value FROM options WHERE key = ANY(?)", [KEYS]);
  const current: Record<string, string> = {};
  for (const r of rows.rows) current[r.key] = r.value;

  const expr = JSON.parse(current["billing_setting.billing_expr"] || "{}") as Record<string, string>;
  const mode = JSON.parse(current["billing_setting.billing_mode"] || "{}") as Record<string, string>;
  console.log("清理前: 表达式", Object.keys(expr).length, "条 | 模式", Object.keys(mode).length, "条");

  const capability = await loadUsageCapability(true);
  const maps: Record<string, Record<string, unknown>> = {
    "billing_setting.billing_expr": { ...expr },
    "billing_setting.billing_mode": { ...mode },
  };
  const dropped = sanitizeExpressions(maps, capability);
  const nextExpr = maps["billing_setting.billing_expr"] as Record<string, string>;
  const nextMode = maps["billing_setting.billing_mode"] as Record<string, string>;
  console.log("需剔除:", dropped.length, "条");
  for (const d of dropped) console.log("   -", d.model, "→", d.reason);
  console.log("清理后: 表达式", Object.keys(nextExpr).length, "条 | 模式", Object.keys(nextMode).length, "条");

  if (!dropped.length) {
    console.log("没有需要清理的条目，退出");
    process.exit(0);
  }

  const dir = path.resolve("data/backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `billing-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(current, null, 2), "utf8");
  console.log("已备份:", file);

  for (const key of KEYS) {
    const value = key === EXPR_KEY ? JSON.stringify(nextExpr) : JSON.stringify(nextMode);
    await db.raw("UPDATE options SET value = ? WHERE key = ?", [value, key]);
  }
  console.log("已写回 options；下一步重启 new-api 让内存配置重载");
  process.exit(0);
})();
