// Operator-run read-only verification. Does not initialize schema, touch balances,
// print customer records or issue gateway/model requests.
import pg from "pg";
import { usageAttributionQuery, usageSource } from "../src/utils/usageAttribution";
const username = process.argv[2];
if (!username) throw Error("Pass the test account username");
const client = new pg.Client({ connectionString: process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL });
async function main() {
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout='3s'");
  const user = (await client.query("SELECT id FROM users WHERE username=$1 AND deleted_at IS NULL", [username])).rows[0];
  if (!user) throw Error("Test account not found");
  const rows = (await client.query("SELECT request_id FROM logs WHERE user_id=$1 AND type=2 ORDER BY id DESC LIMIT 20", [user.id])).rows;
  if (!rows.length) throw Error("No existing test records; this check does not generate any");
  const ids = rows.map(row => row.request_id);
  let slot = 0;
  const sql = usageAttributionQuery(ids.length).replaceAll("?", () => `$${++slot}`);
  const links = (await client.query(sql, [user.id, ...ids])).rows;
  const grouped = new Map<string, { billing_id: string; operation_path: string }[]>();
  for (const row of links) grouped.set(row.request_id, [...(grouped.get(row.request_id) || []), row]);
  // Identical log IDs under a non-owner must never return provenance.
  const other = (await client.query("SELECT id FROM users WHERE id<>$1 AND deleted_at IS NULL LIMIT 1", [user.id])).rows[0];
  const isolated = (await client.query(sql, [other?.id || -1, ...ids])).rows.length === 0;
  if (!isolated) throw Error("Usage attribution ownership check failed");
  const recorded = ids.filter(id => usageSource(grouped.get(id) || []).status === "recorded").length;
  await client.query("ROLLBACK");
  console.log(JSON.stringify({ readOnly: true, sampled: ids.length, recorded, unknown: ids.length - recorded, crossUserIsolation: isolated, modelRequests: 0 }));
} finally { await client.end(); }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
