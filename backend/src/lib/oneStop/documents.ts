import type { Pool } from "pg";

export const ONE_STOP_MAX_BYTES = 8 * 1024 * 1024;
export const ONE_STOP_COLLECTIONS = ["comic", "comic-styles", "clip"] as const;
export type OneStopCollection = (typeof ONE_STOP_COLLECTIONS)[number];
// The negative lookahead anchors the actual end, including a possible trailing newline.
export const ONE_STOP_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}(?![\s\S])/;

export class OneStopError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export interface OneStopDocument {
  id: string;
  revision: number;
  updatedAt: number;
  payload: Record<string, unknown>;
}

type DocumentRow = {
  document_id: string;
  revision: number;
  updated_at: string | number;
  payload: Record<string, unknown>;
};

const view = (row: DocumentRow): OneStopDocument => ({
  id: row.document_id,
  revision: row.revision,
  updatedAt: Number(row.updated_at),
  payload: row.payload,
});

export function validateOneStopScope(userId: number, collection: string, id?: string) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new OneStopError("请先登录", 401);
  if (!ONE_STOP_COLLECTIONS.includes(collection as OneStopCollection)) throw new OneStopError("不支持的文档集合");
  if (id !== undefined && !ONE_STOP_ID.test(id)) throw new OneStopError("文档编号格式不正确");
}

export function validateOneStopPage(page: number, pageSize: number) {
  if (!Number.isInteger(page) || page < 1 || page > 10000 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      (page - 1) * pageSize > 100000) throw new OneStopError("分页超出范围");
}

export function validateOneStopRevision(revision: number, minimum = 0) {
  if (!Number.isInteger(revision) || revision < minimum || revision >= 2147483647) {
    throw new OneStopError("请提供有效的文档版本");
  }
}

/** Validate JSON at the storage boundary too; payload metadata never determines ownership. */
export function encodeOneStopPayload(id: string, payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !Object.hasOwn(payload, "id") || (payload as Record<string, unknown>).id !== id) {
    throw new OneStopError("文档内容的 id 必须与路径一致");
  }
  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch {
    throw new OneStopError("文档内容必须是有效 JSON");
  }
  if (Buffer.byteLength(json, "utf8") > ONE_STOP_MAX_BYTES) throw new OneStopError("文档超过 8 MiB，请减少素材内容", 413);
  // Inspect decoded string values (including escaped URLs), using an iterative walk.
  const pending: unknown[] = [JSON.parse(json)];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "string" && (item.includes("\0") || !item.isWellFormed())) {
      throw new OneStopError("文档包含不支持的文本字符");
    }
    if (typeof item === "string" && /(?:blob:|file:)/i.test(item)) {
      throw new OneStopError("请先上传本机或临时素材，再保存文档");
    }
    if (item && typeof item === "object") {
      for (const [key, value] of Object.entries(item)) {
        if (key.includes("\0") || !key.isWellFormed()) throw new OneStopError("文档包含不支持的文本字符");
        if (/(?:blob:|file:)/i.test(key)) throw new OneStopError("文档不能包含本机或临时素材地址");
        pending.push(value);
      }
    }
  }
  return json;
}

/** No runtime DB imports: all connections belong to the caller's injected pool. */
export class OneStopDocuments {
  private initialization?: Promise<void>;

  constructor(private readonly pool: Pool) {}

