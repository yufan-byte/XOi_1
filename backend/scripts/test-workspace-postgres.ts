/** Integration test in a rollback-only PostgreSQL schema. Does not call any AI or gateway API. */
import "dotenv/config";
import knex from "knex";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { ensureWorkspaceTables } from "../src/lib/workspace/schema";
import { WorkspaceDocuments } from "../src/lib/workspace/documents";
import { DurableTasks } from "../src/lib/workspace/tasks";
import { UploadSessions } from "../src/lib/workspace/uploadSessions";

async function main() {
  const connection = process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL;
  if (!connection) throw new Error("请配置本地测试 PostgreSQL；未连接任何上游");
  const db = knex({ client: "pg", connection, pool: { min: 0, max: 1 }, acquireConnectionTimeout: 10000 });
  const rollback = new Error("TEST_ROLLBACK"), schema = `xoi_test_${crypto.randomBytes(8).toString("hex")}`;
  try {
    await db.transaction(async trx => {
      await trx.raw(`CREATE SCHEMA "${schema}"`);
      await trx.raw(`SET LOCAL search_path TO "${schema}"`);
      await ensureWorkspaceTables(trx);
      const docs = new WorkspaceDocuments(trx);
      await docs.save(900000001, "viral", "test", 0, "integration fixture", { shots: [] });
      assert.equal((await docs.get(900000001, "viral", "test"))?.revision, 1);
      assert.equal(await docs.get(900000002, "viral", "test"), null);
      await assert.rejects(docs.save(900000001, "viral", "test", 0, "stale", {}), (e: any) => e.status === 409);
      await docs.save(900000001, "viral", "test", 1, "updated", { shots: [] });
      const tasks = new DurableTasks(trx, "video", undefined, "old");
      assert.equal(await tasks.create("fixture", 900000001, { status: "running", upstreamId: "fake-only", modelKey: "newapi:fixture" }), true);
      assert.equal((await new DurableTasks(trx, "video", undefined, "new").getForUser("fixture", 900000001))?.recoveryRequired, true);
      await tasks.set("fixture", { status: "succeeded", result: { url: "/fixture-only.mp4" } });
      assert.equal((await tasks.getForUser("fixture", 900000001))?.status, "succeeded");
      const sessions = new UploadSessions(trx), session = await sessions.create(900000001);
      await sessions.append(900000001, session.id, { url: "/fixture-only.png", bytes: 8, name: "fixture" });
      assert.equal((await sessions.get(900000001, session.id)).files.length, 1);
      await assert.rejects(sessions.get(900000002, session.id), (e: any) => e.status === 404);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await db.destroy(); }
  console.log(JSON.stringify({ passed: true, dialect: "postgresql", rollbackOnly: true, externalPaidRequests: 0 }));
}
main().catch(() => { console.error("PostgreSQL 持久化集成验证失败（连接信息未输出）"); process.exitCode = 1; });
