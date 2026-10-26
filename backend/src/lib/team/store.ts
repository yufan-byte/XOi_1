/**
 * 团队算力池（以造物已验证模块为基础）。
 *
 * 主账号把 NewAPI users.quota 划入团队池；成员是真实 NewAPI 账号，
 * 按日 / 月 / 总额从团队池补给。模型消费仍只由 NewAPI logs 记录，
 * XOi 只额外记录团队划拨与回收，不建第二本推理账。
 */
import type { PoolClient } from "pg";
import { db, normalizeEmail } from "@/lib/agent/db";
import { adjustQuota, flushUsers, QuotaError, userQuota, withTx } from "@/lib/agent/quota";
import { adminCreateUser, adminDeleteUser, adminSetUserStatus, adminUpdateUser } from "@/utils/newapi";
import { invalidateQuotaCache, QUOTA_PER_UNIT } from "@/utils/quota";

export const MAX_SEATS = 2000;
export const UNLIMITED_BUFFER = 20 * QUOTA_PER_UNIT;
export type Period = "month" | "day" | "total";
const TZ = "Asia/Shanghai";

export class TeamError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function enabled(): boolean {
  return !["0", "false", "off", "no"].includes(String(process.env.XOI_TEAM_ENABLED ?? "true").toLowerCase());
}

