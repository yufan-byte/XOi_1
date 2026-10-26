import { billableOperation } from "../../../shared/billableOperations";
import { boundedInteger, queryText } from "./adminQuery";

/** Forward only documented read filters, never a caller-supplied user/channel ID. */
export function usageQuery(query: Record<string, unknown>, statistics = false) {
  const params = new URLSearchParams();
  if (!statistics) {
    params.set("p", String(boundedInteger(query.p, 1, 100000)));
    params.set("page_size", String(boundedInteger(query.page_size, 20, 100)));
  }
  for (const key of ["type", "start_timestamp", "end_timestamp"]) {
    const value = queryText(query[key]);
    if (/^\d{1,12}$/.test(value)) params.set(key, value);
  }
  for (const key of ["model_name", "token_name", "group"]) {
    const value = queryText(query[key]);
    if (value) params.set(key, value);
  }
  return params.toString();
}

/** Exact request links only: no model/time heuristics, no prompt or credential fields. */
export function usageAttributionQuery(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw Error("Invalid usage page size");
  return `SELECT DISTINCT l.request_id,b.billing_id,m.operation_path FROM logs l
    JOIN xoi_billing_links b ON b.request_id=l.request_id AND b.user_id=l.user_id
    JOIN xoi_model_budgets m ON m.user_id=b.user_id AND m.billing_id=b.billing_id
    WHERE l.user_id=? AND l.request_id IN (${Array(count).fill("?").join(",")}) AND l.type=2`;
}

// Gateway /log/self can replace database IDs with page ordinals. Only the
// request ID survives that privacy transformation and can identify a charge.
export function usageRequestIds(items: Record<string, unknown>[]) {
  return [...new Set(items.map(item => item.request_id).filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 180))].slice(0, 100);
}

export function usageSource(rows: { billing_id: string; operation_path: string }[]) {
  if (rows.length !== 1) return { status: "unknown" as const };
  const operation = billableOperation(rows[0].operation_path);
  return operation ? { status: "recorded" as const, label: operation.label, kind: operation.kind, billingId: rows[0].billing_id }
    : { status: "unknown" as const };
}
