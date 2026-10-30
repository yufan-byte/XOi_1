/**
 * 批量下发账号的初始密码「加密暂存 + 一次性认领」存储（2026-10-28）。
 *
 * 设计目标（对应需求里的「安全防护等级最高」）：
 *   1. 批量创建时**不在 HTTP 响应里回明文密码**——明文绝不落到浏览器；
 *   2. 密码用 AES-256-GCM 加密后落库，密钥由服务端主密钥派生（`tokenKey`），不写在代码里；
 *   3. 每条记录都有 TTL（默认 30 分钟），到期由 sweeper 物理删除，不留存历史；
 *   4. 导出必须**重新做一次 sudo 验证**（即使刚创建过），每次下载都计数 + 写审计；
 *   5. 认领记录与 owner 绑定：换账号 / 换团队都取不到别人的一条记录。
 *
 * 为什么这样比「前端内存导出」更安全：浏览器端 JS 拿不到明文，
 * 就不会因为 XSS、扩展插件、截图残留、控制台日志等途径泄漏；
 * 服务端也只在下载的那一刻解密，内存里的明文随请求结束被回收。
 */
import crypto from "node:crypto";
import knex from "@/utils/db";
import { db } from "@/lib/agent/db";

const TTL_MS_DEFAULT = 30 * 60 * 1000;

const configuredTtl = Number(process.env.XOI_TEAM_BATCH_TTL_MS);
export const BATCH_TTL_MS = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : TTL_MS_DEFAULT;

export interface BatchCredentialRow {
  username: string; nickname: string; password: string; limitQuota: number; period: string;
}

