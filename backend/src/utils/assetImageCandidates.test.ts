import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import { adoptImageCandidate, createBatchImagePlaceholders } from "./assetImageCandidates";

test("batch candidates preserve the current image until a completed result is explicitly adopted", async (t) => {
  const db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
  t.after(() => db.destroy());
  await db.schema.createTable("o_assets", (table) => { table.integer("id").primary(); table.integer("projectId"); table.integer("imageId"); });
  await db.schema.createTable("o_image", (table) => { table.increments("id"); table.integer("assetsId"); table.text("type"); table.text("state"); table.text("filePath"); });
  await db("o_assets").insert([{ id: 1, projectId: 10, imageId: 7 }, { id: 2, projectId: 10, imageId: null }]);

  const [first, second] = await createBatchImagePlaceholders(db, 10, [{ id: 1, type: "role" }, { id: 2, type: "scene" }], true);
  assert.equal((await db("o_assets").where({ id: 1 }).first()).imageId, 7);
  assert.equal((await db("o_assets").where({ id: 2 }).first()).imageId, null);
  assert.equal(await adoptImageCandidate(db, { id: 1, projectId: 10, imageId: first, expectedImageId: 7 }), "invalid");
  await db("o_image").where({ id: first }).update({ state: "已完成", filePath: "/10/role/new.jpg" });
  assert.equal(await adoptImageCandidate(db, { id: 2, projectId: 10, imageId: first, expectedImageId: null }), "invalid");
  assert.equal(await adoptImageCandidate(db, { id: 1, projectId: 10, imageId: first, expectedImageId: 99 }), "conflict");
  assert.equal(await adoptImageCandidate(db, { id: 1, projectId: 10, imageId: first, expectedImageId: 7 }), "adopted");
  assert.equal((await db("o_assets").where({ id: 1 }).first()).imageId, first);
  assert.notEqual(first, second);

  const [legacy] = await createBatchImagePlaceholders(db, 10, [{ id: 2, type: "scene" }], false);
  assert.equal((await db("o_assets").where({ id: 2 }).first()).imageId, legacy);
});
