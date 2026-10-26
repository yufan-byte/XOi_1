import type { Knex } from "knex";

export function workspaceError(message: string, status = 400) { return Object.assign(new Error(message), { status }); }
export function validateDocument(kind: string, id: string, payload?: unknown) {
  if (!["viral", "timeline", "director"].includes(kind) || !/^[a-zA-Z0-9_:.-]{1,160}$/.test(id)) throw workspaceError("无效的草稿类型或编号");
  if (payload !== undefined) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw workspaceError("无效的草稿内容");
    const json = JSON.stringify(payload);
    if (Buffer.byteLength(json) > 12 * 1024 * 1024) throw workspaceError("草稿过大，请减少素材或分拆项目", 413);
    if (/"(?:blob:|file:)/i.test(json)) throw workspaceError("本机临时素材不能跨设备恢复，请先上传素材");
  }
}
export class WorkspaceDocuments {
  constructor(private db: Knex) {}
  async list(userId: number, kind: string, offset = 0) {
    validateDocument(kind, "list");
    return this.db("xoi_workspace_documents").where({ user_id: userId, kind })
      .select("document_id as id", "title", "revision", "updated_at as updatedAt")
      .orderBy("updated_at", "desc").limit(50).offset(offset);
  }
  async get(userId: number, kind: string, id: string) {
    validateDocument(kind, id);
    const row = await this.db("xoi_workspace_documents").where({ user_id: userId, kind, document_id: id }).first();
    return row ? { id, title: row.title, revision: row.revision, updatedAt: Number(row.updated_at), payload: JSON.parse(row.payload) } : null;
  }
  async save(userId: number, kind: string, id: string, revision: number, title: string, payload: unknown) {
    validateDocument(kind, id, payload);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(revision) || revision < 0) throw workspaceError("无效的身份或版本");
    const values = { title: String(title || "未命名草稿").slice(0, 160), payload: JSON.stringify(payload), updated_at: Date.now(), revision: revision + 1 };
    const scope = { user_id: userId, kind, document_id: id };
    if (revision === 0) {
      await this.db.transaction(async trx => {
        if (this.db.client.config.client === "pg") await trx.raw("select pg_advisory_xact_lock(hashtext(?))", [`xoi:documents:${userId}`]);
        const count = await trx("xoi_workspace_documents").where({ user_id: userId }).count("id as count").first();
        if (Number(count?.count) >= 200) throw workspaceError("账号云端草稿已达 200 份上限，请联系管理员扩容；本机原稿仍保留", 413);
        const rows = await trx("xoi_workspace_documents").insert({ ...scope, ...values })
          .onConflict(["user_id", "kind", "document_id"]).ignore().returning(["id", "revision"]);
        if (!rows.length) throw workspaceError("草稿已在其他设备更新，请重新打开；不会覆盖原稿", 409);
      });
    } else {
      await this.db.transaction(async trx => {
        const previous = await trx('xoi_workspace_documents').where({ ...scope, revision }).forUpdate().first();
        if (!previous) throw workspaceError("草稿已在其他设备更新，请重新打开；不会覆盖原稿", 409);
        if (kind === 'timeline') {
          const clipCount = (p: any) => Array.isArray(p?.tracks) ? p.tracks.reduce((n: number, t: any) => n + (Array.isArray(t.clips) ? t.clips.length : 0), 0) : 0;
          const old = JSON.parse(previous.payload);
          if (clipCount(old) > 0 && clipCount(payload) === 0) throw workspaceError('为保护剪辑，空时间线不能覆盖云端已有素材；原稿已保留。需要从零开始时，请新建剪辑草稿。', 409);
        }
        const count = await trx("xoi_workspace_documents").where({ ...scope, revision }).update(values);
        if (!count) throw workspaceError("草稿已在其他设备更新，请重新打开；不会覆盖原稿", 409);
      });
    }
    return { revision: values.revision, updatedAt: values.updated_at };
  }
}
