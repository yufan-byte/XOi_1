import test from "node:test";
import assert from "node:assert/strict";
import { dailySpendWindow, shouldWarnDaily } from "./dailySpendPolicy";
import { budgetDecision } from "./billingBudgetPolicy";
test("daily reminder resets at Beijing midnight, independent of execution-host timezone", () => {
  const before = dailySpendWindow(Date.parse("2026-10-20T15:59:59Z")),
    after = dailySpendWindow(Date.parse("2026-10-20T16:00:00Z"));
  assert.equal(before.day, "2026-10-20");
  assert.equal(after.day, "2026-10-21");
  assert.equal(before.end, after.start);
  assert.equal(after.end - after.start, 86400);
});
test("daily amount is a soft notification threshold, including disable and invalid values", () => {
  assert.equal(shouldWarnDaily(19.99, 20), false);
  assert.equal(shouldWarnDaily(20, 20), true);
  assert.equal(shouldWarnDaily(300, 20), true);
  assert.equal(shouldWarnDaily(300, 0), false);
  assert.equal(shouldWarnDaily(NaN, 20), false);
});
test("normal automatic workflow does not stop at guessed cumulative reservations; explicit limits still mean what they say", () => {
  const row = {
    state: "active",
    expires_at: new Date(Date.now() + 60000),
    reserved_quota: 1000,
    limit_quota: 1,
    calls: 5,
    max_calls: 1000,
    automatic: true,
  };
  assert.equal(budgetDecision(row, 100), undefined);
  assert.match(
    budgetDecision({ ...row, automatic: false }, 100)!,
    /剩余预算不足/,
  );
  assert.ok(budgetDecision({ ...row, state: "stopped" }, 0));
  assert.ok(budgetDecision({ ...row, calls: 1000 }, 0));
});
