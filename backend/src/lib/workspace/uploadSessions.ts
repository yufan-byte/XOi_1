import crypto from "node:crypto";
import type { Knex } from "knex";
import { workspaceError } from "./documents";
export class UploadSessions {
  constructor(private db: Knex, private now = Date.now) {}
  async create(userId: number) {
    return this.db.transaction(async trx => {
      if (this.db.client.config.client === "pg") await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [`xoi:upload-session:${userId}`]);
      const count = await trx("xoi_upload_sessions").where({ user_id: userId }).where("expires_at", ">", this.now()).count("id as count").first();
      if (Number(count?.count) >= 3) throw workspaceError("上传窗口过多，请先关闭其他窗口", 429);
      const id = crypto.randomBytes(24).toString("hex"), expiresAt = this.now() + 10 * 60 * 1000;
      await trx("xoi_upload_sessions").insert({ id, user_id: userId, expires_at: expiresAt, payload: "[]" }).returning(["id", "expires_at"]);
      return { id, expiresAt, files: [] };
    });
  }
  async get(userId: number, id: string) {
    if (!/^[a-f0-9]{48}$/.test(id)) throw workspaceError("无效的上传窗口");
    const row = await this.db("xoi_upload_sessions").where({ id, user_id: userId }).first();
    if (!row || Number(row.expires_at) <= this.now()) throw workspaceError("上传窗口已过期或不属于当前账号", 404);
    return { id, expiresAt: Number(row.expires_at), files: JSON.parse(row.payload) };
  }
  async append(userId: number, id: string, file: { url: string; name: string; bytes: number }) {
    return this.db.transaction(async trx => {
      const row = await trx("xoi_upload_sessions").where({ id, user_id: userId }).forUpdate().first();
      if (!row || Number(row.expires_at) <= this.now()) throw workspaceError("上传窗口已过期或不属于当前账号", 404);
      const files = JSON.parse(row.payload);
      if (files.some((item: any) => item.url === file.url)) return files;
      if (files.length >= 10) throw workspaceError("每次最多上传 10 张图片", 413);
      files.push(file);
      await trx("xoi_upload_sessions").where({ id }).update({ payload: JSON.stringify(files) });
      return files;
    });
  }
  async close(userId: number, id: string) { await this.db("xoi_upload_sessions").where({ id, user_id: userId }).delete(); }
}