let ready: Promise<void> | null = null;
export function ensureTeamTables(): Promise<void> {
  const pool = db();
  if (!pool) return Promise.reject(new TeamError("数据库未配置", 500));
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS mc_teams (
      id serial PRIMARY KEY, owner_id integer NOT NULL UNIQUE, name text NOT NULL, pool bigint NOT NULL DEFAULT 0,
      isolate boolean NOT NULL DEFAULT true, created_at bigint NOT NULL);
    CREATE TABLE IF NOT EXISTS mc_team_members (
      id serial PRIMARY KEY, team_id integer NOT NULL, user_id integer NOT NULL UNIQUE, nickname text NOT NULL, email text NOT NULL,
      limit_quota bigint NOT NULL DEFAULT 0, period text NOT NULL DEFAULT 'month', can_view_all boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'active', joined_at bigint NOT NULL, allocated bigint NOT NULL DEFAULT 0);
    ALTER TABLE mc_team_members ADD COLUMN IF NOT EXISTS allocated bigint NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS mc_team_members_team ON mc_team_members (team_id);
    CREATE TABLE IF NOT EXISTS mc_team_ledger (
      id bigserial PRIMARY KEY, team_id integer NOT NULL, kind text NOT NULL, user_id integer, amount bigint NOT NULL,
      pool_after bigint NOT NULL, actor_id integer, created_at bigint NOT NULL);
    CREATE INDEX IF NOT EXISTS mc_team_ledger_team ON mc_team_ledger (team_id, created_at DESC);`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

export interface Team { id: number; owner_id: number; name: string; pool: number; isolate: boolean; created_at: number }
export interface Member {
  id: number; team_id: number; user_id: number; nickname: string; email: string;
  limit_quota: number; period: Period; can_view_all: boolean;
  status: "active" | "disabled" | "deleted"; joined_at: number;
}

const n = (value: unknown) => Number(value) || 0;
const teamRow = (row: Record<string, unknown>): Team => ({
  id: n(row.id), owner_id: n(row.owner_id), name: String(row.name), pool: n(row.pool),
  isolate: !!row.isolate, created_at: n(row.created_at),
});
const memberRow = (row: Record<string, unknown>): Member => ({
  id: n(row.id), team_id: n(row.team_id), user_id: n(row.user_id), nickname: String(row.nickname), email: String(row.email),
  limit_quota: n(row.limit_quota), period: (row.period as Period) || "month", can_view_all: !!row.can_view_all,
  status: row.status as Member["status"], joined_at: n(row.joined_at),
});

export async function teamOfOwner(ownerId: number): Promise<Team | null> {
  await ensureTeamTables();
  const result = await db()!.query("SELECT * FROM mc_teams WHERE owner_id = $1", [ownerId]);
  return result.rows[0] ? teamRow(result.rows[0]) : null;
}

export async function membershipOf(userId: number): Promise<{ team: Team; member: Member } | null> {
  await ensureTeamTables();
  const result = await db()!.query(
    "SELECT m.*, row_to_json(t.*) AS team FROM mc_team_members m JOIN mc_teams t ON t.id = m.team_id WHERE m.user_id = $1 AND m.status <> 'deleted'",
    [userId],
  );
  return result.rows[0] ? { team: teamRow(result.rows[0].team), member: memberRow(result.rows[0]) } : null;
}

export async function membersOf(teamId: number, onlyUserId?: number): Promise<Member[]> {
  const result = await db()!.query(`SELECT * FROM mc_team_members WHERE team_id = $1 AND status <> 'deleted' ${onlyUserId ? "AND user_id = $2" : ""} ORDER BY id`, onlyUserId ? [teamId, onlyUserId] : [teamId]);
  return result.rows.map(memberRow);
}

export async function createTeam(ownerId: number, name: string): Promise<Team> {
  if (!enabled()) throw new TeamError("团队功能暂未开放", 403);
  await ensureTeamTables();
  if (await membershipOf(ownerId)) throw new TeamError("你已经是其他团队的成员，不能再开通团队");
  const clean = name.trim().slice(0, 40) || "我的团队";
  await db()!.query(
    "INSERT INTO mc_teams (owner_id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (owner_id) DO NOTHING",
    [ownerId, clean, Date.now()],
  );
  return (await teamOfOwner(ownerId))!;
}

async function ledger(client: PoolClient, teamId: number, kind: string, userId: number | null, amount: number, actorId: number | null) {
  const result = await client.query<{ pool: string }>("SELECT pool FROM mc_teams WHERE id = $1", [teamId]);
  await client.query(
    "INSERT INTO mc_team_ledger (team_id, kind, user_id, amount, pool_after, actor_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [teamId, kind, userId, amount, Number(result.rows[0]?.pool ?? 0), actorId, Date.now()],
  );
}

async function lockTeam(client: PoolClient, teamId: number): Promise<Team> {
  const result = await client.query("SELECT * FROM mc_teams WHERE id = $1 FOR UPDATE", [teamId]);
  if (!result.rows[0]) throw new TeamError("团队不存在", 404);
  return teamRow(result.rows[0]);
}

export async function movePool(team: Team, direction: "in" | "out", quota: number): Promise<Team> {
  if (!Number.isSafeInteger(quota) || quota <= 0) throw new TeamError("金额需大于 0");
  await withTx(async (client) => {
    const locked = await lockTeam(client, team.id);
    if (direction === "in") {
      try {
        await adjustQuota(client, locked.owner_id, -quota);
      } catch (error) {
        if (error instanceof QuotaError) throw new TeamError("个人余额不足");
        throw error;
      }
      await client.query("UPDATE mc_teams SET pool = pool + $2 WHERE id = $1", [locked.id, quota]);
    } else {
      if (locked.pool < quota) throw new TeamError("团队可用算力不足");
      await client.query("UPDATE mc_teams SET pool = pool - $2 WHERE id = $1", [locked.id, quota]);
      await adjustQuota(client, locked.owner_id, quota);
    }
    await ledger(client, locked.id, direction === "in" ? "transfer_in" : "transfer_out", locked.owner_id, quota, locked.owner_id);
  });
  await flushUsers([team.owner_id]);
  invalidateQuotaCache(team.owner_id);
  return (await teamOfOwner(team.owner_id))!;
}

export async function spentInPeriod(client: PoolClient, member: Member): Promise<number> {
  const since = member.period === "total" ? member.joined_at / 1000
    : member.period === "day" ? `extract(epoch from date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`
    : `extract(epoch from date_trunc('month', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`;
  const result = await client.query<{ s: string }>(
    `SELECT COALESCE(SUM(quota), 0) AS s FROM logs WHERE user_id = $1 AND type = 2 AND created_at >= ${typeof since === "number" ? "$2" : since}`,
    typeof since === "number" ? [member.user_id, Math.floor(since)] : [member.user_id],
  );
  return Number(result.rows[0]?.s ?? 0);
}

async function settleMember(client: PoolClient, team: Team, member: Member, actorId: number | null): Promise<void> {
  const current = await userQuota(client, member.user_id);
  let target = 0;
  if (member.status === "active") {
    target = member.limit_quota > 0 ? Math.max(0, member.limit_quota - (await spentInPeriod(client, member))) : UNLIMITED_BUFFER;
  }
  const pool = Number((await client.query<{ pool: string }>("SELECT pool FROM mc_teams WHERE id = $1", [team.id])).rows[0]?.pool ?? 0);
  if (current < target) {
    const amount = Math.min(target - current, pool);
    if (amount <= 0) return;
    await client.query("UPDATE mc_teams SET pool = pool - $2 WHERE id = $1", [team.id, amount]);
    await adjustQuota(client, member.user_id, amount);
    await client.query("UPDATE mc_team_members SET allocated = allocated + $2 WHERE id = $1", [member.id, amount]);
    await ledger(client, team.id, "allocate", member.user_id, amount, actorId);
  } else if (current > target) {
    const allocated = Number((await client.query<{ allocated: string }>("SELECT allocated FROM mc_team_members WHERE id = $1", [member.id])).rows[0]?.allocated ?? 0);
    // 只回收团队分配部分，不动成员自己充值 / 赠送的余额。
    const amount = Math.min(current - target, Math.max(0, allocated));
    if (amount <= 0) return;
    await adjustQuota(client, member.user_id, -amount);
    await client.query("UPDATE mc_teams SET pool = pool + $2 WHERE id = $1", [team.id, amount]);
    await client.query("UPDATE mc_team_members SET allocated = allocated - $2 WHERE id = $1", [member.id, amount]);
    await ledger(client, team.id, "reclaim", member.user_id, amount, actorId);
  }
}

export async function settleTeam(teamId: number, actorId: number | null = null): Promise<void> {
  const touched: number[] = [];
  await withTx(async (client) => {
    const team = await lockTeam(client, teamId);
    const result = await client.query("SELECT * FROM mc_team_members WHERE team_id = $1 AND status <> 'deleted' ORDER BY id", [teamId]);
    for (const member of result.rows.map(memberRow)) {
      await settleMember(client, team, member, actorId);
      touched.push(member.user_id);
    }
  });
  await flushUsers(touched);
  for (const userId of touched) invalidateQuotaCache(userId);
}

async function bindMemberEmail(username: string, email: string): Promise<boolean> {
  const pool = db()!;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
    const taken = await client.query(
      "SELECT 1 FROM users WHERE (lower(email) = $1 OR lower(username) = $1) AND username <> $2 AND deleted_at IS NULL LIMIT 1",
      [email, username],
    );
    if (taken.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    const updated = await client.query(
      "UPDATE users SET email = $1 WHERE username = $2 AND coalesce(email, '') = '' AND deleted_at IS NULL",
      [email, username],
    );
    await client.query("COMMIT");
    return (updated.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface NewMember { nickname: string; email: string; password: string; limitQuota: number; period: Period; canViewAll: boolean }

export async function addMember(team: Team, input: NewMember): Promise<Member> {
  const email = normalizeEmail(input.email);
  if (!input.nickname.trim()) throw new TeamError("请填写成员昵称");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamError("登录邮箱格式不对");
  if (input.password.length < 8 || input.password.length > 20) throw new TeamError("初始密码需 8~20 位");
  if (!Number.isSafeInteger(input.limitQuota) || input.limitQuota < 0) throw new TeamError("消费额度需为 0 或正数");
  if (!["month", "day", "total"].includes(input.period)) throw new TeamError("额度周期不对");
  const pool = db()!;
  const seats = await pool.query<{ count: string }>("SELECT count(*) AS count FROM mc_team_members WHERE team_id = $1 AND status <> 'deleted'", [team.id]);
  if (Number(seats.rows[0]?.count) >= MAX_SEATS) throw new TeamError(`席位已满（${MAX_SEATS}）`);
  const taken = await pool.query("SELECT 1 FROM users WHERE (lower(email) = $1 OR lower(username) = $1) AND deleted_at IS NULL LIMIT 1", [email]);
  if (taken.rowCount) throw new TeamError("这个邮箱已经注册过账号，请换一个");

  let username = "";
  for (let index = 0; index < 5; index += 1) {
    const candidate = `t${team.id}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 20);
    const hit = await pool.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (!hit.rowCount) { username = candidate; break; }
  }
  if (!username) throw new TeamError("生成账号失败，请重试", 500);
  await adminCreateUser(username, input.password, input.nickname);
  const created = await pool.query<{ id: number }>("SELECT id FROM users WHERE username = $1", [username]);
  const userId = Number(created.rows[0]?.id);
  if (!userId) throw new TeamError("成员账号创建失败，请重试", 502);
  if (!(await bindMemberEmail(username, email))) {
    await adminDeleteUser(userId).catch(() => undefined);
    throw new TeamError("这个邮箱已经注册过账号，请换一个");
  }
  const inserted = await pool.query(
    "INSERT INTO mc_team_members (team_id, user_id, nickname, email, limit_quota, period, can_view_all, joined_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [team.id, userId, input.nickname.trim().slice(0, 40), email, input.limitQuota, input.period, input.canViewAll, Date.now()],
  );
  await flushUsers([userId]);
  await settleTeam(team.id, team.owner_id);
  return memberRow(inserted.rows[0]);
}

export type MemberAction =
  | { action: "password"; password: string }
  | { action: "disable" }
  | { action: "enable" }
  | { action: "delete" }
  | { action: "update"; nickname?: string; limitQuota?: number; period?: Period; canViewAll?: boolean };

export async function memberAction(team: Team, memberId: number, action: MemberAction): Promise<void> {
  const pool = db()!;
  const found = await pool.query("SELECT * FROM mc_team_members WHERE id = $1 AND team_id = $2 AND status <> 'deleted'", [memberId, team.id]);
  if (!found.rows[0]) throw new TeamError("成员不存在", 404);
  const member = memberRow(found.rows[0]);
  if (action.action === "password") {
    if (action.password.length < 8 || action.password.length > 20) throw new TeamError("新密码需 8~20 位");
    await adminUpdateUser(member.user_id, { password: action.password });
    return;
  }
  if (action.action === "disable" || action.action === "delete") {
    await adminSetUserStatus(member.user_id, false);
    // 先以 disabled 状态结算为 0，把团队分配余额收回。若先标 deleted，
    // settleTeam 会因查询排除 deleted 而永久遗漏这笔团队资金。
    await pool.query("UPDATE mc_team_members SET status = 'disabled' WHERE id = $1", [member.id]);
    await settleTeam(team.id, team.owner_id);
    if (action.action === "delete") {
      await pool.query("UPDATE mc_team_members SET status = 'deleted' WHERE id = $1", [member.id]);
      try {
        await adminDeleteUser(member.user_id);
      } catch {
        await flushUsers([member.user_id]);
        throw new TeamError("成员已停用并移出团队，网关账号删除结果待核对；请联系管理员，不要重复提交", 502);
      }
    }
    await flushUsers([member.user_id]);
    return;
  }
  if (action.action === "enable") {
    await adminSetUserStatus(member.user_id, true);
    await pool.query("UPDATE mc_team_members SET status = 'active' WHERE id = $1", [member.id]);
    await settleTeam(team.id, team.owner_id);
    return;
  }
  const next = {
    nickname: action.nickname?.trim().slice(0, 40) || member.nickname,
    limit: action.limitQuota ?? member.limit_quota,
    period: action.period ?? member.period,
    canViewAll: action.canViewAll ?? member.can_view_all,
  };
  if (!Number.isSafeInteger(next.limit) || next.limit < 0) throw new TeamError("消费额度需为 0 或正数");
  if (!["month", "day", "total"].includes(next.period)) throw new TeamError("额度周期不对");
  await pool.query(
    "UPDATE mc_team_members SET nickname = $2, limit_quota = $3, period = $4, can_view_all = $5 WHERE id = $1",
    [member.id, next.nickname, next.limit, next.period, next.canViewAll],
  );
  await settleTeam(team.id, team.owner_id);
}

export async function setIsolate(team: Team, on: boolean): Promise<void> {
  await db()!.query("UPDATE mc_teams SET isolate = $2 WHERE id = $1", [team.id, on]);
}

export function monthRange(month: string): { start: number; end: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const now = new Date(Date.now() + 8 * 3600_000);
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth();
  return {
    start: Date.UTC(year, monthIndex, 1) / 1000 - 8 * 3600,
    end: Date.UTC(year, monthIndex + 1, 1) / 1000 - 8 * 3600,
  };
}

const CATEGORY_SQL: Record<string, string> = {
  chat: `(other LIKE '%"request_path":"/v1/chat%' OR other LIKE '%"request_path":"/v1/responses%' OR other LIKE '%"request_path":"/v1/messages%')`,
  image: `other LIKE '%"request_path":"/v1/images%'`,
  video: `(other LIKE '%"request_path":"/v1/video%' OR other LIKE '%"is_task":true%')`,
  audio: `other LIKE '%"request_path":"/v1/audio%'`,
};

function categoryOf(other: string): string {
  if (/\/v1\/(chat|responses|messages)/.test(other)) return "chat";
  if (/\/v1\/images/.test(other)) return "image";
  if (/\/v1\/video|"is_task":true/.test(other)) return "video";
  if (/\/v1\/audio/.test(other)) return "audio";
  return "other";
}

/** Lightweight shell summary: do not scan consumption logs just to show team membership. */
export async function teamSummary(team: Team) {
  const result = await db()!.query<{ used: string; active: string; disabled: string }>(
    `SELECT count(*) AS used, count(*) FILTER (WHERE status = 'active') AS active,
      count(*) FILTER (WHERE status = 'disabled') AS disabled
     FROM mc_team_members WHERE team_id = $1 AND status <> 'deleted'`, [team.id],
  );
  const row = result.rows[0];
  return { team: { id: team.id, name: team.name }, seats: { used: Number(row?.used ?? 0), max: MAX_SEATS, active: Number(row?.active ?? 0), disabled: Number(row?.disabled ?? 0) } };
}

export async function dashboard(team: Team, month: string, onlyUserId?: number) {
  const pool = db()!;
  const members = await membersOf(team.id, onlyUserId);
  const ids = members.map((member) => member.user_id);
  const { start, end } = monthRange(month);
  const byMember = new Map<number, number>();
  const daily = new Map<string, number>();
  if (ids.length) {
    const result = await pool.query<{ user_id: number; day: string; sum: string }>(
      `SELECT user_id, to_char(to_timestamp(created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, SUM(quota) AS sum
       FROM logs WHERE type = 2 AND user_id = ANY($1::int[]) AND created_at >= $2 AND created_at < $3 GROUP BY 1, 2`,
      [ids, start, end],
    );
    for (const row of result.rows) {
      byMember.set(Number(row.user_id), (byMember.get(Number(row.user_id)) ?? 0) + Number(row.sum));
      daily.set(row.day, (daily.get(row.day) ?? 0) + Number(row.sum));
    }
  }
  const periodUsed = new Map<number, number>();
  const quotas = new Map<number, number>();
  if (ids.length) {
    // Aggregate all members in one read; 2000 members must not cause 2000 serial log scans.
    // Current-period usage intentionally remains independent from the selected historical month.
    const [usage, balances] = await Promise.all([
      pool.query<{ user_id: number; sum: string }>(
        `SELECT m.user_id, COALESCE(SUM(l.quota), 0) AS sum
         FROM mc_team_members m LEFT JOIN logs l ON l.user_id = m.user_id AND l.type = 2
           AND l.created_at >= CASE m.period
             WHEN 'total' THEN floor(m.joined_at / 1000.0)
             WHEN 'day' THEN extract(epoch from date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')
             ELSE extract(epoch from date_trunc('month', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}') END
         WHERE m.team_id = $1 AND m.status <> 'deleted' AND m.user_id = ANY($2::int[]) GROUP BY m.user_id`,
        [team.id, ids],
      ),
      pool.query<{ id: number; quota: string }>("SELECT id, quota FROM users WHERE id = ANY($1::int[])", [ids]),
    ]);
    for (const row of usage.rows) periodUsed.set(Number(row.user_id), Number(row.sum));
    for (const row of balances.rows) quotas.set(Number(row.id), Number(row.quota));
  }
  const monthTotal = [...byMember.values()].reduce((sum, value) => sum + value, 0);
  const days: { day: string; quota: number }[] = [];
  for (let time = start; time < end; time += 86400) {
    const day = new Date((time + 8 * 3600) * 1000).toISOString().slice(0, 10);
    days.push({ day, quota: daily.get(day) ?? 0 });
  }
  const list = members.map((member) => ({
    id: member.id, userId: member.user_id, nickname: member.nickname, email: member.email, status: member.status,
    limitQuota: member.limit_quota, period: member.period, canViewAll: member.can_view_all,
    periodUsed: periodUsed.get(member.user_id) ?? 0, monthUsed: byMember.get(member.user_id) ?? 0,
    wallet: quotas.get(member.user_id) ?? 0, joinedAt: member.joined_at,
    over: member.limit_quota > 0 && (periodUsed.get(member.user_id) ?? 0) >= member.limit_quota,
  }));
  return {
    team: { id: team.id, name: team.name, pool: team.pool, isolate: team.isolate, createdAt: team.created_at },
    monthTotal,
    seats: { used: members.length, max: MAX_SEATS, active: members.filter((member) => member.status === "active").length, disabled: members.filter((member) => member.status === "disabled").length },
    overLimit: list.filter((member) => member.over).map((member) => member.nickname),
    members: list,
    days,
  };
}

export async function records(team: Team, month: string, category: string, page: number, onlyUserId?: number) {
  const members = await membersOf(team.id, onlyUserId);
  const ids = members.map(member => member.user_id);
  if (!ids.length) return { items: [], total: 0 };
  const { start, end } = monthRange(month);
  const condition = CATEGORY_SQL[category];
  const size = 50;
  const offset = (Math.max(1, page) - 1) * size;
  const result = await db()!.query(
    `SELECT l.id, l.user_id, l.created_at, l.model_name, l.quota, l.prompt_tokens, l.completion_tokens, l.other, count(*) OVER () AS total
     FROM logs l WHERE l.type = 2 AND l.user_id = ANY($1::int[]) AND l.created_at >= $2 AND l.created_at < $3 ${condition ? `AND ${condition}` : ""}
     ORDER BY l.id DESC LIMIT ${size} OFFSET ${offset}`,
    [ids, start, end],
  );
  const names = new Map(members.map(member => [member.user_id, member.nickname]));
  return {
    total: Number(result.rows[0]?.total ?? 0),
    items: result.rows.map((row) => ({
      id: Number(row.id), userId: Number(row.user_id), member: names.get(Number(row.user_id)) ?? `#${row.user_id}`,
      at: Number(row.created_at), model: row.model_name, quota: Number(row.quota), category: categoryOf(String(row.other ?? "")),
    })),
  };
}

declare global { var __xoiTeamSweeper: ReturnType<typeof setInterval> | undefined }

export function startTeamSweeper(): void {
  if (globalThis.__xoiTeamSweeper || !db()) return;
  const run = async () => {
    try {
      await ensureTeamTables();
      const pool = db()!;
      const client = await pool.connect();
      try {
        const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock(727001) AS ok");
        if (!lock.rows[0]?.ok) return;
        try {
          const teams = await client.query<{ id: number }>("SELECT DISTINCT team_id AS id FROM mc_team_members WHERE status = 'active'");
          for (const team of teams.rows) {
            try { await settleTeam(Number(team.id)); }
            catch (error) { console.error("[team] settle", team.id, (error as Error).message); }
          }
        } finally {
          await client.query("SELECT pg_advisory_unlock(727001)");
        }
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("[team] sweep failed:", (error as Error).message);
    }
  };
  setTimeout(run, 20_000);
  globalThis.__xoiTeamSweeper = setInterval(run, 60_000);
}