let ready: Promise<void> | null = null;
export function ensureBatchTables(): Promise<void> {
  const pool = db();
  if (!pool) return Promise.reject(new Error("数据库未配置"));
  ready ??= pool
    .query(`
    CREATE TABLE IF NOT EXISTS mc_team_batch_credentials (
      id bigserial PRIMARY KEY,
      batch_id text NOT NULL,
      team_id integer NOT NULL,
      owner_id integer NOT NULL,
      row_no integer NOT NULL,
      username text NOT NULL,
      nickname text NOT NULL,
      limit_quota bigint NOT NULL DEFAULT 0,
      period text NOT NULL DEFAULT 'month',
      password_cipher text NOT NULL,
      created_at bigint NOT NULL,
      expires_at bigint NOT NULL,
      downloads integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS mc_team_batch_credentials_batch ON mc_team_batch_credentials (batch_id);
    CREATE INDEX IF NOT EXISTS mc_team_batch_credentials_owner ON mc_team_batch_credentials (owner_id, created_at DESC);`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

let keyCache: Buffer | null = null;
async function dataKey(): Promise<Buffer> {
  if (keyCache) return keyCache;
  const env = String(process.env.XOI_TEAM_BATCH_KEY || "").trim();
  if (env.length >= 32) return (keyCache = crypto.createHash("sha256").update(env).digest());
  const row = await knex("o_setting").where("key", "tokenKey").first();
  const tokenKey = String(row?.value || "");
  if (!tokenKey) throw new Error("服务器未初始化签名密钥");
  // 与主密钥派生隔离：即使某一处密钥泄漏，也不牵连另一处数据
  keyCache = crypto.createHmac("sha256", tokenKey).update("xoi-team-batch-credential-v1").digest();
  return keyCache;
}

async function encrypt(plain: string): Promise<string> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", await dataKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

async function decrypt(packed: string): Promise<string | null> {
  const [ivB64, tagB64, bodyB64] = String(packed || "").split(".");
  if (!ivB64 || !tagB64 || !bodyB64) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", await dataKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(bodyB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // 密钥轮换或数据被篡改：宁可取不到，也绝不返回一个错误的密码
    return null;
  }
}

/** 暂存一批凭据（密文落库），返回可用于导出的 batchId。 */
export async function stashBatchCredentials(
  teamId: number,
  ownerId: number,
  rows: BatchCredentialRow[],
): Promise<{ batchId: string; expiresAt: number }> {
  await ensureBatchTables();
  const batchId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + BATCH_TTL_MS;
  const pool = db()!;
  for (const [index, row] of rows.entries()) {
    const cipher = await encrypt(row.password);
    await pool.query(
      `INSERT INTO mc_team_batch_credentials
        (batch_id, team_id, owner_id, row_no, username, nickname, limit_quota, period, password_cipher, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [batchId, teamId, ownerId, index + 1, row.username, row.nickname, row.limitQuota, row.period, cipher, now, expiresAt],
    );
  }
  return { batchId, expiresAt };
}

export interface ClaimedCredential {
  username: string; nickname: string; password: string; limitQuota: number; period: string;
}

/**
 * 认领（解密）一批凭据。必须带 ownerId 校验，
 * 且每次调用都计数——超过上限或已过期就拿不到。
 */
export async function claimBatchCredentials(
  batchId: string, ownerId: number, teamId: number,
): Promise<{ rows: ClaimedCredential[]; downloads: number } | null> {
  const pool = db();
  if (!pool) return null;
  await ensureBatchTables();
  const head = await pool.query<{ count: string; downloads: string; expires_at: string }>(
    `SELECT count(*)::text AS count, max(downloads)::text AS downloads, max(expires_at)::text AS expires_at
       FROM mc_team_batch_credentials WHERE batch_id = $1 AND owner_id = $2 AND team_id = $3`,
    [batchId, ownerId, teamId],
  );
  const count = Number(head.rows[0]?.count ?? 0);
  if (!count) return null;
  const expiresAt = Number(head.rows[0]?.expires_at ?? 0);
  if (expiresAt && expiresAt < Date.now()) return null;
  const downloads = Number(head.rows[0]?.downloads ?? 0);
  if (downloads >= 5) return null;

  const body = await pool.query<{ username: string; nickname: string; password_cipher: string; limit_quota: string; period: string; row_no: number }>(
    `SELECT username, nickname, password_cipher, limit_quota, period, row_no
       FROM mc_team_batch_credentials WHERE batch_id = $1 AND owner_id = $2 AND team_id = $3 ORDER BY row_no`,
    [batchId, ownerId, teamId],
  );
  const rows: ClaimedCredential[] = [];
  for (const row of body.rows) {
    const password = await decrypt(row.password_cipher);
    if (!password) continue;
    rows.push({ username: row.username, nickname: row.nickname, password, limitQuota: Number(row.limit_quota) || 0, period: row.period });
  }
  if (!rows.length) return null;
  await pool.query("UPDATE mc_team_batch_credentials SET downloads = downloads + 1 WHERE batch_id = $1 AND owner_id = $2", [batchId, ownerId]);
  return { rows, downloads: downloads + 1 };
}

export interface BatchSummary {
  batchId: string; teamId: number; count: number; createdAt: number; expiresAt: number; downloads: number; expired: boolean;
}

/** 最近批次列表（只给元信息，不含任何密码）。 */
export async function listBatches(ownerId: number, teamId?: number, limit = 10): Promise<BatchSummary[]> {
  const pool = db();
  if (!pool) return [];
  await ensureBatchTables();
  const result = await pool.query<{ batch_id: string; team_id: number; count: string; created_at: string; expires_at: string; downloads: string }>(
    `SELECT batch_id, team_id, count(*)::text AS count, min(created_at)::text AS created_at,
            max(expires_at)::text AS expires_at, max(downloads)::text AS downloads
       FROM mc_team_batch_credentials
      WHERE owner_id = $1 ${teamId ? "AND team_id = $3" : ""}
      GROUP BY batch_id, team_id ORDER BY min(created_at) DESC LIMIT $2`,
    teamId ? [ownerId, limit, teamId] : [ownerId, limit],
  );
  const now = Date.now();
  return result.rows.map((row) => {
    const expiresAt = Number(row.expires_at) || 0;
    return {
      batchId: row.batch_id, teamId: Number(row.team_id), count: Number(row.count) || 0,
      createdAt: Number(row.created_at) || 0, expiresAt,
      downloads: Number(row.downloads) || 0, expired: expiresAt > 0 && expiresAt < now,
    };
  });
}

/** 物理删除过期记录；由 startTeamSweeper 定期调用。 */
export async function pruneExpiredBatches(): Promise<number> {
  const pool = db();
  if (!pool) return 0;
  await ensureBatchTables().catch(() => undefined);
  const result = await pool.query("DELETE FROM mc_team_batch_credentials WHERE expires_at < $1", [Date.now()]).catch(() => null);
  return result?.rowCount ?? 0;
}
