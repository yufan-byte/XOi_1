import type { Knex } from "knex";
import { ensureCanvasDatabase } from "./canvasDatabase";

/** Shared PostgreSQL storage. IF NOT EXISTS also supports concurrent application startup. */
export async function ensureWorkspaceTables(db: Knex) {
  await ensureCanvasDatabase(db);
  await db.raw(`CREATE TABLE IF NOT EXISTS xoi_workspace_documents (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, kind VARCHAR(32) NOT NULL,
    document_id VARCHAR(160) NOT NULL, title VARCHAR(160) NOT NULL,
    revision INTEGER NOT NULL, updated_at BIGINT NOT NULL, payload TEXT NOT NULL,
    UNIQUE(user_id, kind, document_id))`);
  await db.raw(`CREATE INDEX IF NOT EXISTS xoi_workspace_recent ON xoi_workspace_documents(user_id, kind, updated_at DESC)`);
  await db.raw(`CREATE TABLE IF NOT EXISTS xoi_generation_tasks (
    id BIGSERIAL PRIMARY KEY, kind VARCHAR(16) NOT NULL, task_id VARCHAR(160) NOT NULL,
    user_id BIGINT NOT NULL, status VARCHAR(32) NOT NULL, worker_id VARCHAR(64) NOT NULL,
    updated_at BIGINT NOT NULL, payload TEXT NOT NULL, UNIQUE(kind, task_id))`);
  await db.raw(`CREATE INDEX IF NOT EXISTS xoi_generation_owner ON xoi_generation_tasks(user_id, kind, updated_at DESC)`);
  await db.raw(`CREATE INDEX IF NOT EXISTS xoi_generation_running ON xoi_generation_tasks(updated_at,user_id) WHERE status IN ('running','unknown')`);
  await db.raw(`CREATE TABLE IF NOT EXISTS xoi_upload_sessions (
    id VARCHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL, expires_at BIGINT NOT NULL,
    payload TEXT NOT NULL DEFAULT '[]')`);
}
