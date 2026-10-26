import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import dotenv from "dotenv";
import { db } from "../lib/agent/db";
import { dashboard, membersOf, spentInPeriod, teamSummary, type Team } from "../lib/team/store";

// Opt-in. TEMP tables shadow real data; every fixture write is rolled back.
test("2000 team members use fixed read queries with unchanged period calculations", { skip: process.env.XOI_TEAM_READ_TEST !== "1" }, async () => {
  dotenv.config({ quiet: true });
  const pool = db();
  assert.ok(pool, "Configure PostgreSQL for the isolated read integration test");
  const client = await pool.connect();
  const original = globalThis.__xoiAgentPool;
  let calls: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE mc_team_members (id integer, team_id integer, user_id integer, nickname text, email text, status text, limit_quota bigint, period text, can_view_all boolean, joined_at bigint) ON COMMIT DROP;
      CREATE TEMP TABLE users (id integer, quota bigint) ON COMMIT DROP;
      CREATE TEMP TABLE logs (id integer, user_id integer, type integer, quota bigint, created_at bigint) ON COMMIT DROP;
      INSERT INTO mc_team_members SELECT x, 7, 1000+x, 'Member '||x, 'member'||x||'@example.test', 'active', 10000,
        CASE x%3 WHEN 1 THEN 'day' WHEN 2 THEN 'month' ELSE 'total' END, false,
        floor(extract(epoch from now()-interval '10 days')*1000) FROM generate_series(1,2000) x;
      INSERT INTO users SELECT user_id, 3000 FROM mc_team_members;
      INSERT INTO logs VALUES
        (1,1001,2,100,extract(epoch from now())::bigint),
        (2,1001,2,33,extract(epoch from now()-interval '1 day')::bigint),
        (3,1002,2,200,extract(epoch from now())::bigint),
        (4,1002,2,50,extract(epoch from now()-interval '1 day')::bigint),
        (5,1002,2,70,extract(epoch from now()-interval '2 months')::bigint),
        (6,1003,2,500,extract(epoch from now())::bigint),
        (7,1003,2,900,extract(epoch from now()-interval '20 days')::bigint),
        (8,1003,1,99999,extract(epoch from now())::bigint),
        (9,9999,2,99999,extract(epoch from now())::bigint);
    `);
    globalThis.__xoiAgentPool = { query: (sql: string, values?: unknown[]) => { calls.push(sql); return client.query(sql, values); } } as unknown as pg.Pool;
    const team: Team = { id: 7, owner_id: 77, name: "Fixture", pool: 123000, isolate: true, created_at: Date.now() };
    const current = await client.query<{ month: string }>("SELECT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM') AS month");
    const members = await membersOf(7);
    const expected = new Map<number, number>();
    for (const member of members.slice(0, 4)) expected.set(member.user_id, await spentInPeriod(client, member));
    calls = [];
    const result = await dashboard(team, current.rows[0].month);
    assert.equal(result.members.length, 2000);
    assert.equal(calls.length, 4, "Query count must not grow with member count");
    for (const member of result.members.slice(0, 4)) assert.equal(member.periodUsed, expected.get(member.userId));
    assert.equal(result.members[2].periodUsed, 500);
    assert.equal(result.members[3].periodUsed, 0);
    const historical = await dashboard(team, "2020-01");
    assert.equal(historical.monthTotal, 0);
    assert.equal(historical.members[0].periodUsed, result.members[0].periodUsed);
    const mine = await dashboard(team, current.rows[0].month, 1001);
    assert.equal(mine.members.length, 1);
    assert.equal(mine.members[0].userId, 1001);
    assert.equal(mine.members[0].periodUsed, expected.get(1001));
    calls = [];
    const summary = await teamSummary(team);
    assert.equal(summary.seats.used, 2000);
    assert.equal(calls.length, 1);
    assert.ok(calls.every(sql => !/\blogs\b/i.test(sql)));
  } finally {
    globalThis.__xoiAgentPool = original;
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
