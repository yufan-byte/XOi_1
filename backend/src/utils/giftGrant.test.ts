import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import { grantGift } from "./giftGrant";

test("concurrent/retried gift requests grant once and keep frozen balance intact", async () => {
  const db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
  try {
    await db.schema.createTable("o_user", (t) => { t.integer("id").primary(); t.integer("points"); });
    await db.schema.createTable("o_points_account", (t) => {
      t.integer("user_id").unique(); t.integer("balance"); t.integer("frozen_balance"); t.integer("version");
      t.text("created_at"); t.text("updated_at");
    });
    await db.schema.createTable("o_points_log", (t) => {
      t.increments("id"); t.integer("user_id"); t.integer("amount"); t.text("type");
      t.integer("operator_id"); t.text("description"); t.text("created_at");
    });
    await db.schema.createTable("o_points_ledger", (t) => {
      t.increments("id"); t.integer("user_id"); t.integer("amount"); t.integer("balance_after"); t.text("type");
      t.text("reference_type"); t.text("idempotency_key").unique(); t.integer("operator_id"); t.text("description"); t.text("created_at");
    });
    await db("o_user").insert({ id: 2, points: 50 });
    await db("o_points_account").insert({ user_id: 2, balance: 50, frozen_balance: 12, version: 1 });
    const input = { userId: 2, operatorId: 1, points: 100, requestId: "stable-request-id" };
    await Promise.all(Array.from({ length: 8 }, () => grantGift(db, input)));
    assert.equal((await db("o_user").first()).points, 150);
    assert.equal((await db("o_points_account").first()).frozen_balance, 12);
    assert.equal((await db("o_points_ledger")).length, 1);
    assert.equal((await db("o_points_log")).length, 1);
    await assert.rejects(grantGift(db, { ...input, points: 200 }));
    await assert.rejects(grantGift(db, { ...input, points: NaN, requestId: "bad" }));
    await assert.rejects(grantGift(db, { ...input, userId: 900, requestId: "missing-user" }));
    await db.raw("CREATE TRIGGER fail_gift BEFORE INSERT ON o_points_log BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await assert.rejects(grantGift(db, { ...input, requestId: "fail-transaction" }));
    assert.equal((await db("o_user").first()).points, 150);
    assert.equal((await db("o_points_account").first()).balance, 150);
  } finally { await db.destroy(); }
});
