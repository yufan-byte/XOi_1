import assert from "node:assert/strict";
import type { Knex } from "knex";
import { CreativeDeleteError, deleteOwnedEvents, deleteOwnedNovels, deleteOwnedProject, deleteOwnedScripts } from "../creativeDeletion";

/** Minimal relational fixture. This must only run on an isolated database/schema. */
export async function seedDeletionFixture(db: Knex) {
  await db.schema.createTable("o_project", t => { t.integer("id").primary(); t.integer("userId"); });
  await db.schema.createTable("o_novel", t => { t.integer("id").primary(); t.integer("projectId"); t.integer("eventState"); });
  await db.schema.createTable("o_event", t => { t.integer("id").primary(); });
  await db.schema.createTable("o_eventChapter", t => {
    t.integer("id").primary(); t.integer("eventId").references("o_event.id"); t.integer("novelId").references("o_novel.id");
  });
  await db.schema.createTable("o_script", t => { t.integer("id").primary(); t.integer("projectId"); t.integer("extractState"); });
  await db.schema.createTable("o_image", t => { t.integer("id").primary(); t.integer("assetsId"); t.text("state"); });
  await db.schema.createTable("o_assets", t => {
    t.integer("id").primary(); t.integer("projectId"); t.integer("scriptId"); t.integer("imageId").references("o_image.id"); t.text("promptState");
  });
  for (const table of ["o_storyboard", "o_video", "o_videoTrack"]) await db.schema.createTable(table, t => {
    t.integer("id").primary(); t.integer("projectId"); t.integer("scriptId"); t.text("state");
  });
  await db.schema.createTable("o_output", t => { t.integer("id").primary(); t.integer("projectId"); t.integer("scriptId"); t.integer("episodesId"); });
  await db.schema.createTable("o_agentWorkData", t => { t.integer("id").primary(); t.integer("projectId"); t.integer("episodesId"); });
  await db.schema.createTable("o_tasks", t => { t.integer("id").primary(); t.integer("projectId"); t.text("state"); });
  await db.schema.createTable("o_scriptAssets", t => { t.integer("scriptId"); t.integer("assetId"); t.primary(["scriptId", "assetId"]); });
  await db.schema.createTable("o_assets2Storyboard", t => { t.integer("storyboardId"); t.integer("assetId"); t.primary(["storyboardId", "assetId"]); });
  await db.schema.createTable("o_assetsRole2Audio", t => { t.integer("assetsRoleId"); t.integer("assetsAudioId"); t.primary(["assetsRoleId", "assetsAudioId"]); });
  await db.schema.createTable("memories", t => { t.text("id").primary(); t.text("isolationKey"); });
  // Independent canvas and financial evidence must never be removed by creative cleanup.
  for (const table of ["o_imageFlow", "o_quota_ledger", "xoi_model_budgets"]) await db.schema.createTable(table, t => { t.integer("id").primary(); t.integer("projectId"); });

  await db("o_project").insert([{ id: 1, userId: 10 }, { id: 2, userId: 10 }, { id: 3, userId: 20 }]);
  await db("o_novel").insert([{ id: 11, projectId: 1, eventState: 1 }, { id: 12, projectId: 1, eventState: 1 }, { id: 31, projectId: 3, eventState: 1 }]);
  await db("o_event").insert([71, 72, 73, 900].map(id => ({ id })));
  // Deliberately different association/event IDs; event 900 belongs to the other user.
  await db("o_eventChapter").insert([
    { id: 900, eventId: 71, novelId: 11 }, { id: 901, eventId: 72, novelId: 11 },
    { id: 902, eventId: 72, novelId: 12 }, { id: 903, eventId: 73, novelId: 12 },
    { id: 904, eventId: 73, novelId: 31 }, { id: 905, eventId: 900, novelId: 31 },
  ]);
  await db("o_script").insert([{ id: 101, projectId: 1, extractState: 1 }, { id: 102, projectId: 1, extractState: 1 }, { id: 301, projectId: 3, extractState: 1 }]);
  await db("o_image").insert([{ id: 501, assetsId: 401, state: "生成成功" }, { id: 503, assetsId: 403, state: "生成成功" }]);
  await db("o_assets").insert([
    { id: 401, projectId: 1, scriptId: 101, imageId: 501, promptState: "已完成" },
    { id: 402, projectId: 1, scriptId: null, imageId: null, promptState: "已完成" },
    { id: 403, projectId: 3, scriptId: 301, imageId: 503, promptState: "已完成" },
  ]);
  for (const table of ["o_storyboard", "o_video", "o_videoTrack"]) await db(table).insert([
    { id: 601, projectId: 1, scriptId: 101, state: "已完成" }, { id: 602, projectId: 1, scriptId: 102, state: "已完成" },
    { id: 603, projectId: 3, scriptId: 301, state: "已完成" },
  ]);
  await db("o_scriptAssets").insert([{ scriptId: 101, assetId: 401 }, { scriptId: 102, assetId: 401 }, { scriptId: 301, assetId: 403 }]);
  await db("o_assets2Storyboard").insert([{ storyboardId: 601, assetId: 401 }, { storyboardId: 602, assetId: 401 }, { storyboardId: 603, assetId: 403 }]);
  await db("o_assetsRole2Audio").insert([{ assetsRoleId: 401, assetsAudioId: 402 }, { assetsRoleId: 403, assetsAudioId: 403 }]);
  for (const table of ["o_output", "o_agentWorkData"]) await db(table).insert([
    { id: 701, projectId: 1, episodesId: 101, ...(table === "o_output" ? { scriptId: null } : {}) },
    { id: 702, projectId: 1, episodesId: 102, ...(table === "o_output" ? { scriptId: 102 } : {}) },
    { id: 703, projectId: 3, episodesId: 301, ...(table === "o_output" ? { scriptId: 301 } : {}) },
  ]);
  await db("o_tasks").insert([{ id: 801, projectId: 1, state: "已完成" }, { id: 803, projectId: 3, state: "进行中" }]);
  await db("memories").insert([
    { id: "a", isolationKey: "1:productionAgent:101" }, { id: "b", isolationKey: "1:productionAgent:102" },
    { id: "c", isolationKey: "1:scriptAgent" }, { id: "d", isolationKey: "3:productionAgent:301" },
    { id: "e", isolationKey: "10:productionAgent:101" },
  ]);
  for (const table of ["o_imageFlow", "o_quota_ledger", "xoi_model_budgets"]) await db(table).insert({ id: 1, projectId: 1 });
}

