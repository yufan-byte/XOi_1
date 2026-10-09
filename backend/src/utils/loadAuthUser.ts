import { db } from "./db";
import type { Identity } from "./authIdentity";

/** NewAPI is authoritative on every request, including existing JWTs after a ban/demotion/deletion. */
export async function loadAuthUser(id: number): Promise<Identity | undefined> {
  const row = await db("o_user as m").join("users as a", "a.id", "m.id").where("m.id", id).whereNull("a.deleted_at")
    .select("m.id", "m.name", "m.status as mirrorStatus", "m.session_version", "a.status as authorityStatus", "a.role as authorityRole").first();
  if (!row) return undefined;
  return {
    id: Number(row.id), name: row.name,
    role: Number(row.authorityRole) >= 10 ? "admin" : "user",
    status: row.mirrorStatus === "banned" || Number(row.authorityStatus) !== 1 ? "banned" : "active",
    session_version: Number(row.session_version || 0),
  };
}