  initialize(): Promise<void> {
    return this.initialization ??= this.initializeTables().catch((error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
  }

  private async initializeTables() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      // CREATE TABLE IF NOT EXISTS alone races on PostgreSQL catalog entries.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext(current_database()),
        hashtext(current_schema() || ':xoi_one_stop_documents:init'))`);
      await client.query(`CREATE TABLE IF NOT EXISTS xoi_one_stop_documents (
        user_id bigint NOT NULL CHECK (user_id > 0),
        collection text NOT NULL CHECK (collection IN ('comic', 'comic-styles', 'clip')),
        document_id varchar(160) NOT NULL CHECK (document_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$'),
        title varchar(160) NOT NULL,
        payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND
          payload ? 'id' AND jsonb_typeof(payload->'id') = 'string' AND payload->>'id' = document_id),
        revision integer NOT NULL CHECK (revision > 0),
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        deleted_at bigint NULL,
        PRIMARY KEY (user_id, collection, document_id)
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS xoi_one_stop_documents_active_page_idx
        ON xoi_one_stop_documents (user_id, collection, updated_at DESC, document_id ASC)
        WHERE deleted_at IS NULL`);
      // 旧表的集合 CHECK 不含 clip：老库迁移（NOT VALID 先挂约束再校验，避免长锁）
      await client.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'xoi_one_stop_documents_collection_check'
                       AND conrelid = 'xoi_one_stop_documents'::regclass
                       AND pg_get_constraintdef(oid) ILIKE '%clip%') THEN
          ALTER TABLE xoi_one_stop_documents DROP CONSTRAINT IF EXISTS xoi_one_stop_documents_collection_check;
          ALTER TABLE xoi_one_stop_documents ADD CONSTRAINT xoi_one_stop_documents_collection_check
            CHECK (collection IN ('comic', 'comic-styles', 'clip')) NOT VALID;
        END IF;
      END $$`);
      await client.query(`ALTER TABLE xoi_one_stop_documents VALIDATE CONSTRAINT xoi_one_stop_documents_collection_check`).catch(() => undefined);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async list(userId: number, collection: OneStopCollection, page = 1, pageSize = 50) {
    validateOneStopScope(userId, collection);
    validateOneStopPage(page, pageSize);
    await this.initialize();
    const result = await this.pool.query<DocumentRow>(`SELECT document_id, revision, updated_at, payload
      FROM xoi_one_stop_documents WHERE user_id = $1 AND collection = $2 AND deleted_at IS NULL
      ORDER BY updated_at DESC, document_id ASC LIMIT $3 OFFSET $4`,
    [userId, collection, pageSize + 1, (page - 1) * pageSize]);
    return { items: result.rows.slice(0, pageSize).map(view), page, pageSize, hasMore: result.rows.length > pageSize };
  }

  async get(userId: number, collection: OneStopCollection, id: string) {
    validateOneStopScope(userId, collection, id);
    await this.initialize();
    const result = await this.pool.query<DocumentRow>(`SELECT document_id, revision, updated_at, payload
      FROM xoi_one_stop_documents WHERE user_id = $1 AND collection = $2 AND document_id = $3 AND deleted_at IS NULL`,
    [userId, collection, id]);
    if (!result.rows[0]) throw new OneStopError("文档不存在或已删除", 404);
    return view(result.rows[0]);
  }

  async save(userId: number, collection: OneStopCollection, id: string, revision: number, title: string, payload: unknown) {
    validateOneStopScope(userId, collection, id);
    validateOneStopRevision(revision);
    if (typeof title !== "string" || title.length > 160 || title.includes("\0")) throw new OneStopError("标题不得超过 160 字符");
    const json = encodeOneStopPayload(id, payload);
    // Also bound the complete serialized mutation when used without HTTP middleware.
    if (Buffer.byteLength(JSON.stringify({ collection, revision, title, payload: JSON.parse(json) })) > ONE_STOP_MAX_BYTES) {
      throw new OneStopError("文档超过 8 MiB，请减少素材内容", 413);
    }
    await this.initialize();
    const now = Date.now();
    const result = revision === 0
      ? await this.pool.query<DocumentRow>(`INSERT INTO xoi_one_stop_documents
          (user_id, collection, document_id, title, payload, revision, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5::jsonb, 1, $6, $6)
          ON CONFLICT (user_id, collection, document_id) DO NOTHING
          RETURNING document_id, revision, updated_at, payload`, [userId, collection, id, title, json, now])
      : await this.pool.query<DocumentRow>(`UPDATE xoi_one_stop_documents
          SET title = $4, payload = $5::jsonb, revision = revision + 1, updated_at = GREATEST($6, updated_at + 1)
          WHERE user_id = $1 AND collection = $2 AND document_id = $3 AND revision = $7 AND deleted_at IS NULL
          RETURNING document_id, revision, updated_at, payload`, [userId, collection, id, title, json, now, revision]);
    // Tombstones retain the composite PK, so revision=0 cannot resurrect them.
    if (!result.rows[0]) throw new OneStopError("文档版本已变化或已删除，请刷新后再保存", 409);
    return view(result.rows[0]);
  }

  async delete(userId: number, collection: OneStopCollection, id: string, revision: number) {
    validateOneStopScope(userId, collection, id);
    validateOneStopRevision(revision, 1);
    await this.initialize();
    const result = await this.pool.query<DocumentRow>(`UPDATE xoi_one_stop_documents
      SET deleted_at = GREATEST($5, updated_at + 1), updated_at = GREATEST($5, updated_at + 1), revision = revision + 1
      WHERE user_id = $1 AND collection = $2 AND document_id = $3 AND revision = $4 AND deleted_at IS NULL
      RETURNING document_id, revision, updated_at, payload`, [userId, collection, id, revision, Date.now()]);
    if (!result.rows[0]) throw new OneStopError("文档版本已变化或已删除，请刷新后再确认删除", 409);
    const row = result.rows[0];
    return { id: row.document_id, revision: row.revision, updatedAt: Number(row.updated_at), deleted: true as const };
  }
}