const tables = ["o_project", "o_novel", "o_event", "o_eventChapter", "o_script", "o_image", "o_assets", "o_storyboard", "o_video", "o_videoTrack", "o_output", "o_agentWorkData", "o_tasks", "o_scriptAssets", "o_assets2Storyboard", "o_assetsRole2Audio", "memories", "o_imageFlow", "o_quota_ledger", "xoi_model_budgets"];
async function snapshot(db: Knex) {
  const result: Record<string, string[]> = {};
  for (const table of tables) result[table] = (await db(table).select()).map(row => JSON.stringify(row)).sort();
  return result;
}
async function rejectedUnchanged(db: Knex, work: () => Promise<unknown>, status: number) {
  const before = await snapshot(db);
  await assert.rejects(work, error => error instanceof CreativeDeleteError && error.status === status);
  assert.deepEqual(await snapshot(db), before);
}
async function injectDeleteFailure(db: Knex, table: "o_project" | "o_novel" | "o_script") {
  if (db.client.config.client === "pg") {
    await db.raw("CREATE FUNCTION fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected deletion failure'; END; $$");
    await db.raw("CREATE TRIGGER fail_delete BEFORE DELETE ON ?? FOR EACH ROW EXECUTE FUNCTION fail_delete()", [table]);
  } else {
    await db.raw("CREATE TRIGGER fail_delete BEFORE DELETE ON ?? BEGIN SELECT RAISE(ABORT, 'injected deletion failure'); END", [table]);
  }
}

