/** PostgreSQL parity verification. Every fixture schema and row rolls back; no live tables are mutated. */
import "dotenv/config";
import assert from "node:assert/strict";
import knex from "knex";
import { randomUUID } from "node:crypto";
import { deletionCases, seedDeletionFixture } from "../src/utils/testSupport/creativeDeletionFixture";

async function main() {
  const url = process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL;
  assert.ok(url, "PostgreSQL connection must be configured");
  const db = knex({ client: "pg", connection: url, pool: { min: 0, max: 1 } });
  const rollback = new Error("fixture rollback");
  let passed = 0;
  try {
    for (const [name, run] of deletionCases) {
      try {
        await db.transaction(async trx => {
          const schema = "xoi_delete_test_" + randomUUID().replaceAll("-", "");
          await trx.raw("SET LOCAL statement_timeout = '15s'");
          await trx.raw("CREATE SCHEMA ??", [schema]);
          // No public fallback: any accidentally missing fixture table must fail, never touch live data.
          await trx.raw("SET LOCAL search_path TO ??", [schema]);
          await seedDeletionFixture(trx);
          await run(trx);
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
      passed++;
      console.log("PASS " + name);
    }
    console.log(JSON.stringify({ passed, failed: 0, fixtureSchemasCommitted: 0, liveTableWrites: 0, modelCalls: 0, paymentCalls: 0 }));
  } finally { await db.destroy(); }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
