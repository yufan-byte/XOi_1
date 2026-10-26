/** One-time, explicit operator action. Default is READ-ONLY; --apply requires user approval. */
import "dotenv/config";
import pg from "pg";
import assert from "node:assert/strict";
const db = new pg.Client({
  connectionString:
    process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL,
});
const agents = ["axios/1.14.0", "axios/1.20.0"];
async function main() {
  await db.connect();
  const identity = (
    await db.query("SELECT username FROM users WHERE id=$1", [1])
  ).rows[0];
  assert.equal(identity?.username, "cheny");
  const predicate =
    "user_id=1 AND status='active' AND expires_at>extract(epoch FROM now()) AND login_method='password' AND ip='172.19.0.1' AND user_agent=ANY($1::text[])";
  if (!process.argv.includes("--apply")) {
    const rows = (
      await db.query(
        `SELECT user_agent,count(*)::int count FROM user_sessions WHERE ${predicate} GROUP BY user_agent`,
        [agents],
      )
    ).rows;
    console.log(JSON.stringify({ dryRun: true, matched: rows, changed: 0 }));
    return;
  }
  if (process.env.XOI_NEWAPI_REDIS_ENABLED === "1")
    throw new Error(
      "Redis-enabled gateway requires API-based cache invalidation; refused direct update",
    );
  await db.query("BEGIN");
  try {
    const candidates = (
      await db.query(
        `SELECT sid FROM user_sessions WHERE ${predicate} FOR UPDATE`,
        [agents],
      )
    ).rows;
    assert.equal(
      candidates.length,
      46,
      "Session set changed; refused to expand the approved target",
    );
    const result = await db.query(
      `UPDATE user_sessions SET status='revoked',revoked_at=extract(epoch FROM now())::bigint,revoked_reason='xoi_bridge_legacy_cleanup' WHERE ${predicate}`,
      [agents],
    );
    assert.equal(result.rowCount, 46);
    await db.query(
      "INSERT INTO o_auth_audit(uid,name,result,reason,at) VALUES($1,$2,$3,$4,$5)",
      [
        1,
        "cheny",
        "blocked",
        "operator-approved legacy gateway session cleanup:46",
        new Date().toISOString(),
      ],
    );
    await db.query("COMMIT");
    console.log(
      JSON.stringify({
        revoked: 46,
        otherSessionsUnchanged: true,
        passwordUnchanged: true,
        walletUnchanged: true,
        xoiSessionVersionUnchanged: true,
      }),
    );
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
void main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
