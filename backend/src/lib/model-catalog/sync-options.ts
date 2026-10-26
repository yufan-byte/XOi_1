import type { PricingRow } from "./index";

/** Only quarantine a newly added, explicitly rejected task model. Never suppress other validation failures. */
export function unsupportedNewTaskModel(error: unknown, existing: Set<string>, source: PricingRow[], allowExisting = false): string | undefined {
  const message = error instanceof Error ? error.message : "";
  if (!message.includes("has no task plugin usage schema")) return;
  const name = message.match(/model ([^\s:]+): expression references usage keys/)?.[1];
  return name && (allowExisting || !existing.has(name)) && source.some(row => row.model_name === name) ? name : undefined;
}

/** The agreed reference-video surcharge applies to the three promoted per-second routes.
 * Some upstream public expressions omit it; enforce it in gateway billing, not just the UI.
 */
export function referenceVideoBillingExpression(row: PricingRow): string | undefined {
  const expression = row.billing_expr;
  if (!expression || !/^seedance2\.[05]-line1(?:-fast)?(?:-xoi)?$/.test(row.model_name) || /billing_ref_video/.test(expression)) return expression;
  const last = expression.lastIndexOf(";");
  return `${last >= 0 ? expression.slice(0, last + 1) : ""} (${expression.slice(last + 1)}) * (u("billing_ref_video") == "true" ? 1.5 : 1)`;
}

/** NewAPI uses membership in ModelPrice (including zero), not its value, to select per-request billing. */
export function buildPricingOptions(options: Record<string, string>, rows: PricingRow[], factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) throw new Error("上游计费倍率无效");
  const maps: Record<string, Record<string, any>> = {};
  for (const key of ["ModelRatio", "CompletionRatio", "ModelPrice", "CacheRatio", "CreateCacheRatio", "billing_setting.billing_expr", "billing_setting.billing_mode"]) {
    maps[key] = JSON.parse(options[key] || "{}");
    if (!maps[key] || Array.isArray(maps[key]) || typeof maps[key] !== "object") throw new Error(`价格配置 ${key} 无效`);
  }
  const number = (value: unknown, fallback: number) => {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error("上游价格无效，已保留现有配置");
    return parsed;
  };
  for (const row of rows) {
    const name = row.model_name;
    const price = number(row.model_price, 0);
    maps.ModelRatio[name] = number(row.model_ratio, 0) * factor;
    maps.CompletionRatio[name] = number(row.completion_ratio, 1);
    if (Number(row.quota_type) === 1 || price > 0) maps.ModelPrice[name] = price * factor;
    else delete maps.ModelPrice[name]; // Also repairs stale zero entries created by older syncs.
    for (const [option, field] of [["CacheRatio", "cache_ratio"], ["CreateCacheRatio", "create_cache_ratio"]]) {
      const value = (row as any)[field];
      if (value !== undefined && value !== null) maps[option][name] = number(value, 0);
      else delete maps[option][name];
    }
    const expression = referenceVideoBillingExpression(row);
    if (expression) {
      const last = expression.lastIndexOf(";");
      maps["billing_setting.billing_expr"][name] = factor === 1 ? expression : `${last >= 0 ? expression.slice(0, last + 1) : ""} (${expression.slice(last + 1)}) * ${factor}`;
    } else delete maps["billing_setting.billing_expr"][name];
    if (row.billing_mode) maps["billing_setting.billing_mode"][name] = row.billing_mode;
    else delete maps["billing_setting.billing_mode"][name];
  }
  // Retail GroupRatio/GroupGroupRatio and models belonging to other channels are untouched.
  return maps;
}
