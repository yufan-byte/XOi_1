import assert from "node:assert/strict";
import { normalizeLoginTarget, createLoginUrl, prepareLoginReturn, readLoginReturn, consumeLoginReturn, LOGIN_RETURN_KEY, LOGIN_RETURN_TTL, DEFAULT_LOGIN_TARGET } from "../../shared/loginNavigation";
let cases = 0;
for (const input of ["https://evil.example", "//evil.example", "/\\evil.example", "/%5cevil.example", "/%2f%2fevil.example", "/%252f%252fevil.example", "/console/login?next=/console/login", "/login", "/api/login/self", "/oss/private", "/#/login", "/#/unknown", "/#/project\n", "/#/script?x=%0d%0aLocation:evil", "/console/reseller/%2e%2e/login", "/#/script?x=%", " /#/script", "/console//evil.example", "/#/project?x=%252525252f", "x".repeat(5000)]) {
  assert.equal(normalizeLoginTarget(input), DEFAULT_LOGIN_TARGET, input); cases++;
}
for (const [input, output] of [["/#/script?projectId=4", "/#/script?projectId=4"], ["/script?projectId=4", "/#/script?projectId=4"], ["/reseller/overview?s=keys", "/console/reseller/overview?s=keys"], ["/console/reseller/account/audit-log", "/console/reseller/account/audit-log"], ["/team", "/console/team"], ["/console/topup", "/console/topup"]]) {
  assert.equal(normalizeLoginTarget(input), output); cases++;
}
function fixture(href = "https://xoi.example/console/login", blocked = false) {
  const items = new Map<string, string>();
  const location = new URL(href);
  const win = { location, history: { state: { idx: 2 }, replaceState(state: unknown, _unused: string, url: string) { assert.deepEqual(state, { idx: 2 }); location.href = new URL(url, location).href; } }, sessionStorage: { getItem(k: string) { if (blocked) throw new Error("blocked"); return items.get(k) ?? null; }, setItem(k: string, v: string) { if (blocked) throw new Error("blocked"); items.set(k, v); }, removeItem(k: string) { items.delete(k); } } } as unknown as Window;
  return { win, items };
}
const a = fixture();
assert.equal(createLoginUrl("/#/script?projectId=4", {}, a.win), "/console/login");
assert.equal(readLoginReturn(a.win), "/#/script?projectId=4");
assert.equal(readLoginReturn(fixture().win), DEFAULT_LOGIN_TARGET); // independent tab storage
assert.equal(consumeLoginReturn(a.win), "/#/script?projectId=4");
assert.equal(readLoginReturn(a.win), DEFAULT_LOGIN_TARGET);
a.items.set(LOGIN_RETURN_KEY, JSON.stringify({ target: "/console/team", at: Date.now() - LOGIN_RETURN_TTL - 1 }));
assert.equal(readLoginReturn(a.win), DEFAULT_LOGIN_TARGET);
a.items.set(LOGIN_RETURN_KEY, JSON.stringify({ target: "//evil.example", at: Date.now() }));
assert.equal(readLoginReturn(a.win), DEFAULT_LOGIN_TARGET);
a.items.set(LOGIN_RETURN_KEY, "not json");
assert.equal(readLoginReturn(a.win), DEFAULT_LOGIN_TARGET);
const legacy = fixture("https://xoi.example/console/login?next=%2Freseller%2Foverview&ref=invite&stay=1#auth-dialog");
prepareLoginReturn(legacy.win);
assert.equal(legacy.win.location.href, "https://xoi.example/console/login?ref=invite&stay=1#auth-dialog");
assert.equal(readLoginReturn(legacy.win), "/console/reseller/overview");
const denied = fixture("https://xoi.example/console/login?next=%2Fteam", true);
prepareLoginReturn(denied.win);
assert.equal(readLoginReturn(denied.win), "/console/team");
assert.equal(createLoginUrl("/team", { expired: true }, denied.win), "/console/login?next=%2Fconsole%2Fteam&expired=1");
console.log(JSON.stringify({ passed: true, routeCases: cases, legacyLinkMigration: true, tabScopedReturn: true, expiryAndCorruptionFallback: true, storageBlockedFallback: true, paidRequests: 0 }));
