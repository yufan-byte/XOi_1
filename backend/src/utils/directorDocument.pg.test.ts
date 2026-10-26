import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import knex from "knex";
import {
  saveDirectorDocument,
  type DirectorDocumentEdit,
} from "./directorDocument";
import { stageFingerprint } from "./directorStageReview";

test("manual director document edits preserve stored work and use optimistic concurrency", async (t) => {
  const url = process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL;
  if (!url) {
    t.skip("Local PostgreSQL not configured");
    return;
  }
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  );
  const schema = "xoi_document_test_" + crypto.randomBytes(8).toString("hex");
  const db = knex({
    client: "pg",
    connection: url,
    searchPath: [schema],
    pool: { min: 0, max: 3 },
  });
  let created = false;
  try {
    await db.raw("CREATE SCHEMA ??", [schema]);
    created = true;
    await db.schema.createTable("o_project", (b) => {
      b.integer("id").primary();
      b.integer("userId");
      b.text("artStyle");
      b.text("directorManual");
      b.text("videoRatio");
    });
    await db.schema.createTable("o_script", (b) => {
      b.integer("id").primary();
      b.integer("projectId");
      b.text("content");
    });
    await db.schema.createTable("o_agentWorkData", (b) => {
      b.increments("id");
      b.integer("projectId");
      b.integer("episodesId");
      b.text("key");
      b.text("data");
    });
    await db("o_project").insert([
      { id: 1, userId: 7 },
      { id: 2, userId: 8 },
    ]);
    await db("o_script").insert([
      { id: 11, projectId: 1, content: "script" },
      { id: 22, projectId: 2, content: "foreign" },
    ]);
    const original: any = {
      scriptPlan: "plan",
      storyboardTable: "table",
      reviewContext: ["", "", ""],
      assistantDraft: "keep draft",
      memory: "keep memory",
      storyboard: [{ id: 71, src: "keep.jpg", trackId: 72 }],
      workbench: { videoList: [{ id: 73 }] },
      output: [{ id: 74 }],
    };
    original.stageReviews = {
      scriptPlan: {
        fingerprint: stageFingerprint("script", original, "scriptPlan"),
      },
      storyboardTable: {
        fingerprint: stageFingerprint("script", original, "storyboardTable"),
      },
    };
    async function reset() {
      await db("o_agentWorkData").delete();
      await db("o_agentWorkData").insert({
        projectId: 1,
        episodesId: 11,
        key: "productionAgent",
        data: JSON.stringify(original),
      });
    }
    async function read() {
      return JSON.parse(
        (
          await db("o_agentWorkData")
            .where({ projectId: 1, episodesId: 11 })
            .first()
        ).data,
      );
    }
    const edit: DirectorDocumentEdit = {
      stage: "scriptPlan",
      content: "new plan",
      expectedContent: "plan",
      expectedPlan: "plan",
      expectedScript: "script",
    };
    await t.test(
      "plan changes invalidate dependent approvals and retain all other data",
      async () => {
        await reset();
        const result = await saveDirectorDocument(db, 7, 1, 11, edit);
        assert.equal(result.state?.planApproved, false);
        assert.equal(result.state?.tableApproved, false);
        const stored = await read();
        assert.equal(stored.scriptPlan, "new plan");
        assert.equal(stored.storyboardTable, "table");
        for (const key of [
          "assistantDraft",
          "memory",
          "storyboard",
          "workbench",
          "output",
        ])
          assert.deepEqual(stored[key], original[key]);
      },
    );
    await t.test(
      "table edits retain the plan approval and cannot approve themselves",
      async () => {
        await reset();
        const result = await saveDirectorDocument(db, 7, 1, 11, {
          ...edit,
          stage: "storyboardTable",
          content: "new table",
          expectedContent: "table",
        });
        assert.equal(result.state?.planApproved, true);
        assert.equal(result.state?.tableApproved, false);
        assert.equal((await read()).scriptPlan, "plan");
      },
    );
    await t.test("unchanged saves retain approvals", async () => {
      await reset();
      const result = await saveDirectorDocument(db, 7, 1, 11, {
        ...edit,
        content: "plan",
      });
      assert.equal(result.state?.planApproved, true);
      assert.equal(result.state?.tableApproved, true);
    });
    await t.test(
      "stale document, script and parent plan cannot overwrite newer work",
      async () => {
        for (const stale of [
          { ...edit, expectedContent: "stale" },
          { ...edit, expectedScript: "stale" },
          {
            ...edit,
            stage: "storyboardTable" as const,
            expectedContent: "table",
            expectedPlan: "stale",
          },
        ]) {
          await reset();
          assert.ok((await saveDirectorDocument(db, 7, 1, 11, stale)).message);
          assert.equal((await read()).scriptPlan, "plan");
          assert.equal((await read()).storyboardTable, "table");
        }
      },
    );
    await t.test("ownership and episode scope are enforced", async () => {
      await reset();
      assert.ok((await saveDirectorDocument(db, 8, 1, 11, edit)).message);
      await assert.rejects(saveDirectorDocument(db, 7, 1, 22, edit));
      assert.equal((await read()).scriptPlan, "plan");
    });
    await t.test(
      "new document can be created without granting an approval",
      async () => {
        await db("o_agentWorkData").delete();
        const result = await saveDirectorDocument(db, 7, 1, 11, {
          ...edit,
          expectedContent: "",
          expectedPlan: "",
        });
        assert.equal(result.state?.planApproved, false);
        assert.equal((await read()).scriptPlan, "new plan");
      },
    );
  } finally {
    if (created) await db.raw("DROP SCHEMA ?? CASCADE", [schema]);
    await db.destroy();
  }
});