export const deletionCases: Array<[string, (db: Knex) => Promise<void>]> = [
  ["chapter deletion uses eventId and preserves unrelated user event", async db => {
    await deleteOwnedNovels(db, 10, [11]);
    assert.equal(await db("o_event").where("id", 71).first(), undefined);
    assert.ok(await db("o_event").where("id", 900).first());
    assert.ok(await db("o_eventChapter").where({ eventId: 900, novelId: 31 }).first());
  }],
  ["shared events survive until their final chapter association is removed", async db => {
    await deleteOwnedNovels(db, 10, [11]);
    assert.ok(await db("o_event").where("id", 72).first());
    await deleteOwnedNovels(db, 10, [12]);
    assert.equal(await db("o_event").where("id", 72).first(), undefined);
    assert.ok(await db("o_event").where("id", 73).first()); // Other user's chapter still refers to it.
  }],
  ["foreign chapter in a mixed batch rejects the whole request", async db => {
    await rejectedUnchanged(db, () => deleteOwnedNovels(db, 10, [11, 31]), 403);
  }],
  ["event deletion respects association foreign keys", async db => {
    await deleteOwnedEvents(db, 10, [71, 72]);
    assert.equal((await db("o_event").whereIn("id", [71, 72])).length, 0);
    assert.equal((await db("o_eventChapter").whereIn("eventId", [71, 72])).length, 0);
  }],
  ["shared foreign events cannot be removed", async db => {
    await rejectedUnchanged(db, () => deleteOwnedEvents(db, 10, [73]), 403);
  }],
  ["episode deletion removes outputs/tracks/context and preserves shared assets", async db => {
    await deleteOwnedScripts(db, 10, [101]);
    for (const table of ["o_script", "o_storyboard", "o_video", "o_videoTrack"]) {
      assert.equal((await db(table).where(table === "o_script" ? "id" : "scriptId", 101)).length, 0);
      assert.ok(await db(table).where(table === "o_script" ? "id" : "scriptId", 102).first());
    }
    assert.equal(await db("o_output").where("id", 701).first(), undefined);
    assert.ok(await db("o_output").where("id", 702).first());
    assert.equal(await db("o_agentWorkData").where("id", 701).first(), undefined);
    assert.equal((await db("o_assets").where("id", 401).first()).scriptId, null);
    assert.ok(await db("o_image").where("id", 501).first());
    assert.ok(await db("o_scriptAssets").where({ scriptId: 102, assetId: 401 }).first());
    assert.ok(await db("o_assets2Storyboard").where({ storyboardId: 602, assetId: 401 }).first());
    assert.equal(await db("memories").where("id", "a").first(), undefined);
    assert.ok(await db("memories").where("id", "b").first());
    assert.ok(await db("memories").where("id", "c").first());
  }],
  ["project deletion removes creative metadata and preserves financial/canvas/foreign data", async db => {
    await deleteOwnedProject(db, 10, 1);
    for (const table of ["o_novel", "o_script", "o_assets", "o_storyboard", "o_video", "o_videoTrack", "o_output", "o_agentWorkData", "o_tasks"]) assert.equal((await db(table).where("projectId", 1)).length, 0, table);
    assert.equal(await db("o_project").where("id", 1).first(), undefined);
    assert.ok(await db("o_project").where("id", 3).first());
    assert.equal((await db("o_assetsRole2Audio")).length, 1);
    assert.equal((await db("o_scriptAssets")).length, 1);
    assert.equal((await db("o_assets2Storyboard")).length, 1);
    assert.equal(await db("o_image").where("id", 501).first(), undefined);
    assert.ok(await db("o_image").where("id", 503).first());
    assert.equal(await db("o_event").where("id", 71).first(), undefined);
    assert.equal(await db("o_event").where("id", 72).first(), undefined);
    assert.ok(await db("o_event").where("id", 73).first());
    assert.equal((await db("memories")).length, 2);
    for (const table of ["o_imageFlow", "o_quota_ledger", "xoi_model_budgets"]) assert.equal((await db(table)).length, 1, table);
  }],
  ["project final delete failure rolls back every preceding mutation", async db => {
    await injectDeleteFailure(db, "o_project");
    const before = await snapshot(db);
    await assert.rejects(() => deleteOwnedProject(db, 10, 1), /injected deletion failure/);
    assert.deepEqual(await snapshot(db), before);
  }],
  ["chapter final delete failure restores removed event links and orphan events", async db => {
    await injectDeleteFailure(db, "o_novel");
    const before = await snapshot(db);
    await assert.rejects(() => deleteOwnedNovels(db, 10, [11]), /injected deletion failure/);
    assert.deepEqual(await snapshot(db), before);
  }],
  ["invalid IDs and oversized batches are rejected without mutation", async db => {
    for (const ids of [[], [0], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 1], Array(501).fill(11)]) await rejectedUnchanged(db, () => deleteOwnedNovels(db, 10, ids), 400);
  }],
  ["missing item in a batch never allows partial deletion", async db => {
    await rejectedUnchanged(db, () => deleteOwnedNovels(db, 10, [11, 999]), 404);
    await rejectedUnchanged(db, () => deleteOwnedScripts(db, 10, [101, 999]), 404);
  }],
  ["foreign project deletion is denied", async db => {
    await rejectedUnchanged(db, () => deleteOwnedProject(db, 10, 3), 403);
  }],
  ["persisted generation/extraction prevents destructive project cleanup", async db => {
    for (const [table, field, value, normal] of [
      ["o_tasks", "state", "unknown", "已完成"], ["o_novel", "eventState", 0, 1],
      ["o_script", "extractState", 0, 1], ["o_script", "extractState", 2, 1],
      ["o_assets", "promptState", "生成中", "已完成"], ["o_storyboard", "state", "生成中", "已完成"],
      ["o_video", "state", "生成中", "已完成"], ["o_videoTrack", "state", "生成中", "已完成"],
    ] as const) {
      await db(table).where("projectId", 1).update({ [field]: value });
      await rejectedUnchanged(db, () => deleteOwnedProject(db, 10, 1), 409);
      await db(table).where("projectId", 1).update({ [field]: normal });
    }
    await db("o_image").where("id", 501).update({ state: "生成中" });
    await rejectedUnchanged(db, () => deleteOwnedProject(db, 10, 1), 409);
  }],
  ["duplicate IDs delete the chosen item once", async db => {
    await deleteOwnedNovels(db, 10, [11, 11]);
    assert.equal(await db("o_novel").where("id", 11).first(), undefined);
    assert.ok(await db("o_novel").where("id", 12).first());
  }],
  ["mixed event permissions fail atomically", async db => {
    await rejectedUnchanged(db, () => deleteOwnedEvents(db, 10, [71, 900]), 403);
  }],
  ["episode final delete failure restores outputs and shared asset references", async db => {
    await injectDeleteFailure(db, "o_script");
    const before = await snapshot(db);
    await assert.rejects(() => deleteOwnedScripts(db, 10, [101]), /injected deletion failure/);
    assert.deepEqual(await snapshot(db), before);
  }],
  ["unrelated busy projects do not block deletion", async db => {
    await deleteOwnedProject(db, 10, 2);
    assert.equal(await db("o_project").where("id", 2).first(), undefined);
    assert.ok(await db("o_tasks").where({ projectId: 3, state: "进行中" }).first());
  }],
  ["busy projects also protect chapter, episode and event deletion", async db => {
    await db("o_tasks").where("projectId", 1).update({ state: "进行中" });
    await rejectedUnchanged(db, () => deleteOwnedNovels(db, 10, [11]), 409);
    await rejectedUnchanged(db, () => deleteOwnedScripts(db, 10, [101]), 409);
    await rejectedUnchanged(db, () => deleteOwnedEvents(db, 10, [71]), 409);
  }],
];
