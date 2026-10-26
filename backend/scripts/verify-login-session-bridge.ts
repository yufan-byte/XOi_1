/** Own zero-quota fixture only. Never changes an existing password, wallet or session. */
import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";
import assert from "node:assert/strict";
import { newApiLogin } from "../src/utils/newapi";
const db = new pg.Client({
  connectionString:
    process.env.NEWAPI_DATABASE_URL || process.env.NEWAPI_PG_URL,
});
const name = "xoi_qalog_" + crypto.randomBytes(4).toString("hex"),
  password = crypto.randomBytes(24).toString("base64url");
let uid: number | undefined;
async function main() {
  await db.connect();
  const rows = await db.query(
    `INSERT INTO users(username,password,display_name,role,status,quota,used_quota,request_count,"group",auth_version) VALUES($1,$2,$1,1,1,0,0,0,$3,1) RETURNING id`,
    [
      name,
      await bcrypt.hash(password, 10),
      process.env.NEWAPI_SYNC_GROUP || "xoi",
    ],
  );
  uid = Number(rows.rows[0].id);
  assert.ok(uid > 1);
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    if (process.argv.includes("--http")) {
      const response = await fetch("http://localhost:12121/api/login/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: name, password }),
        signal: AbortSignal.timeout(15000),
      });
      const body = (await response.json()) as any;
      assert.equal(response.status, 200, body.message);
      assert.equal(Number(body.data.id), uid);
      assert.ok(body.data.token?.startsWith("Bearer "));
      const self = await fetch("http://localhost:12121/api/login/self", {
        headers: { Authorization: body.data.token },
        signal: AbortSignal.timeout(8000),
      });
      assert.equal(self.status, 200);
    } else assert.equal((await newApiLogin(name, password)).user.id, uid);
    times.push(Math.round(performance.now() - start));
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) FROM user_sessions WHERE user_id=$1 AND status=$2 AND expires_at>extract(epoch FROM now())",
            [uid, "active"],
          )
        ).rows[0].count,
      ),
      0,
    );
  }
  assert.equal(
    Number(
      (await db.query("SELECT quota FROM users WHERE id=$1", [uid])).rows[0]
        .quota,
    ),
    0,
  );
  console.log(
    JSON.stringify({
      passed: true,
      httpFlow: process.argv.includes("--http"),
      successfulLogins: 3,
      remainingGatewaySessions: 0,
      timingsMs: times,
      paidRequests: 0,
      existingUsersModified: 0,
    }),
  );
}
void main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (uid) {
      // Explicit fixture ID guarded by its unpredictable name; keep unrelated rows untouched.
      const owned =
        (
          await db.query("SELECT id FROM users WHERE id=$1 AND username=$2", [
            uid,
            name,
          ])
        ).rows.length === 1;
      if (owned) {
        await db.query("BEGIN");
        try {
          await db.query("DELETE FROM user_sessions WHERE user_id=$1", [uid]);
          await db.query("DELETE FROM auth_flows WHERE user_id=$1", [uid]);
          await db.query("DELETE FROM o_auth_audit WHERE uid=$1", [uid]);
          await db.query("DELETE FROM o_user WHERE id=$1 AND name=$2", [
            uid,
            name,
          ]);
          await db.query("DELETE FROM users WHERE id=$1 AND username=$2", [
            uid,
            name,
          ]);
          await db.query("COMMIT");
          console.log(
            "Temporary zero-quota login fixture removed; gateway audit logs retained.",
          );
        } catch (error) {
          await db.query("ROLLBACK");
          throw error;
        }
      }
    }
    await db.end();
  });
