import type { Knex } from "knex";
import { withSecuritySchemaLock } from "@/utils/securitySchema";

/** A billing operation may contain many tasks. Recovery must bind to the task as well as the user. */
export class MediaRequestLinks {
  private schema?: Promise<unknown>;
  constructor(private db: Knex) {}
  ensure() {
    return this.schema ||= withSecuritySchemaLock(this.db, async trx => {
      if (await trx.schema.hasTable("xoi_media_request_links")) return;
      await trx.schema.createTable("xoi_media_request_links", table => {
        table.bigInteger("user_id").notNullable();
        table.string("kind", 16).notNullable();
        table.string("task_id", 160).notNullable();
        table.string("request_id", 180).notNullable();
        table.primary(["user_id", "kind", "task_id", "request_id"]);
      });
    }).catch(error => { this.schema = undefined; throw error; });
  }
  async record(userId: number, kind: string, taskId: string, requestId: string) {
    if (!Number.isSafeInteger(userId) || userId < 1 || !requestId || requestId.length > 180) return;
    await this.ensure();
    const owned = await this.db("xoi_generation_tasks").where({ user_id: userId, kind, task_id: taskId }).first();
    if (!owned) return;
    await this.db("xoi_media_request_links").insert({ user_id: userId, kind, task_id: taskId, request_id: requestId })
      .onConflict(["user_id", "kind", "task_id", "request_id"]).ignore();
  }
  async list(userId: number, kind: string, taskId: string): Promise<string[]> {
    await this.ensure();
    const rows = await this.db("xoi_media_request_links").where({ user_id: userId, kind, task_id: taskId }).select("request_id");
    return rows.map(row => row.request_id);
  }
}

/** Shared upstream accounts make prompt/time matching unsafe, even for identical full prompts. */
export function exactRecoveredImage(items: any[], requestIds: string[], model: string): string | null {
  const ids = new Set(requestIds.filter(Boolean));
  if (!ids.size) return null;
  const bare = model.replace(/^newapi:/, "");
  const matches = items.filter(item => item?.status === "success" && item.model === bare &&
    ids.has(String(item.request_id || item.requestId || "")));
  if (matches.length !== 1) return null;
  const image = matches[0].images?.find((item: any) => item.available !== false && typeof item.url === "string");
  return image?.url || null;
}
