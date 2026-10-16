import test from "node:test";
import knex from "knex";
import { deletionCases, seedDeletionFixture } from "./testSupport/creativeDeletionFixture";

for (const [name, run] of deletionCases) {
  test(name, async () => {
    const db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
    try {
      await db.raw("PRAGMA foreign_keys = ON");
      await seedDeletionFixture(db);
      await run(db);
    } finally { await db.destroy(); }
  });
}
